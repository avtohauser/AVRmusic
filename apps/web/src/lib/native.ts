// Running inside the AVRmusic Android app: the page is shown in a full-screen WebView and music is
// played by the app's own media player (android/app/src/main/java/space/avthsr/music/). The app
// exposes window.AVRNative and talks back through window.__avrNative(type, data).
export interface AVRNativeBridge {
  version(): number;
  appVersion(): string;
  load(json: string): void;
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  setVolume(volume: number): void;
  setRate(rate: number): void;
  stop(): void;
  setLiked(liked: boolean): void;
  insets(): string;
  exit(): void;
  localUrl(id: string): string;
  putLocal(id: string, base64: string, first: boolean): boolean;
  dropLocal(id: string): void;
}

declare global {
  interface Window {
    AVRNative?: AVRNativeBridge;
    __avrNative?: (type: string, data: any) => void;
    /** Back gesture: close what is open; false = let the app go back / leave. */
    __avrBack?: () => boolean;
    __avrNavigate?: (path: string) => void;
    __avrOpenPlayer?: () => void;
  }
}

export const nativeBridge = (): AVRNativeBridge | null => (typeof window !== 'undefined' && window.AVRNative) || null;
export const inNativeApp = () => !!nativeBridge();

type Handler = (data: any) => void;
const handlers = new Map<string, Set<Handler>>();

/** Subscribe to a message from the app ('playing', 'time', 'command', 'insets' …). */
export function onNative(type: string, h: Handler): () => void {
  let set = handlers.get(type);
  if (!set) handlers.set(type, (set = new Set()));
  set.add(h);
  return () => { set!.delete(h); };
}

interface Insets { t: number; r: number; b: number; l: number; tBar: number }

function applyInsets(i: Partial<Insets> | null) {
  if (!i) return;
  const s = document.documentElement.style;
  const px = (v: number | undefined) => `${Math.max(0, Math.round(v ?? 0))}px`;
  s.setProperty('--safe-t', px(i.t));
  s.setProperty('--safe-r', px(i.r));
  s.setProperty('--safe-b', px(i.b));
  s.setProperty('--safe-l', px(i.l));
  s.setProperty('--safe-t-bar', px(i.tBar ?? i.t));
}

/** Call before the first render (and before the router reads the URL). */
export function initNativeApp() {
  // older app versions open the site with ?app=android: keep the address clean
  try {
    const params = new URLSearchParams(location.search);
    if (params.has('app')) {
      params.delete('app');
      const q = params.toString();
      history.replaceState(history.state, '', `${location.pathname}${q ? `?${q}` : ''}${location.hash}`);
    }
  } catch { /* ignore */ }
  const b = nativeBridge();
  if (!b) return;
  document.documentElement.classList.add('native-app');
  window.__avrNative = (type, data) => {
    handlers.get(type)?.forEach((h) => { try { h(data); } catch (e) { console.error(e); } });
  };
  onNative('insets', applyInsets);
  try { applyInsets(JSON.parse(b.insets())); } catch { /* keep the CSS defaults */ }
}
