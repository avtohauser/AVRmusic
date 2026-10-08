// Listening along with a friend: the player follows what they play — the same song at the same moment,
// a new song when they switch, a pause when they pause — until the listener plays something of their own
// or stops it. The friend's app does nothing special: it reports what it plays anyway.
import { create } from 'zustand';
import type { FriendRef, Track } from '@avrmusic/shared';
import { usePlayer } from '@/stores/player';
import { useUI } from '@/stores/ui';
import { api } from './api';
import { resumeAt } from './audio';
import { inJam, leaveJam } from './jam';
import { trNow } from './social';

interface FriendNow { track: Track; positionMs: number; playing: boolean }

export const FOLLOW = 'follow';
export const useFollow = create<{ friend: FriendRef | null }>(() => ({ friend: null }));

let run = 0;
const say = (ru: string, en: string) => useUI.getState().toast(trNow(ru, en));

export async function startFollow(f: FriendRef) {
  if (inJam()) await leaveJam();
  stopFollow(true);
  useFollow.setState({ friend: f });
  say(`Вы слушаете вместе с ${f.displayName}`, `Listening along with ${f.displayName}`);
  const me = ++run;
  let version: number | null = null;
  let silentSince = 0;
  while (me === run) {
    let r: { version: number; now: FriendNow | null };
    try { r = await api.get(`/api/users/${f.id}/now${version !== null ? `?v=${version}` : ''}`); }
    catch { await new Promise((ok) => setTimeout(ok, 3000)); continue; }
    if (me !== run) return;
    version = r.version;
    if (!r.now) {
      // the friend stopped (or closed the app): pause, and after a few minutes stop following
      if (!silentSince) silentSince = Date.now();
      const p = usePlayer.getState();
      if (p.playing && p.context === FOLLOW) p.pause();
      if (Date.now() - silentSince > 5 * 60_000) { stopFollow(true); say(`${f.displayName} больше не слушает — вы снова сами по себе`, `${f.displayName} stopped listening — you're on your own again`); return; }
      await new Promise((ok) => setTimeout(ok, 4000));
      continue;
    }
    silentSince = 0;
    apply(r.now);
  }
}

/** The friend's song at their moment; play / pause as they do; a seek when we drift apart. */
function apply(n: FriendNow) {
  const p = usePlayer.getState();
  const pos = n.positionMs / 1000;
  if (p.queue[p.index]?.id !== n.track.id || p.context !== FOLLOW) {
    resumeAt(n.track.id, pos + 0.7);
    p.playTracks([n.track], 0, FOLLOW);
    if (!n.playing) usePlayer.setState({ playing: false });
    return;
  }
  if (p.playing !== n.playing) usePlayer.setState({ playing: n.playing });
  if (n.playing && Math.abs(p.position - pos) > 4) p.seek(pos);
}

/** The listener played something of their own (or tapped "stop"): no more following. */
export function stopFollow(quiet = false) {
  const f = useFollow.getState().friend;
  if (!f) return;
  run++;
  useFollow.setState({ friend: null });
  if (!quiet) say(`Вы больше не слушаете с ${f.displayName}`, `You stopped listening with ${f.displayName}`);
}

// anything else played here (a song of one's own, a jam) ends it
usePlayer.subscribe((st, prev) => {
  if (useFollow.getState().friend && st.context !== FOLLOW && st.context !== prev.context) stopFollow();
});
