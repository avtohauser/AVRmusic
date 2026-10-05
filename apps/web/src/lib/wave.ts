// "My Wave" on the client: starts the stream, keeps the queue topped up as it plays, remembers why
// each track was picked (shown in the player like a DJ's line) and sends 👎 back to the server.
import { create } from 'zustand';
import type { WaveBatch, WaveMode, WaveTrack } from '@avrmusic/shared';
import { api } from './api';
import { usePlayer } from '@/stores/player';

export const WAVE_CONTEXT = 'wave';
export const WAVE_MODES: Array<{ id: WaveMode; label: string; icon: string; hint: string }> = [
  { id: 'mix', label: 'Микс', icon: 'all_inclusive', hint: 'Любимое и новое вперемешку' },
  { id: 'favorites', label: 'Любимое', icon: 'favorite', hint: 'То, что вы слушаете чаще всего' },
  { id: 'discover', label: 'Незнакомое', icon: 'explore', hint: 'Новые для вас исполнители рядом с любимыми' },
  { id: 'popular', label: 'Популярное', icon: 'local_fire_department', hint: 'Что слушают друзья' },
];

/** moods and activities: the wave picks by tempo, energy and genre */
export const WAVE_MOODS: Array<{ id: WaveMode; label: string; icon: string; hint: string }> = [
  { id: 'run', label: 'Бег', icon: 'directions_run', hint: 'Быстро и бодро — под шаг' },
  { id: 'focus', label: 'Фокус', icon: 'center_focus_strong', hint: 'Спокойное, без лишних слов — для работы и учёбы' },
  { id: 'evening', label: 'Вечер', icon: 'wb_twilight', hint: 'Медленное и тёплое' },
  { id: 'party', label: 'Вечеринка', icon: 'celebration', hint: 'Танцевальное и громкое' },
];

interface WaveState { mode: WaveMode; reasons: Record<string, string>; loading: boolean; setMode: (m: WaveMode) => void }
export const useWave = create<WaveState>((set) => ({
  mode: (() => { try { return (localStorage.getItem('avr.waveMode') as WaveMode) || 'mix'; } catch { return 'mix'; } })(),
  reasons: {},
  loading: false,
  setMode: (mode) => { try { localStorage.setItem('avr.waveMode', mode); } catch { /* ignore */ } set({ mode }); },
}));

const remember = (tracks: WaveTrack[]) => useWave.setState((s) => ({ reasons: { ...s.reasons, ...Object.fromEntries(tracks.map((t) => [t.id, t.reason])) } }));

async function fetchBatch(exclude: string[]): Promise<WaveTrack[]> {
  const r = await api.post<WaveBatch>('/api/wave/next', { mode: useWave.getState().mode, count: 10, exclude: exclude.slice(-300) });
  remember(r.tracks);
  return r.tracks;
}

export const waveActive = () => usePlayer.getState().context === WAVE_CONTEXT;

/** Start (or restart, e.g. after changing the mode) the wave. */
export async function startWave(mode?: WaveMode) {
  if (mode) useWave.getState().setMode(mode);
  useWave.setState({ loading: true });
  try {
    const p = usePlayer.getState();
    const recent = p.queue.slice(Math.max(0, p.index - 30), p.index + 1).map((t) => t.id);
    const tracks = await fetchBatch(recent);
    if (!tracks.length) throw new Error('Пока нечего включить: в медиатеке мало треков');
    usePlayer.getState().playTracks(tracks, 0, WAVE_CONTEXT);
  } finally { useWave.setState({ loading: false }); }
}

/** 👎: never again in the wave, and the next track starts. */
export async function dislikeInWave(trackId: string) {
  usePlayer.getState().next();
  await api.post('/api/wave/feedback', { trackId, value: -1 }).catch(() => {});
}

/** Keeps the wave endless: when two tracks are left, the next batch is appended. */
let topping = false;
export function initWave() {
  usePlayer.subscribe((st) => {
    if (st.context !== WAVE_CONTEXT || topping || st.queue.length - st.index > 3) return;
    topping = true;
    fetchBatch(st.queue.map((t) => t.id))
      .then((tracks) => { if (tracks.length && usePlayer.getState().context === WAVE_CONTEXT) usePlayer.getState().addToQueue(tracks); })
      .catch(() => {})
      .finally(() => { topping = false; });
  });
}
