// The player remembers its queue: what played, where and in which order comes back when the site is
// opened again. Friends see what this listener plays now (sent on every change and every 15 s).
import type { Track } from '@avrmusic/shared';
import { usePlayer, type Repeat } from '@/stores/player';
import { useAuth } from '@/stores/auth';
import { api } from './api';
import { resumeAt } from './audio';

const KEY = 'avr.session';
interface Saved { queue: Track[]; original: Track[]; index: number; position: number; context: string | null; shuffle: boolean; repeat: Repeat }

let restored = false;

/** Put the last queue back (paused, at the same second) — once, after sign-in is known. */
export function restoreSession() {
  if (restored) return;
  restored = true;
  try {
    const s: Saved | null = JSON.parse(localStorage.getItem(KEY) || 'null');
    const p = usePlayer.getState();
    const cur = s?.queue?.[s.index];
    if (!s || !cur || p.index >= 0 || s.context?.startsWith('jam:')) return;
    resumeAt(cur.id, s.position);
    usePlayer.setState({
      queue: s.queue, original: s.original?.length ? s.original : s.queue, index: s.index, position: s.position, duration: cur.durationMs / 1000,
      context: s.context, shuffle: !!s.shuffle, repeat: s.repeat ?? 'off', playing: false, nonce: p.nonce + 1,
    });
  } catch { /* nothing saved */ }
}

function save() {
  const s = usePlayer.getState();
  try {
    if (s.index < 0 || !s.queue.length) { localStorage.removeItem(KEY); return; }
    // a window around the current track keeps the record small
    const from = Math.max(0, s.index - 100);
    const queue = s.queue.slice(from, s.index + 300);
    const original = s.original.length <= 400 ? s.original : queue;
    localStorage.setItem(KEY, JSON.stringify({ queue, original, index: s.index - from, position: Math.floor(s.position), context: s.context, shuffle: s.shuffle, repeat: s.repeat } satisfies Saved));
  } catch { /* storage full or blocked */ }
}

let lastNow = '';
function sendNow(force = false) {
  if (!useAuth.getState().user) return;
  const s = usePlayer.getState();
  const t = s.queue[s.index];
  const key = `${t?.id ?? ''}|${s.playing}`;
  if (!force && key === lastNow) return;
  lastNow = key;
  api.post('/api/me/now', { trackId: t?.id ?? null, positionMs: Math.round(s.position * 1000), playing: s.playing && !!t }).catch(() => {});
}

export function initSession() {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let savedPos = 0;
  const later = () => { if (!timer) timer = setTimeout(() => { timer = null; save(); }, 1500); };
  usePlayer.subscribe((st, prev) => {
    if (st.queue !== prev.queue || st.index !== prev.index || st.shuffle !== prev.shuffle || st.repeat !== prev.repeat || st.context !== prev.context) later();
    else if (Math.abs(st.position - savedPos) >= 5) { savedPos = st.position; later(); }
    if (st.index !== prev.index || st.queue[st.index]?.id !== prev.queue[prev.index]?.id || st.playing !== prev.playing) sendNow();
  });
  window.addEventListener('pagehide', save);
  setInterval(() => { if (usePlayer.getState().playing) sendNow(true); }, 15_000);
}
