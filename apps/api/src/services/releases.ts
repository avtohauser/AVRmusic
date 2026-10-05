// New releases of the artists people care about (liked in the library, or followed in the catalogue):
// every few hours the catalogue is asked for each artist's latest albums and singles. A release not
// seen before is fetched into the library and announced in the inbox of everyone who follows the
// artist ("Новый релиз"). The first look at an artist only notes what is already out.
import type { DB } from '../lib/db.js';
import { config } from '../config.js';
import { newId } from '../lib/util.js';
import { rawArtistAlbumsPage } from './catalog.js';
import { enqueue, findJob } from './jobs.js';

const HOUR = 3600_000;

/** Everyone following a catalogue artist: a like on the library artist, or a follow. */
function followersOf(db: DB, deezerArtistId: number): string[] {
  return (db.prepare(`SELECT l.user_id u FROM likes l JOIN artists a ON a.id = l.entity_id WHERE l.entity_type = 'artist' AND a.deezer_id = ?
    UNION SELECT user_id u FROM artist_follows WHERE deezer_artist_id = ?`).all(deezerArtistId, deezerArtistId) as any[]).map((r) => r.u as string);
}

function followedArtists(db: DB): Array<{ id: number; name: string }> {
  return db.prepare(`SELECT a.deezer_id id, a.name FROM artists a WHERE a.deezer_id IS NOT NULL AND a.id IN (SELECT entity_id FROM likes WHERE entity_type = 'artist')
    UNION SELECT deezer_artist_id id, name FROM artist_follows`).all() as any[];
}

/** One pass over the followed artists. Returns how many new releases were found. */
export async function checkReleases(db: DB, opts: { pause?: number } = {}): Promise<number> {
  const recent = Date.now() - 60 * 24 * HOUR;
  const known = db.prepare('SELECT 1 FROM release_seen WHERE artist_deezer_id = ? LIMIT 1');
  const seen = db.prepare('SELECT 1 FROM release_seen WHERE artist_deezer_id = ? AND album_deezer_id = ?');
  const mark = db.prepare('INSERT OR IGNORE INTO release_seen (artist_deezer_id, album_deezer_id) VALUES (?, ?)');
  const notice = db.prepare('INSERT INTO shares (id, from_user, to_user, kind, ref_id, message) VALUES (?, NULL, ?, ?, ?, ?)');
  let found = 0;
  for (const a of followedArtists(db)) {
    const albums = await rawArtistAlbumsPage(db, a.id, 15).catch(() => [] as any[]);
    if (!albums.length) continue;
    // the first look only notes what is already out
    if (!known.get(a.id)) { for (const al of albums) mark.run(a.id, al.id); continue; }
    for (const al of albums) {
      if (seen.get(a.id, al.id)) continue;
      mark.run(a.id, al.id);
      const date = Date.parse(al.release_date ?? '');
      if (!date || date < recent) continue;
      found++;
      const info = JSON.stringify({ title: al.title, artist: a.name, coverUrl: al.cover_xl ?? al.cover_big ?? null, type: al.record_type ?? 'album', year: Number(String(al.release_date).slice(0, 4)) || null });
      for (const u of followersOf(db, a.id)) notice.run(newId(), u, 'release', String(al.id), info);
      // into the library, so it plays at once from the notification
      if (config.acquireRole !== 'off' && !findJob((j) => j.kind === 'acquire' && (j.payload as any)?.kind === 'album' && (j.payload as any)?.id === al.id)) {
        enqueue({ kind: 'acquire', title: `${a.name} — ${al.title} (новый релиз)`, requestedBy: null }, { kind: 'album', id: al.id });
      }
    }
    if (opts.pause) await new Promise((r) => setTimeout(r, opts.pause));
  }
  return found;
}

export function startReleaseWatch(db: DB) {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try { await checkReleases(db, { pause: 1500 }); } catch { /* next time */ } finally { busy = false; }
  };
  setTimeout(tick, 10 * 60_000).unref();
  setInterval(tick, 6 * HOUR).unref();
}
