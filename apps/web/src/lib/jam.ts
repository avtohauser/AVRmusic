// Listening together: while in a session the player's buttons act on the shared queue on the server,
// and every change anyone makes (play, pause, seek, skip, add) comes back here and is applied.
import { create } from 'zustand';
import type { Track } from '@avrmusic/shared';
import { usePlayer } from '@/stores/player';
import { useUI } from '@/stores/ui';
import { api } from './api';
import { resumeAt } from './audio';
import { sendToFriends, trNow, type JamView } from './social';

export const useJam = create<{ view: JamView | null }>(() => ({ view: null }));
export const inJam = () => !!useJam.getState().view;

type Actions = Pick<ReturnType<typeof usePlayer.getState>,
  'toggle' | 'play' | 'pause' | 'next' | 'prev' | 'seek' | 'jumpTo' | 'playTracks' | 'playTrack' | 'addToQueue' | 'playNext' | 'removeFromQueue' | 'moveInQueue' | 'toggleShuffle' | 'clearQueue'>;
let base: Actions | null = null;
let polling = 0;

const real = (tracks: Track[]) => tracks.filter((t) => !t.id.startsWith('dz:'));
const toast = (ru: string, en: string, kind?: 'error' | 'success') => useUI.getState().toast(trNow(ru, en), kind);

/** Start a session from what plays now. */
export async function startJam() {
  const p = usePlayer.getState();
  const tracks = real(p.queue);
  const cur = p.queue[p.index];
  const v = await api.post<JamView>('/api/jam', { trackIds: tracks.map((t) => t.id), index: Math.max(0, tracks.findIndex((t) => t.id === cur?.id)), positionMs: Math.round(p.position * 1000), playing: p.playing });
  enter(v);
  return v;
}

export async function joinJam(id: string) {
  try { enter(await api.post<JamView>(`/api/jam/${id}/join`, {})); toast('Вы слушаете вместе', 'Listening together', 'success'); }
  catch (e: any) { useUI.getState().toast(e.message, 'error'); }
}

export async function leaveJam() {
  exit();
  await api.post('/api/jam/leave', {}).catch(() => {});
}

/** After a reload: back into the session this listener is in. */
export async function resumeJam() {
  const v = await api.get<JamView | null>('/api/jam').catch(() => null);
  if (v) enter(v);
}

function enter(v: JamView) {
  hook();
  apply(v);
  void poll(v.id);
}

function exit() {
  polling++;
  if (base) usePlayer.setState(base);
  base = null;
  useJam.setState({ view: null });
}

async function poll(id: string) {
  const me = ++polling;
  while (me === polling) {
    try {
      const v = await api.get<JamView | null>(`/api/jam/${id}?v=${useJam.getState().view?.version ?? 0}`);
      if (me !== polling) return;
      if (!v) { exit(); toast('Совместное прослушивание закончилось', 'The session has ended'); return; }
      apply(v);
    } catch (e: any) {
      if (e?.status === 404 || e?.status === 403) { exit(); toast('Совместное прослушивание закончилось', 'The session has ended'); return; }
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

/** Make the local player match the session. */
function apply(v: JamView) {
  useJam.setState({ view: v });
  const p = usePlayer.getState();
  const want = v.queue[v.index];
  if (!want) { if (p.playing) usePlayer.setState({ playing: false }); return; }
  const pos = v.positionMs / 1000;
  const sameList = v.queue.length === p.queue.length && v.queue.every((t, i) => t.id === p.queue[i]?.id);
  const sameTrack = p.queue[p.index]?.id === want.id;
  if (!sameList || p.index !== v.index) {
    if (!sameTrack) resumeAt(want.id, pos);
    usePlayer.setState({
      queue: v.queue, original: v.queue, index: v.index, shuffle: false, context: `jam:${v.id}`, playing: v.playing,
      ...(sameTrack ? {} : { position: pos, duration: want.durationMs / 1000, nonce: p.nonce + 1 }),
    });
    if (sameTrack && Math.abs(p.position - pos) > 2.5) base?.seek(pos);
    return;
  }
  if (p.playing !== v.playing) usePlayer.setState({ playing: v.playing });
  if (Math.abs(p.position - pos) > 2.5) base?.seek(pos);
}

async function op(o: Record<string, unknown>) {
  const v = useJam.getState().view;
  if (!v) return;
  try { apply(await api.post<JamView>(`/api/jam/${v.id}/op`, o)); }
  catch (e: any) { useUI.getState().toast(e.message, 'error'); }
}

function hook() {
  if (base) return;
  const p = usePlayer.getState();
  base = { toggle: p.toggle, play: p.play, pause: p.pause, next: p.next, prev: p.prev, seek: p.seek, jumpTo: p.jumpTo, playTracks: p.playTracks, playTrack: p.playTrack, addToQueue: p.addToQueue, playNext: p.playNext, removeFromQueue: p.removeFromQueue, moveInQueue: p.moveInQueue, toggleShuffle: p.toggleShuffle, clearQueue: p.clearQueue };
  const b = base;
  const replace = (tracks: Track[], start = 0) => {
    const list = real(tracks);
    if (!list.length) { toast('Этот трек ещё не на сервере — добавьте его, когда скачается', 'This track is not on the server yet', 'error'); return; }
    void op({ op: 'replace', trackIds: list.map((t) => t.id), index: Math.max(0, list.indexOf(tracks[start])) });
  };
  usePlayer.setState({
    toggle: () => { const on = !usePlayer.getState().playing; b.toggle(); void op({ op: on ? 'play' : 'pause' }); },
    play: () => { b.play(); void op({ op: 'play' }); },
    pause: () => { b.pause(); void op({ op: 'pause' }); },
    next: (auto = false) => {
      const s = usePlayer.getState();
      if (auto && s.repeat === 'one') { b.next(true); return; }
      // the same index from everyone whose song ended moves the session once
      void op(s.index + 1 < s.queue.length ? { op: 'skip', index: s.index + 1 } : { op: 'pause' });
    },
    prev: () => void op({ op: 'prev' }),
    seek: (sec) => { b.seek(sec); void op({ op: 'seek', positionMs: Math.round(sec * 1000) }); },
    jumpTo: (i) => void op({ op: 'skip', index: i }),
    playTracks: (tracks, start = 0) => replace(tracks, start),
    playTrack: (t) => replace([t], 0),
    addToQueue: (tracks) => { const l = real(tracks); if (l.length) void op({ op: 'add', trackIds: l.map((t) => t.id) }); },
    playNext: (tracks) => { const l = real(tracks); if (l.length) void op({ op: 'add', trackIds: l.map((t) => t.id), next: true }); },
    removeFromQueue: (i) => void op({ op: 'remove', index: i }),
    moveInQueue: (from, to) => void op({ op: 'move', from, to }),
    toggleShuffle: () => toast('В совместном прослушивании порядок общий', 'The order is shared while listening together'),
    clearQueue: () => toast('В совместном прослушивании очередь общая', 'The queue is shared while listening together'),
  });
}

/** Start a session from what plays now (or keep the current one) and invite friends to it. */
export async function listenTogether(tr: (ru: string, en: string) => string) {
  try {
    const v = useJam.getState().view ?? await startJam();
    sendToFriends('jam', v.id, '');
  } catch (e: any) { useUI.getState().toast(e.message ?? tr('Не получилось', 'Failed'), 'error'); }
}
