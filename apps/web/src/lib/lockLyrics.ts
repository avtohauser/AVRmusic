// The current line of synced lyrics in the system player (lock screen, notification, headphones'
// display): it takes the artist's place while the song sings, and gives it back between lines.
import type { Lyrics } from '@avrmusic/shared';
import { usePlayer } from '@/stores/player';
import { api } from './api';
import { inNativeApp } from './native';
import { updateMediaSession } from './audio';

const KEY = 'avr.lockLyrics';
export const lockLyricsOn = () => { try { return localStorage.getItem(KEY) !== '0'; } catch { return true; } };
export const setLockLyrics = (on: boolean) => { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* ignore */ } updateMediaSession(); };

const cache = new Map<string, Array<{ timeMs: number; text: string }>>();

export function initLockLyrics() {
  if (!('mediaSession' in navigator) || inNativeApp()) return;
  let shown = '';
  let loading = '';
  usePlayer.subscribe((st, prev) => {
    const t = st.queue[st.index];
    if (!t) return;
    if (t.id !== prev.queue[prev.index]?.id) shown = '';
    if (!lockLyricsOn() || !t.hasSyncedLyrics || t.id.startsWith('dz:')) return;
    const lines = cache.get(t.id);
    if (!lines) {
      if (loading !== t.id) {
        loading = t.id;
        api.get<Lyrics>(`/api/tracks/${t.id}/lyrics`).then((l) => cache.set(t.id, l.synced ?? [])).catch(() => cache.set(t.id, []));
      }
      return;
    }
    const ms = st.position * 1000 + 300;
    let line = '';
    for (const l of lines) { if (l.timeMs <= ms) line = l.text.trim(); else break; }
    if (line !== shown) { shown = line; updateMediaSession(line ? `♪ ${line}` : undefined); }
  });
}
