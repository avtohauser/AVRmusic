import { create } from 'zustand';
import { usePlayer } from './player';

/** 30-second catalogue previews (Deezer) — played through a separate <audio>, pausing the main player. */
interface PreviewState { url: string | null; playing: boolean; toggle: (url: string) => void; stop: () => void }
let el: HTMLAudioElement | null = null;
function audio() {
  if (!el) {
    el = new Audio();
    el.preload = 'none';
    el.addEventListener('ended', () => usePreview.setState({ playing: false, url: null }));
    el.addEventListener('pause', () => usePreview.setState({ playing: false }));
    el.addEventListener('play', () => usePreview.setState({ playing: true }));
  }
  return el;
}
export const usePreview = create<PreviewState>((set, get) => ({
  url: null,
  playing: false,
  toggle(url) {
    const a = audio();
    if (get().url === url && !a.paused) { a.pause(); return; }
    usePlayer.getState().pause();
    a.src = url;
    a.volume = usePlayer.getState().volume;
    set({ url });
    a.play().catch(() => set({ playing: false }));
  },
  stop() { const a = audio(); a.pause(); a.removeAttribute('src'); set({ url: null, playing: false }); },
}));
usePlayer.subscribe((s, p) => { if (s.playing && !p.playing && usePreview.getState().playing) audio().pause(); });
