import { create } from 'zustand';
import type { Track } from '@avrmusic/shared';

export type Repeat = 'off' | 'all' | 'one';

interface PlayerState {
  queue: Track[];
  /** Unshuffled order, kept so shuffle can be toggled off without losing the original list. */
  original: Track[];
  index: number;
  playing: boolean;
  loading: boolean;
  position: number;
  duration: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: Repeat;
  rate: number;
  context: string | null;
  /** Incremented whenever the current track should (re)start from 0 — lets the engine distinguish "same track, play again". */
  nonce: number;
  sleepAt: number | null;

  current: () => Track | null;
  playTracks: (tracks: Track[], startIndex?: number, context?: string) => void;
  playTrack: (track: Track, context?: string) => void;
  toggle: () => void;
  play: () => void;
  pause: () => void;
  next: (auto?: boolean) => void;
  prev: () => void;
  seek: (sec: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setRate: (r: number) => void;
  addToQueue: (tracks: Track[]) => void;
  playNext: (tracks: Track[]) => void;
  removeFromQueue: (i: number) => void;
  jumpTo: (i: number) => void;
  clearQueue: () => void;
  moveInQueue: (from: number, to: number) => void;
  setSleep: (minutes: number | null) => void;
  /* engine callbacks */
  _setProgress: (position: number, duration: number) => void;
  _setLoading: (v: boolean) => void;
  _setPlaying: (v: boolean) => void;
}

function shuffled<T>(arr: T[], keepFirst?: T): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  if (keepFirst !== undefined) {
    const k = a.indexOf(keepFirst);
    if (k > 0) { a.splice(k, 1); a.unshift(keepFirst); }
  }
  return a;
}

const savedVolume = (() => { try { return Number(localStorage.getItem('avr.volume') ?? 0.8); } catch { return 0.8; } })();

export const usePlayer = create<PlayerState>((set, get) => ({
  queue: [],
  original: [],
  index: -1,
  playing: false,
  loading: false,
  position: 0,
  duration: 0,
  volume: Number.isFinite(savedVolume) ? savedVolume : 0.8,
  muted: false,
  shuffle: false,
  repeat: 'off',
  rate: 1,
  context: null,
  nonce: 0,
  sleepAt: null,

  current: () => get().queue[get().index] ?? null,

  playTracks(tracks, startIndex = 0, context) {
    if (!tracks.length) return;
    const start = tracks[startIndex] ?? tracks[0];
    const queue = get().shuffle ? shuffled(tracks, start) : tracks.slice();
    set({ original: tracks.slice(), queue, index: queue.indexOf(start), playing: true, position: 0, duration: start.durationMs / 1000, context: context ?? null, nonce: get().nonce + 1 });
  },
  playTrack(track, context) { get().playTracks([track], 0, context); },
  toggle() { if (get().index < 0) return; set({ playing: !get().playing }); },
  play() { if (get().index >= 0) set({ playing: true }); },
  pause() { set({ playing: false }); },
  next(auto = false) {
    const { queue, index, repeat } = get();
    if (!queue.length) return;
    if (auto && repeat === 'one') { set({ position: 0, nonce: get().nonce + 1, playing: true }); return; }
    let i = index + 1;
    if (i >= queue.length) {
      if (repeat === 'all' || !auto) i = 0;
      else { set({ playing: false, position: 0 }); return; }
    }
    set({ index: i, position: 0, duration: queue[i].durationMs / 1000, playing: true, nonce: get().nonce + 1 });
  },
  prev() {
    const { queue, index, position } = get();
    if (!queue.length) return;
    if (position > 3 || index === 0) { set({ position: 0, nonce: get().nonce + 1 }); return; }
    const i = index - 1;
    set({ index: i, position: 0, duration: queue[i].durationMs / 1000, playing: true, nonce: get().nonce + 1 });
  },
  seek(sec) { set({ position: sec, nonce: get().nonce }); seekRequest = sec; },
  setVolume(v) { v = Math.max(0, Math.min(1, v)); try { localStorage.setItem('avr.volume', String(v)); } catch { /* ignore */ } set({ volume: v, muted: false }); },
  toggleMute() { set({ muted: !get().muted }); },
  toggleShuffle() {
    const { shuffle, queue, original, index } = get();
    const cur = queue[index];
    if (shuffle) {
      const q = original.length ? original : queue;
      set({ shuffle: false, queue: q, index: Math.max(0, q.indexOf(cur)) });
    } else {
      const q = shuffled(queue, cur);
      set({ shuffle: true, original: queue.slice(), queue: q, index: 0 });
    }
  },
  cycleRepeat() { const r = get().repeat; set({ repeat: r === 'off' ? 'all' : r === 'all' ? 'one' : 'off' }); },
  setRate(rate) { set({ rate }); },
  addToQueue(tracks) {
    const { queue, index } = get();
    if (index < 0) { get().playTracks(tracks, 0, 'queue'); return; }
    set({ queue: [...queue, ...tracks], original: [...get().original, ...tracks] });
  },
  playNext(tracks) {
    const { queue, index } = get();
    if (index < 0) { get().playTracks(tracks, 0, 'queue'); return; }
    const q = queue.slice();
    q.splice(index + 1, 0, ...tracks);
    set({ queue: q, original: [...get().original, ...tracks] });
  },
  removeFromQueue(i) {
    const { queue, index } = get();
    if (i === index) return;
    const q = queue.slice();
    q.splice(i, 1);
    set({ queue: q, index: i < index ? index - 1 : index });
  },
  jumpTo(i) {
    const { queue } = get();
    if (!queue[i]) return;
    set({ index: i, position: 0, duration: queue[i].durationMs / 1000, playing: true, nonce: get().nonce + 1 });
  },
  clearQueue() {
    const cur = get().current();
    set({ queue: cur ? [cur] : [], original: cur ? [cur] : [], index: cur ? 0 : -1 });
  },
  moveInQueue(from, to) {
    const { queue, index } = get();
    if (from === to || !queue[from]) return;
    const q = queue.slice();
    const [item] = q.splice(from, 1);
    q.splice(to, 0, item);
    let ni = index;
    if (from === index) ni = to;
    else if (from < index && to >= index) ni = index - 1;
    else if (from > index && to <= index) ni = index + 1;
    set({ queue: q, index: ni });
  },
  setSleep(minutes) { set({ sleepAt: minutes ? Date.now() + minutes * 60000 : null }); },

  _setProgress: (position, duration) => set({ position, duration: duration || get().duration }),
  _setLoading: (loading) => set({ loading }),
  _setPlaying: (playing) => set({ playing }),
}));

/** Pending seek (seconds) consumed by the audio engine. */
export let seekRequest: number | null = null;
export function consumeSeek(): number | null {
  const s = seekRequest;
  seekRequest = null;
  return s;
}
