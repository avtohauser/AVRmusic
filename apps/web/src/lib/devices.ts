// The listener's own devices see each other: this browser tab reports what it plays every few seconds
// (while it is open in front, or the music plays) and waits for commands from the others — play, pause,
// skip, seek, volume, or "play this here" with a whole queue. From here any other device can be controlled
// the same way, and the music can move between them in both directions.
import { create } from 'zustand';
import type { Track } from '@avrmusic/shared';
import { usePlayer } from '@/stores/player';
import { useAuth } from '@/stores/auth';
import { useUI } from '@/stores/ui';
import { api } from './api';
import { resumeAt } from './audio';
import { inJam, leaveJam } from './jam';
import { trNow } from './social';
import type { DeviceCommand, DeviceInfo } from './features';

export const useDevices = create<{ list: DeviceInfo[] }>(() => ({ list: [] }));

export const deviceId: string = (() => {
  try {
    const have = localStorage.getItem('avr.device');
    if (have) return have;
    const id = `w${Math.random().toString(36).slice(2, 12)}`;
    localStorage.setItem('avr.device', id);
    return id;
  } catch { return `w${Math.random().toString(36).slice(2, 12)}`; }
})();

function deviceName(): string {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /YaBrowser/.test(ua) ? 'Яндекс Браузер' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : trNow('Браузер', 'Browser');
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) && !/iPhone|iPad/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : '';
  return [browser, os].filter(Boolean).join(' · ');
}

const real = (tracks: Track[]) => tracks.filter((t) => !t.id.startsWith('dz:'));
const wanted = () => !!useAuth.getState().user && (document.visibilityState === 'visible' || usePlayer.getState().playing);

/** Tells the server what plays here; its answer is the listener's devices. */
export async function reportDevice() {
  if (!useAuth.getState().user) return;
  const p = usePlayer.getState();
  const cur = p.queue[p.index];
  const list = real(p.queue);
  try {
    useDevices.setState({
      list: await api.post<DeviceInfo[]>('/api/me/devices/heartbeat', {
        id: deviceId, name: deviceName(), kind: 'web', trackId: cur && !cur.id.startsWith('dz:') ? cur.id : null,
        positionMs: Math.round(p.position * 1000), playing: p.playing, volume: p.volume,
        queue: list.slice(0, 500).map((t) => t.id), index: Math.max(0, list.findIndex((t) => t.id === cur?.id)),
      }),
    });
  } catch { /* next time */ }
}

let beating = false, listening = false, seq = 0;

async function beat() {
  if (beating) return;
  beating = true;
  while (wanted()) {
    await reportDevice();
    await new Promise((r) => setTimeout(r, document.visibilityState === 'visible' ? 8_000 : 20_000));
  }
  beating = false;
}

async function listen() {
  if (listening) return;
  listening = true;
  while (wanted()) {
    try {
      const r = await api.get<{ seq: number; commands: DeviceCommand[] }>(`/api/me/devices/${deviceId}/commands?after=${seq}`);
      if (r.seq < seq) seq = r.seq;
      for (const c of r.commands) await run(c);
      seq = r.commands.length ? Math.max(...r.commands.map((c) => c.seq)) : Math.max(seq, r.seq);
    } catch { await new Promise((r) => setTimeout(r, 5_000)); }
  }
  listening = false;
}

/** A command from another device. */
async function run(c: DeviceCommand) {
  const p = usePlayer.getState();
  switch (c.type) {
    case 'play': if (!p.playing) p.play(); break;
    case 'pause': if (p.playing) p.pause(); break;
    case 'next': p.next(); break;
    case 'prev': p.prev(); break;
    case 'seek': if (c.positionMs !== undefined) p.seek(c.positionMs / 1000); break;
    case 'volume': if (c.volume !== undefined) p.setVolume(c.volume); break;
    case 'transfer': {
      // the server already holds the queue sent here, with its tracks
      const q = await api.get<{ tracks: Track[]; index: number; positionMs: number; playing: boolean }>(`/api/me/devices/${deviceId}/queue`).catch(() => null);
      if (!q?.tracks.length) return;
      if (inJam()) await leaveJam();
      takeQueue(q.tracks, q.index, q.positionMs);
      useUI.getState().toast(trNow('Музыка перешла на это устройство', 'The music moved to this device'), 'success');
      break;
    }
  }
  setTimeout(() => void reportDevice(), 600);
}

function takeQueue(tracks: Track[], index: number, positionMs: number) {
  const i = Math.max(0, Math.min(index, tracks.length - 1));
  resumeAt(tracks[i].id, positionMs / 1000);
  usePlayer.getState().playTracks(tracks, i, 'device');
}

/** Starts reporting and listening when the tab is in front or the music plays (and again whenever that changes). */
export function startDevices() {
  const kick = () => { if (wanted()) { void beat(); void listen(); } };
  document.addEventListener('visibilitychange', kick);
  usePlayer.subscribe((s, prev) => { if (s.playing !== prev.playing) kick(); });
  useAuth.subscribe(kick);
  kick();
}

/* ---------- controlling another device ---------- */

export async function commandDevice(target: string, body: Record<string, unknown>) {
  try {
    useDevices.setState({ list: await api.post<DeviceInfo[]>(`/api/me/devices/${target}/command?from=${deviceId}`, body) });
  } catch (e: any) { useUI.getState().toast(e.message, 'error'); }
}

/** What plays here goes on on [target] from the same place; here it pauses. */
export async function sendToDevice(target: DeviceInfo) {
  const p = usePlayer.getState();
  const list = real(p.queue);
  const cur = p.queue[p.index];
  if (!list.length) { useUI.getState().toast(trNow('Здесь ничего не играет', 'Nothing plays here'), 'error'); return; }
  await commandDevice(target.id, { type: 'transfer', trackIds: list.map((t) => t.id), index: Math.max(0, list.findIndex((t) => t.id === cur?.id)), positionMs: Math.round(p.position * 1000), playing: true });
  if (usePlayer.getState().playing) usePlayer.getState().pause();
  useUI.getState().toast(trNow(`Играет на «${target.name}»`, `Playing on “${target.name}”`), 'success');
}

/** What plays on [source] goes on here; there it pauses. */
export async function takeFromDevice(source: DeviceInfo) {
  try {
    const q = await api.get<{ tracks: Track[]; index: number; positionMs: number }>(`/api/me/devices/${source.id}/queue`);
    if (!q.tracks.length) { useUI.getState().toast(trNow('Там ничего не играет', 'Nothing plays there'), 'error'); return; }
    void commandDevice(source.id, { type: 'pause' });
    if (inJam()) await leaveJam();
    takeQueue(q.tracks, q.index, q.positionMs);
  } catch (e: any) { useUI.getState().toast(e.message, 'error'); }
}
