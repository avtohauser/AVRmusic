// Single audio engine bound to the player store: source selection (offline blob or stream URL),
// progress reporting, Media Session (lock-screen controls on Android), play reporting, sleep timer.
// In the Android app the engine is the app's own media player (NativeAudio), which also puts a
// ♥ button into the notification-shade player.
import type { Track } from '@avrmusic/shared';
import { usePlayer, consumeSeek } from '@/stores/player';
import { useAuth } from '@/stores/auth';
import { useLikes } from '@/stores/likes';
import { api, streamUrl } from './api';
import { offlineSrc } from './offline';
import { inNativeApp, nativeBridge, onNative } from './native';
import { NativeAudio } from './nativeAudio';
import { aliases, broken, streamFailed } from './instant';

let audio: HTMLAudioElement | null = null;
let currentId: string | null = null;
let currentNonce = -1;
let playedMs = 0;
let lastTick = 0;
let reported = false;
/** A new track's source is being resolved: play() waits for it instead of restarting the old one. */
let switching = false;
let loadSeq = 0;
/** where to start a track once its source is loaded (a restored queue, joining a session mid-song) */
let resume: { id: string; sec: number } | null = null;
export function resumeAt(trackId: string, sec: number) { resume = sec > 1 ? { id: trackId, sec } : null; }

export function getAudio(): HTMLAudioElement {
  if (!audio && inNativeApp()) {
    audio = new NativeAudio() as unknown as HTMLAudioElement;
    bind(audio);
  }
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
  a.addEventListener('error', () => { s()._setLoading(false); if (currentId?.startsWith('dz:')) streamFailed(currentId); });
}

function flush() {
  if (currentId && !reported && playedMs >= 5000) reportPlay(currentId, playedMs, usePlayer.getState().context);
  playedMs = 0; reported = false; lastTick = 0;
}

const artistLine = (t: Track) => [t.artist.name, ...t.featuring.map((f) => f.name)].join(', ');

async function load(trackId: string) {
  const a = getAudio();
  const local = await offlineSrc(trackId);
  if (trackId !== currentId) return; // skipped past while the offline copy was looked up
  if (a instanceof NativeAudio) {
    const t = usePlayer.getState().current();
    a.meta = { id: trackId, title: t?.title ?? '', artist: t ? artistLine(t) : '', album: t?.album?.title ?? '', artwork: t?.coverUrl ? new URL(t.coverUrl, location.origin).href : '' };
  }
  a.src = local ?? streamUrl(trackId);
  a.load();
  if (resume?.id === trackId) {
    const sec = resume.sec;
    resume = null;
    const go = () => { a.removeEventListener('loadedmetadata', go); try { a.currentTime = sec; } catch { /* not seekable yet */ } };
    a.addEventListener('loadedmetadata', go);
  }
}

/** App player: keep the shade's ♥ in sync and take its buttons (next / previous / like). */
function bindNativeControls() {
  const b = nativeBridge();
  if (!b) return;
  let last: boolean | null = null;
  const syncLike = () => {
    const t = usePlayer.getState().current();
    const liked = !!t && useLikes.getState().has('track', t.id);
    if (liked !== last) { last = liked; b.setLiked(liked); }
  };
  usePlayer.subscribe(syncLike);
  useLikes.subscribe(syncLike);
  onNative('command', (d) => {
    const p = usePlayer.getState();
    if (d?.name === 'next') p.next();
    else if (d?.name === 'prev') p.prev();
    else if (d?.name === 'like') {
      const t = p.current();
      if (t && useAuth.getState().user) useLikes.getState().toggle('track', t.id).catch(() => { last = null; syncLike(); });
      else { last = null; syncLike(); }
    }
  });
}

export function updateMediaSession(line?: string) {
  if (!('mediaSession' in navigator) || inNativeApp()) return;
  const t = usePlayer.getState().current();
  if (!t) { navigator.mediaSession.metadata = null; return; }
  const art = t.coverUrl ? [{ src: t.coverUrl, sizes: '512x512', type: t.coverUrl.endsWith('.svg') ? 'image/svg+xml' : 'image/jpeg' }] : [];
  navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: line || artistLine(t), album: t.album?.title ?? '', artwork: art });
}

export function initAudioEngine() {
  const a = getAudio();
  const native = a instanceof NativeAudio;
  const store = usePlayer;
  bindNativeControls();

  if ('mediaSession' in navigator && !inNativeApp()) {
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
    // a catalogue song that became the library's track while playing: the same audio, keep going
    if (cur && currentId && cur.id !== currentId && aliases.get(currentId) === cur.id && !broken.delete(currentId)) currentId = cur.id;
    if (cur && (cur.id !== currentId || st.nonce !== currentNonce)) {
      if (cur.id !== currentId) {
        flush(); currentId = cur.id; switching = true;
        const seq = ++loadSeq;
        load(cur.id)
          .catch(() => {})
          .then(() => {
            if (seq !== loadSeq) return; // another track was picked meanwhile
            switching = false;
            if (usePlayer.getState().playing) a.play().catch(() => {});
          });
      } else { a.currentTime = 0; if (st.playing) a.play().catch(() => {}); }
      currentNonce = st.nonce;
      updateMediaSession();
      if (st.playing && !(switching && native)) a.play().catch(() => {});
    } else if (!cur && currentId) {
      flush(); currentId = null; a.removeAttribute('src'); a.load(); updateMediaSession();
    }
    if (st.playing !== prevPlaying) {
      prevPlaying = st.playing;
      // (a browser needs play() inside the tap that started it; the app's player waits for the new source)
      if (st.playing) { if (!(switching && native)) a.play().catch(() => { /* autoplay blocked: wait for a user gesture */ }); }
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
