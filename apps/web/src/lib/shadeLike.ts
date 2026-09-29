// "♥ В избранное" in the notification shade.
// Chrome's media notification can't have custom buttons (the Media Session spec only defines
// play/pause/previous/next/seek/stop…), so the app keeps a small silent notification for the current
// track with "like" and "next" actions. The service worker relays presses back here (public/sw-extra.js).
import { usePlayer } from '@/stores/player';
import { useLikes } from '@/stores/likes';
import { useUI } from '@/stores/ui';
import { useI18n } from '@/lib/i18n';
import { inNativeApp } from '@/lib/native';

const KEY = 'avr.shadeLike';
const TAG = 'avr-now';

// (the Android app has a real ♥ button in its shade player, see lib/audio.ts)
export const notificationsSupported = () => typeof window !== 'undefined' && !inNativeApp() && 'Notification' in window && 'serviceWorker' in navigator;
/** null = never asked, true/false = user choice */
export function shadeLikeSetting(): boolean | null {
  try { const v = localStorage.getItem(KEY); return v === null ? null : v === '1'; } catch { return null; }
}

export async function setShadeLike(on: boolean): Promise<boolean> {
  if (on && notificationsSupported() && Notification.permission !== 'granted') {
    const p = await Notification.requestPermission().catch(() => 'denied' as NotificationPermission);
    if (p !== 'granted') { try { localStorage.setItem(KEY, '0'); } catch { /* ignore */ } await refresh(); return false; }
  }
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* ignore */ }
  last = '';
  await refresh();
  return on;
}

let last = '';
const abs = (u: string) => new URL(u, location.origin).href;

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!notificationsSupported()) return null;
  try { return (await navigator.serviceWorker.getRegistration()) ?? null; } catch { return null; }
}

async function closeAll() {
  last = '';
  const reg = await registration();
  const list = (await reg?.getNotifications({ tag: TAG }).catch(() => [])) ?? [];
  list.forEach((n) => n.close());
}

async function refresh() {
  if (!notificationsSupported() || Notification.permission !== 'granted' || shadeLikeSetting() !== true) return closeAll();
  const p = usePlayer.getState();
  const track = p.queue[p.index];
  if (!track) return closeAll();
  const liked = useLikes.getState().has('track', track.id);
  const key = `${track.id}:${liked}`;
  if (key === last) return;
  last = key;
  const reg = await registration();
  if (!reg) return;
  const ru = useI18n.getState().lang !== 'en';
  const likeTitle = liked ? (ru ? '♥ В избранном — убрать' : '♥ Liked — remove') : (ru ? '♡ В избранное' : '♡ Like');
  try {
    await reg.showNotification(track.title, {
      tag: TAG,
      body: [track.artist.name, ...track.featuring.map((f) => f.name)].join(', '),
      icon: abs(track.coverUrl ?? '/icons/icon-192.png'),
      badge: abs('/icons/badge-96.png'),
      silent: true,
      renotify: false,
      data: { trackId: track.id },
      actions: [
        { action: 'like', title: likeTitle },
        { action: 'next', title: ru ? 'Следующий ⏭' : 'Next ⏭' },
      ],
    } as NotificationOptions);
  } catch { last = ''; }
}

let started = false;
export function initShadeLike() {
  if (started || !notificationsSupported()) return;
  started = true;
  usePlayer.subscribe((s, prev) => { if (s.queue[s.index]?.id !== prev.queue[prev.index]?.id) void refresh(); });
  useLikes.subscribe(() => { void refresh(); });
  useI18n.subscribe(() => { last = ''; void refresh(); });
  navigator.serviceWorker.addEventListener('message', (e) => {
    const m = e.data;
    if (!m || m.type !== 'avr-notify') return;
    const cur = usePlayer.getState().queue[usePlayer.getState().index];
    if (m.action === 'like') {
      const id = m.trackId || cur?.id;
      if (id) void useLikes.getState().toggle('track', id);
    } else if (m.action === 'next') {
      usePlayer.getState().next();
    } else if (m.action === 'open') {
      useUI.getState().setNowPlayingOpen(true);
    }
  });
  window.addEventListener('pagehide', () => { void closeAll(); });
  void refresh();
}
