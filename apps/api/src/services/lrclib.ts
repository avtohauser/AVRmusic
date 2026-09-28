// Synced lyrics lookup via the open LRCLIB API (https://lrclib.net) — no key needed.
import type { DB } from '../lib/db.js';
import { config } from '../config.js';
import { parseLrc } from '../lib/lyrics.js';

interface LrcLibHit { id: number; trackName: string; artistName: string; albumName: string; duration: number; instrumental: boolean; plainLyrics: string | null; syncedLyrics: string | null }

const UA = `AVRmusic/${config.version} (self-hosted music server)`;

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(12_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`LRCLIB ${res.status}`);
  return res.json();
}

export async function lookupLyrics(q: { artist: string; title: string; album?: string | null; durationSec?: number }): Promise<{ plain: string | null; synced: string | null } | null> {
  const base = config.lrclibUrl;
  const p = new URLSearchParams({ artist_name: q.artist, track_name: q.title });
  if (q.album) p.set('album_name', q.album);
  if (q.durationSec && q.durationSec > 0) p.set('duration', String(Math.round(q.durationSec)));
  let hit: LrcLibHit | null = null;
  try {
    hit = await getJson(`${base}/api/get?${p}`);
  } catch { /* fall through to search */ }
  if (!hit) {
    const s = new URLSearchParams({ track_name: q.title, artist_name: q.artist });
    const list = (await getJson(`${base}/api/search?${s}`)) as LrcLibHit[] | null;
    if (list?.length) {
      const want = q.durationSec ?? 0;
      hit = list
        .filter((h) => !h.instrumental && (h.syncedLyrics || h.plainLyrics))
        .sort((a, b) => Math.abs(a.duration - want) - Math.abs(b.duration - want))[0] ?? null;
      if (hit && want && Math.abs(hit.duration - want) > 15) hit = null;
    }
  }
  if (!hit) return null;
  const synced = hit.syncedLyrics && parseLrc(hit.syncedLyrics) ? hit.syncedLyrics : null;
  return { plain: hit.plainLyrics ?? null, synced };
}

/** Fetch and store lyrics for one track. Returns true when something was found. */
export async function fetchLyricsForTrack(db: DB, trackId: string): Promise<boolean> {
  const t = db.prepare('SELECT t.id, t.title, t.duration_ms, ar.name artist, al.title album FROM tracks t JOIN artists ar ON ar.id=t.artist_id LEFT JOIN albums al ON al.id=t.album_id WHERE t.id = ?').get(trackId) as any;
  if (!t) return false;
  const r = await lookupLyrics({ artist: t.artist, title: t.title, album: t.album, durationSec: t.duration_ms / 1000 });
  if (!r || (!r.plain && !r.synced)) return false;
  db.prepare(`UPDATE tracks SET lyrics_synced = ?, lyrics_plain = ?, lyrics_source = 'lrclib' WHERE id = ?`).run(r.synced, r.plain ?? (r.synced ? null : null), trackId);
  if (r.synced && !r.plain) {
    const { lrcToPlain } = await import('../lib/lyrics.js');
    db.prepare('UPDATE tracks SET lyrics_plain = ? WHERE id = ?').run(lrcToPlain(r.synced), trackId);
  }
  return true;
}
