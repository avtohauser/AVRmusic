// Global catalogue backed by the public Deezer API (metadata, covers, 30-second previews; no key needed).
// Responses are cached in SQLite so a small group of users never hits Deezer's rate limit.
import type { DB } from '../lib/db.js';
import type { CatalogAlbum, CatalogAlbumPage, CatalogArtist, CatalogArtistPage, CatalogArtistSummary, CatalogSearchResult, CatalogTrack } from '@avrmusic/shared';
import { config } from '../config.js';
import { nameKey } from '../lib/util.js';
import { HttpError } from '../lib/errors.js';

const TTL_MS = { search: 6 * 3600_000, entity: 24 * 3600_000 };
const UA = `AVRmusic/${config.version}`;

export class CatalogError extends HttpError {
  constructor(message: string, status = 502) { super(status, message, 'catalog'); }
}

async function dz(db: DB, path: string, ttl = TTL_MS.entity): Promise<any> {
  const key = `dz:${path}`;
  const cached = db.prepare('SELECT json, fetched_at FROM catalog_cache WHERE key = ?').get(key) as any;
  if (cached && Date.now() - cached.fetched_at < ttl) return JSON.parse(cached.json);
  let res: Response;
  try {
    res = await fetch(`${config.deezerApi}${path}`, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
  } catch (e: any) {
    if (cached) return JSON.parse(cached.json); // stale but better than nothing
    throw new CatalogError(`Каталог недоступен: ${e?.message ?? e}`);
  }
  if (!res.ok) { if (cached) return JSON.parse(cached.json); throw new CatalogError(`Каталог ответил ${res.status}`); }
  const json: any = await res.json();
  if (json && json.error) {
    if (json.error.code === 800 || /no data/i.test(json.error.message ?? '')) throw new CatalogError('Не найдено в каталоге', 404);
    if (json.error.code === 4) { if (cached) return JSON.parse(cached.json); throw new CatalogError('Каталог: превышен лимит запросов, попробуйте через минуту', 429); }
    throw new CatalogError(json.error.message || 'Ошибка каталога');
  }
  db.prepare('INSERT OR REPLACE INTO catalog_cache(key, json, fetched_at) VALUES (?,?,?)').run(key, JSON.stringify(json), Date.now());
  return json;
}

/* ---------- mapping ---------- */

const FEAT_RE = /[\(\[]?\s*(?:feat\.?|ft\.?|featuring|при уч\.?)\s+([^\)\]]+)[\)\]]?/i;
export function parseFeaturing(title: string, titleShort?: string): { title: string; featuring: string[] } {
  const m = FEAT_RE.exec(title);
  if (!m) return { title: titleShort || title, featuring: [] };
  const names = m[1].split(/\s*[,&;]\s*|\s+and\s+|\s+и\s+/i).map((s) => s.trim()).filter(Boolean);
  const clean = (titleShort && titleShort !== title ? titleShort : title.replace(FEAT_RE, '')).replace(/\s{2,}/g, ' ').replace(/\(\s*\)|\[\s*\]/g, '').trim();
  return { title: clean || title, featuring: names };
}

const artistSummary = (a: any): CatalogArtistSummary => ({ id: Number(a.id), name: a.name, imageUrl: a.picture_xl || a.picture_big || a.picture_medium || null });
const recordType = (t: string | undefined): CatalogAlbum['type'] => (t === 'single' ? 'single' : t === 'ep' ? 'ep' : t === 'compile' ? 'compilation' : 'album');

