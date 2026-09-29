// Fullscreen safety net for the Android app and the installed web app.
// The Android app asks its browser for sticky-immersive mode, but a browser that doesn't implement it
// (or an installed PWA created before "fullscreen" was in the manifest) leaves the status and
// navigation bars on screen. In that case the first tap switches the page to fullscreen with the
// Fullscreen API, which hides both bars in any Chromium-based browser.
const KEY = 'avr.inApp';

function detectApp(): boolean {
  try {
    const params = new URLSearchParams(location.search);
    if (params.get('app') === 'android') {
      localStorage.setItem(KEY, 'android');
      params.delete('app');
      const q = params.toString();
      history.replaceState(history.state, '', `${location.pathname}${q ? `?${q}` : ''}${location.hash}`);
    }
    if (localStorage.getItem(KEY) === 'android' || document.referrer.startsWith('android-app://')) return true;
  } catch { /* storage unavailable */ }
  const android = /Android/i.test(navigator.userAgent);
  return android && matchMedia('(display-mode: standalone), (display-mode: minimal-ui)').matches;
}

export function initAppFullscreen() {
  if (typeof document === 'undefined' || !document.fullscreenEnabled || !detectApp()) return;
  const alreadyFullscreen = () => !!document.fullscreenElement || matchMedia('(display-mode: fullscreen)').matches;
  let entered = false;

  const enter = () => {
    if (alreadyFullscreen() || document.visibilityState !== 'visible') return;
    entered = true;
    document.documentElement.requestFullscreen({ navigationUI: 'hide' } as FullscreenOptions).catch(() => { entered = false; });
  };
  // any tap is a user gesture, which the Fullscreen API requires
  window.addEventListener('pointerup', enter, { capture: true, passive: true });

  // In element fullscreen the system back gesture first leaves fullscreen. Treat that as "back" so the
  // app still navigates with a single swipe; the next tap goes fullscreen again.
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement || !entered) return;
    entered = false;
    setTimeout(() => {
      if (document.visibilityState !== 'visible' || !document.hasFocus()) return; // app went to background
      const idx = (history.state && typeof history.state.idx === 'number') ? history.state.idx : 0;
      if (idx > 0) history.back();
    }, 180);
  });
}
