// Instant play from the catalogue: a song not on the server yet plays in full at once (the server passes
// its source through while it fetches it); once it is in the library the queue item becomes the
// library's track (the engine keeps playing — see audio.ts).
import type { CatalogTrack, Track } from '@avrmusic/shared';
import { api } from './api';
import { usePlayer } from '@/stores/player';
import { useUI } from '@/stores/ui';
import { trNow } from './social';

/** a catalogue id ("dz:…") that became a library track while playing */
export const aliases = new Map<string, string>();
/** catalogue songs whose straight-away stream failed: they start over once the server has them */
export const broken = new Set<string>();

/** The engine couldn't play a catalogue song (its source refused): wait for the server's copy instead. */
export function streamFailed(id: string) {
  if (broken.has(id)) return;
  broken.add(id);
  useUI.getState().toast(trNow('Трек ещё скачивается на сервер — включу, как только будет готов', 'The track is still being fetched — it will start as soon as it is ready'));
  watch();
}

/** a library artist's page, or a catalogue search for a song still on its way to the server */
export const artistHref = (a: { id: string; name: string }) => (a.id ? `/artist/${a.id}` : `/search?scope=catalog&q=${encodeURIComponent(a.name)}`);

export function catalogAsTrack(t: CatalogTrack): Track {
  return {
    id: t.libraryTrackId ?? `dz:${t.id}`, title: t.title, durationMs: t.durationMs, explicit: t.explicit, coverUrl: t.album?.coverUrl ?? null,
    artist: { id: '', name: t.artist.name, imageUrl: t.artist.imageUrl ?? null },
    featuring: t.featuring.map((f) => ({ id: '', name: f.name, imageUrl: f.imageUrl ?? null })),
    album: t.album ? { id: '', title: t.album.title } : null,
    hasCanvas: false, hasLyrics: false, hasSyncedLyrics: false,
  } as unknown as Track;
}

export async function playCatalog(list: CatalogTrack[], index: number, context = 'catalog') {
  const i = Math.max(0, Math.min(index, list.length - 1));
  try {
    const r = await api.post<{ track: Track; ready: boolean }>('/api/catalog/play', { id: list[i].id });
    const tracks = list.map((t, n) => (n === i ? r.track : catalogAsTrack(t)));
    if (!r.ready) useUI.getState().toast(trNow('Играет сразу целиком — трек уже скачивается на сервер', 'Playing in full right away — the track is being fetched to the server'));
    usePlayer.getState().playTracks(tracks, i, context);
    watch();
  } catch (e: any) { useUI.getState().toast(e.message, 'error'); }
}

const following = new Set<string>();

/** While "dz:" tracks are queued, ask now and then whether they are in the library yet. */
function watch() {
  for (const t of usePlayer.getState().queue) {
    if (!t.id.startsWith('dz:') || following.has(t.id)) continue;
    following.add(t.id);
    const id = t.id;
    let tries = 0;
    const timer = setInterval(async () => {
      if (++tries > 60 || !usePlayer.getState().queue.some((q) => q.id === id)) { clearInterval(timer); following.delete(id); return; }
      const s = await api.get<{ status: string; track?: Track }>(`/api/catalog/play/${id.slice(3)}/status`).catch(() => null);
      if (s?.status === 'ready' && s.track) {
        clearInterval(timer); following.delete(id);
        aliases.set(id, s.track.id);
        const real = s.track;
        usePlayer.setState((st) => ({ queue: st.queue.map((q) => (q.id === id ? real : q)), original: st.original.map((q) => (q.id === id ? real : q)) }));
      } else if (s?.status === 'failed') {
        clearInterval(timer); following.delete(id);
        if (broken.delete(id)) useUI.getState().toast(trNow('Этот трек не удалось найти — попробуйте другую версию', 'Could not find this track — try another version'), 'error');
      }
    }, 5000);
  }
}
