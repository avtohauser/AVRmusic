// An HTMLAudioElement look-alike backed by the Android app's media player (see lib/native.ts).
// Only what lib/audio.ts uses is implemented. Playing through the app gives the notification-shade /
// lock-screen player (with a ♥ button) and background playback that survives the screen going off.
import { nativeBridge, onNative } from './native';

export interface NativeMeta { id: string; title: string; artist: string; album: string; artwork: string }

const abs = (u: string) => new URL(u, location.origin).href;

async function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => { const s = String(r.result); resolve(s.slice(s.indexOf(',') + 1)); };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Hands a downloaded (offline) track to the app once; later plays use the app's copy. */
async function localCopy(id: string, blobUrl: string): Promise<string> {
  const b = nativeBridge()!;
  const have = b.localUrl(id);
  if (have) return have;
  const blob = await (await fetch(blobUrl)).blob();
  const CHUNK = 512 * 1024;
  for (let off = 0; off < blob.size || off === 0; off += CHUNK) {
    if (!b.putLocal(id, await toBase64(blob.slice(off, off + CHUNK)), off === 0)) return '';
    if (blob.size === 0) break;
  }
  return b.localUrl(id);
}

export class NativeAudio extends EventTarget {
  paused = true;
  ended = false;
  preload = 'auto';
  error: { message?: string } | null = null;
  /** Shown in the shade player; set before load(). */
  meta: NativeMeta | null = null;
  private _src = '';
  private _time = 0;
  private _duration = NaN;
  private _volume = 1;
  private _muted = false;
  private _rate = 1;
  /** Bridge calls run in order, after an offline copy has been handed over. */
  private chain: Promise<unknown> = Promise.resolve();

  constructor() {
    super();
    onNative('playing', () => { this.paused = false; this.ended = false; this.fire('play'); this.fire('playing'); });
    onNative('pause', () => { if (this.paused) return; this.paused = true; this.fire('pause'); });
    onNative('waiting', () => this.fire('waiting'));
    onNative('canplay', (d) => { this.setDuration(d?.d); this.fire('canplay'); });
    onNative('time', (d) => { if (typeof d?.t === 'number') this._time = d.t; this.setDuration(d?.d); this.fire('timeupdate'); });
    onNative('ended', () => { this.paused = true; this.ended = true; this.fire('pause'); this.fire('ended'); });
    onNative('error', (d) => { this.error = { message: d?.message }; this.fire('error'); });
  }

  private fire(type: string) { this.dispatchEvent(new Event(type)); }
  private setDuration(d: unknown) {
    if (typeof d !== 'number' || !(d > 0) || d === this._duration) return;
    this._duration = d;
    this.fire('durationchange');
  }
  private send(fn: () => void | Promise<void>) {
    this.chain = this.chain.then(fn).catch((e) => console.error('native player', e));
    return this.chain;
  }

  get src() { return this._src; }
  set src(v: string) { this._src = v; }
  get currentSrc() { return this._src; }
  get currentTime() { return this._time; }
  set currentTime(v: number) {
    if (!Number.isFinite(v)) return;
    this._time = v;
    this.ended = false;
    void this.send(() => nativeBridge()?.seek(v));
  }
  get duration() { return this._duration; }
  get volume() { return this._volume; }
  set volume(v: number) { this._volume = Math.max(0, Math.min(1, v)); this.sendVolume(); }
  get muted() { return this._muted; }
  set muted(v: boolean) { this._muted = v; this.sendVolume(); }
  get playbackRate() { return this._rate; }
  set playbackRate(v: number) { this._rate = v; void this.send(() => nativeBridge()?.setRate(v)); }
  private sendVolume() { const v = this._muted ? 0 : this._volume; void this.send(() => nativeBridge()?.setVolume(v)); }

  setAttribute() { /* element attributes are meaningless here */ }
  removeAttribute(name: string) { if (name === 'src') this._src = ''; }

  load() {
    this.ended = false;
    this.error = null;
    this._time = 0;
    this._duration = NaN;
    const src = this._src;
    const meta = this.meta;
    void this.send(async () => {
      const b = nativeBridge();
      if (!b) return;
      if (!src) { b.stop(); this.paused = true; return; }
      let url = src;
      if (src.startsWith('blob:')) {
        url = meta?.id ? await localCopy(meta.id, src).catch(() => '') : '';
        if (!url) { this.error = { message: 'offline copy unavailable' }; this.fire('error'); return; }
      } else url = abs(src);
      b.load(JSON.stringify({ ...meta, url }));
    });
  }

  play(): Promise<void> {
    this.paused = false;
    return this.send(() => nativeBridge()?.play()) as Promise<void>;
  }

  pause() {
    this.paused = true;
    void this.send(() => nativeBridge()?.pause());
  }
}