class Linker {
  private artistByDz; private artistByName; private albumByDz; private albumCount; private trackByDz; private trackByName;
  constructor(private db: DB) {
    this.artistByDz = db.prepare('SELECT id FROM artists WHERE deezer_id = ?');
    this.artistByName = db.prepare('SELECT id FROM artists WHERE name_key = ?');
    this.albumByDz = db.prepare('SELECT id FROM albums WHERE deezer_id = ?');
    this.albumCount = db.prepare('SELECT COUNT(*) c FROM tracks WHERE album_id = ?');
    this.trackByDz = db.prepare('SELECT id FROM tracks WHERE deezer_id = ?');
    this.trackByName = db.prepare('SELECT t.id FROM tracks t JOIN artists a ON a.id = t.artist_id WHERE a.name_key = ? AND lower(t.title) = lower(?) LIMIT 1');
  }
  artist(dzId: number, name: string): string | null {
    return ((this.artistByDz.get(dzId) as any) ?? (this.artistByName.get(nameKey(name)) as any))?.id ?? null;
  }
  album(dzId: number): { id: string | null; count: number } {
    const r = this.albumByDz.get(dzId) as any;
    if (!r) return { id: null, count: 0 };
    return { id: r.id, count: (this.albumCount.get(r.id) as any).c };
  }
  track(dzId: number, artist: string, title: string): string | null {
    return ((this.trackByDz.get(dzId) as any) ?? (this.trackByName.get(nameKey(artist), title) as any))?.id ?? null;
  }
}

function mapArtist(l: Linker, a: any): CatalogArtist {
  return { ...artistSummary(a), fans: Number(a.nb_fan ?? 0), albumCount: Number(a.nb_album ?? 0), libraryArtistId: l.artist(Number(a.id), a.name) };
}
function mapAlbum(l: Linker, a: any, artist?: any): CatalogAlbum {
  const link = l.album(Number(a.id));
  const ar = a.artist ?? artist ?? { id: 0, name: '' };
  return {
    id: Number(a.id), title: a.title, coverUrl: a.cover_xl || a.cover_big || a.cover_medium || null, type: recordType(a.record_type),
    year: a.release_date ? Number(String(a.release_date).slice(0, 4)) || null : null, releaseDate: a.release_date ?? null,
    trackCount: Number(a.nb_tracks ?? 0), explicit: !!a.explicit_lyrics, artist: artistSummary(ar), libraryAlbumId: link.id, inLibrary: link.count,
  };
}
export function mapTrack(l: Linker, t: any, album?: any): CatalogTrack {
  const { title, featuring } = parseFeaturing(t.title ?? '', t.title_short);
  const al = t.album ?? album;
  const contributors: any[] = Array.isArray(t.contributors) ? t.contributors.filter((c: any) => c.id !== t.artist?.id) : [];
  return {
    id: Number(t.id), title, durationMs: Number(t.duration ?? 0) * 1000, explicit: !!t.explicit_lyrics, previewUrl: t.preview || null,
    trackNo: t.track_position ?? null, discNo: t.disk_number ?? null,
    artist: artistSummary(t.artist ?? al?.artist ?? { id: 0, name: '' }),
    featuring: contributors.length ? contributors.map(artistSummary) : featuring.map((n) => ({ id: 0, name: n, imageUrl: null })),
    album: al ? { id: Number(al.id), title: al.title, coverUrl: al.cover_xl || al.cover_big || al.cover_medium || null } : null,
    libraryTrackId: l.track(Number(t.id), t.artist?.name ?? '', title),
  };
}

/* ---------- queries ---------- */

export async function searchCatalog(db: DB, q: string, limit = 10): Promise<CatalogSearchResult> {
  q = q.trim();
  const empty: CatalogSearchResult = { query: q, top: null, artists: [], albums: [], tracks: [] };
  if (!q) return empty;
  const l = new Linker(db);
  const enc = encodeURIComponent(q);
  const [tr, ar, al] = await Promise.all([
    dz(db, `/search/track?q=${enc}&limit=${limit}`, TTL_MS.search).catch(() => ({ data: [] })),
    dz(db, `/search/artist?q=${enc}&limit=${limit}`, TTL_MS.search).catch(() => ({ data: [] })),
    dz(db, `/search/album?q=${enc}&limit=${limit}`, TTL_MS.search).catch(() => ({ data: [] })),
  ]);
  const out: CatalogSearchResult = { ...empty, tracks: (tr.data ?? []).map((t: any) => mapTrack(l, t)), artists: (ar.data ?? []).map((a: any) => mapArtist(l, a)), albums: (al.data ?? []).map((a: any) => mapAlbum(l, a)) };
  const lq = q.toLowerCase();
  const a = out.artists.find((x) => x.name.toLowerCase() === lq) ?? (out.artists[0] && out.artists[0].name.toLowerCase().startsWith(lq) ? out.artists[0] : undefined);
  if (a) out.top = { kind: 'artist', item: a };
  else if (out.tracks[0]) out.top = { kind: 'track', item: out.tracks[0] };
  else if (out.albums[0]) out.top = { kind: 'album', item: out.albums[0] };
  else if (out.artists[0]) out.top = { kind: 'artist', item: out.artists[0] };
  return out;
}

