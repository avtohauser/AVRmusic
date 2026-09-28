// Single <audio> engine bound to the player store: source selection (offline blob or stream URL),
// progress reporting, Media Session (lock-screen controls on Android), play reporting, sleep timer.
import { usePlayer, consumeSeek } from '@/stores/player';
import { useAuth } from '@/stores/auth';
import { api, streamUrl } from './api';
import { offlineSrc } from './offline';

let audio: HTMLAudioElement | null = null;
let currentId: string | null = null;
let currentNonce = -1;
let playedMs = 0;
let lastTick = 0;
let reported = false;

export function getAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio();
    audio.preload = 'auto';
    (audio as any).playsInline = true;
    audio.setAttribute('data-avr-player', '');
    audio.style.display = 'none';
    document.body.appendChild(audio); // in-DOM element: more reliable background playback on Android WebView/TWA
    bind(audio);
  }
  return audio;
}

function reportPlay(trackId: string, ms: number, context: string | null) {
  if (!useAuth.getState().user || ms < 1000) return;
  api.post('/api/me/plays', { trackId, msPlayed: Math.round(ms), context: context ?? undefined }).catch(() => {});
}

function bind(a: HTMLAudioElement) {
  const s = usePlayer.getState;
  a.addEventListener('timeupdate', () => {
    const now = performance.now();
    if (!a.paused && lastTick) playedMs += Math.min(2000, now - lastTick);
    lastTick = now;
    s()._setProgress(a.currentTime, a.duration || 0);
    // Count as "played" once, after 30s or half the track
    if (!reported && currentId && (playedMs >= 30000 || (a.duration && playedMs >= (a.duration * 1000) / 2))) {
      reported = true;
      reportPlay(currentId, playedMs, s().context);
    }
    const sleepAt = s().sleepAt;
    if (sleepAt && Date.now() >= sleepAt) { s().pause(); s().setSleep(null); }
  });
  a.addEventListener('durationchange', () => s()._setProgress(a.currentTime, a.duration || 0));
  a.addEventListener('waiting', () => s()._setLoading(true));
  a.addEventListener('canplay', () => s()._setLoading(false));
  a.addEventListener('playing', () => { s()._setLoading(false); lastTick = performance.now(); if (!s().playing) s()._setPlaying(true); });
  a.addEventListener('pause', () => { lastTick = 0; if (s().playing && !a.ended) s()._setPlaying(false); });
  a.addEventListener('ended', () => { flush(); s().next(true); });
  a.addEventListener('error', () => { s()._setLoading(false); });
}

function flush() {
  if (currentId && !reported && playedMs >= 5000) reportPlay(currentId, playedMs, usePlayer.getState().context);
  playedMs = 0; reported = false; lastTick = 0;
}

async function load(trackId: string) {
  const a = getAudio();
  const local = await offlineSrc(trackId);
  a.src = local ?? streamUrl(trackId);
  a.load();
}

function updateMediaSession() {
  if (!('mediaSession' in navigator)) return;
  const t = usePlayer.getState().current();
  if (!t) { navigator.mediaSession.metadata = null; return; }
  const art = t.coverUrl ? [{ src: t.coverUrl, sizes: '512x512', type: t.coverUrl.endsWith('.svg') ? 'image/svg+xml' : 'image/jpeg' }] : [];
  navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: [t.artist.name, ...t.featuring.map((f) => f.name)].join(', '), album: t.album?.title ?? '', artwork: art });
}

export function initAudioEngine() {
  const a = getAudio();
  const store = usePlayer;

  if ('mediaSession' in navigator) {
    const ms = navigator.mediaSession;
    ms.setActionHandler('play', () => store.getState().play());
    ms.setActionHandler('pause', () => store.getState().pause());
    ms.setActionHandler('previoustrack', () => store.getState().prev());
    ms.setActionHandler('nexttrack', () => store.getState().next());
    ms.setActionHandler('seekto', (d) => { if (d.seekTime != null) store.getState().seek(d.seekTime); });
    try { ms.setActionHandler('seekbackward', (d) => store.getState().seek(Math.max(0, a.currentTime - (d.seekOffset ?? 10)))); } catch { /* unsupported */ }
    try { ms.setActionHandler('seekforward', (d) => store.getState().seek(Math.min(a.duration || 0, a.currentTime + (d.seekOffset ?? 10)))); } catch { /* unsupported */ }
  }

  let prevPlaying = false;
  store.subscribe((st, prev) => {
    const cur = st.queue[st.index] ?? null;
    // Track change or restart
    if (cur && (cur.id !== currentId || st.nonce !== currentNonce)) {
      if (cur.id !== currentId) { flush(); currentId = cur.id; load(cur.id).then(() => { if (usePlayer.getState().playing) a.play().catch(() => {}); }); }
      else { a.currentTime = 0; if (st.playing) a.play().catch(() => {}); }
      currentNonce = st.nonce;
      updateMediaSession();
      if (st.playing) a.play().catch(() => {});
    } else if (!cur && currentId) {
      flush(); currentId = null; a.removeAttribute('src'); a.load(); updateMediaSession();
    }
    if (st.playing !== prevPlaying) {
      prevPlaying = st.playing;
      if (st.playing) a.play().catch(() => { /* autoplay blocked: wait for a user gesture */ });
      else a.pause();
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = st.playing ? 'playing' : 'paused';
    }
    if (st.volume !== prev.volume || st.muted !== prev.muted) { a.volume = st.volume; a.muted = st.muted; }
    if (st.rate !== prev.rate) a.playbackRate = st.rate;
    const seek = consumeSeek();
    if (seek != null && Number.isFinite(seek)) { a.currentTime = seek; }
  });
  a.volume = store.getState().volume;
  a.muted = store.getState().muted;
}