export async function catalogArtist(db: DB, id: number): Promise<CatalogArtistPage> {
  const l = new Linker(db);
  const a = await dz(db, `/artist/${id}`);
  const [top, albums, related, appears] = await Promise.all([
    dz(db, `/artist/${id}/top?limit=10`).catch(() => ({ data: [] })),
    dz(db, `/artist/${id}/albums?limit=200`).catch(() => ({ data: [] })),
    dz(db, `/artist/${id}/related?limit=12`).catch(() => ({ data: [] })),
    dz(db, `/search/track?q=${encodeURIComponent(`"${a.name}"`)}&limit=40`, TTL_MS.search).catch(() => ({ data: [] })),
  ]);
  const all = (albums.data ?? []).map((x: any) => mapAlbum(l, x, a)).sort((x: CatalogAlbum, y: CatalogAlbum) => (y.releaseDate ?? '').localeCompare(x.releaseDate ?? ''));
  const nameLc = a.name.toLowerCase();
  const appearsOn = (appears.data ?? [])
    .filter((t: any) => t.artist?.id !== a.id && (t.title ?? '').toLowerCase().includes(nameLc))
    .map((t: any) => mapTrack(l, t))
    .slice(0, 20);
  return {
    artist: mapArtist(l, a),
    topTracks: (top.data ?? []).map((t: any) => mapTrack(l, t)),
    albums: all.filter((x: CatalogAlbum) => x.type === 'album'),
    singles: all.filter((x: CatalogAlbum) => x.type === 'single' || x.type === 'ep'),
    compilations: all.filter((x: CatalogAlbum) => x.type === 'compilation'),
    related: (related.data ?? []).map((r: any) => mapArtist(l, r)),
    appearsOn,
  };
}

export async function catalogAlbum(db: DB, id: number): Promise<CatalogAlbumPage> {
  const l = new Linker(db);
  const a = await dz(db, `/album/${id}`);
  const base = mapAlbum(l, a);
  const tracks = ((a.tracks?.data ?? []) as any[]).map((t) => mapTrack(l, { ...t, artist: t.artist ?? a.artist }, a));
  return {
    ...base,
    trackCount: base.trackCount || tracks.length,
    label: a.label ?? null,
    genres: (a.genres?.data ?? []).map((g: any) => g.name),
    durationMs: Number(a.duration ?? 0) * 1000 || tracks.reduce((s, t) => s + t.durationMs, 0),
    contributors: (a.contributors ?? []).map((c: any) => ({ ...artistSummary(c), role: c.role ?? 'Main' })),
    tracks,
  };
}

export async function catalogTrack(db: DB, id: number): Promise<CatalogTrack & { raw: any }> {
  const l = new Linker(db);
  const t = await dz(db, `/track/${id}`);
  return { ...mapTrack(l, t), raw: t };
}

/** Raw album (with tracklist) and raw artist, used by the acquisition pipeline. */
export const rawAlbum = (db: DB, id: number) => dz(db, `/album/${id}`);
export const rawArtist = (db: DB, id: number) => dz(db, `/artist/${id}`);
export const rawArtistAlbums = (db: DB, id: number) => dz(db, `/artist/${id}/albums?limit=200`);
export const rawTrack = (db: DB, id: number) => dz(db, `/track/${id}`);
