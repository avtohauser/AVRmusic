// A listener's own devices (phone, iPhone, the site in a browser) see each other: what each plays, and any
// of them can control another or hand its music over to it. The apps report themselves every few seconds
// and wait for commands with a long poll; all of it lives in memory.
import type { DB } from '../lib/db.js';
import { getTrack, getTracksByIds } from './library.js';

export type DeviceKind = 'android' | 'ios' | 'web';

export interface DeviceState {
  trackId: string | null;
  positionMs: number;
  playing: boolean;
  volume: number;
  queue: string[];
  index: number;
}

export type DeviceCommand =
  | { type: 'play' } | { type: 'pause' } | { type: 'next' } | { type: 'prev' }
  | { type: 'seek'; positionMs: number } | { type: 'volume'; volume: number }
  | { type: 'transfer'; trackIds: string[]; index: number; positionMs: number; playing: boolean };

interface Device {
  id: string;
  name: string;
  kind: DeviceKind;
  seen: number;
  /** when the state was reported (the position moves on from there while playing) */
  at: number;
  state: DeviceState;
  seq: number;
  commands: Array<{ seq: number; at: number; from: string | null; cmd: DeviceCommand }>;
  waiters: Array<() => void>;
}

const ONLINE_MS = 45_000;
/** a command nobody picked up in this time is dropped (no sudden play an hour later) */
const COMMAND_TTL = 20_000;
const devices = new Map<string, Map<string, Device>>();

function mine(userId: string) {
  let m = devices.get(userId);
  if (!m) { m = new Map(); devices.set(userId, m); }
  return m;
}

setInterval(() => {
  const t = Date.now();
  for (const [u, m] of devices) {
    for (const [id, d] of m) if (t - d.seen > 24 * 3600_000) m.delete(id);
    if (!m.size) devices.delete(u);
  }
}, 10 * 60_000).unref();

/** Devices with the app open right now, and how many people they belong to. */
export function onlineSummary(): { users: number; devices: number; byKind: Record<string, number> } {
  const t = Date.now();
  let users = 0, count = 0;
  const byKind: Record<string, number> = {};
  for (const m of devices.values()) {
    let any = false;
    for (const d of m.values()) if (t - d.seen < ONLINE_MS) { any = true; count++; byKind[d.kind] = (byKind[d.kind] ?? 0) + 1; }
    if (any) users++;
  }
  return { users, devices: count, byKind };
}

/** An app reports itself (and what it plays). */
export function heartbeat(userId: string, b: { id: string; name: string; kind: DeviceKind } & Partial<DeviceState>) {
  const m = mine(userId);
  let d = m.get(b.id);
  if (!d) {
    d = { id: b.id, name: b.name, kind: b.kind, seen: 0, at: 0, seq: 0, commands: [], waiters: [],
      state: { trackId: null, positionMs: 0, playing: false, volume: 1, queue: [], index: 0 } };
    m.set(b.id, d);
  }
  d.name = b.name;
  d.kind = b.kind;
  d.seen = d.at = Date.now();
  const s = d.state;
  if (b.trackId !== undefined) s.trackId = b.trackId;
  if (b.positionMs !== undefined) s.positionMs = Math.max(0, b.positionMs);
  if (b.playing !== undefined) s.playing = b.playing;
  if (b.volume !== undefined) s.volume = Math.max(0, Math.min(1, b.volume));
  if (b.queue !== undefined) s.queue = b.queue.slice(0, 500);
  if (b.index !== undefined) s.index = b.index;
}

export function forget(userId: string, deviceId: string) {
  const d = devices.get(userId)?.get(deviceId);
  if (!d) return;
  devices.get(userId)!.delete(deviceId);
  d.waiters.splice(0).forEach((w) => w());
}

function position(d: Device) {
  return d.state.playing ? d.state.positionMs + (Date.now() - d.at) : d.state.positionMs;
}

export function listDevices(db: DB, userId: string, viewerDevice?: string) {
  const t = Date.now();
  return [...mine(userId).values()]
    .filter((d) => t - d.seen < ONLINE_MS || d.id === viewerDevice)
    .sort((a, b) => Number(b.state.playing) - Number(a.state.playing) || b.seen - a.seen)
    .map((d) => ({
      id: d.id, name: d.name, kind: d.kind, current: d.id === viewerDevice,
      track: d.state.trackId ? getTrack(db, d.state.trackId, userId) : null,
      positionMs: Math.round(position(d)), playing: d.state.playing, volume: d.state.volume,
      seenAt: new Date(d.seen).toISOString(),
    }));
}

/** A device's queue (to take its music over to this one). */
export function deviceQueue(db: DB, userId: string, deviceId: string) {
  const d = devices.get(userId)?.get(deviceId);
  if (!d) return null;
  const tracks = getTracksByIds(db, d.state.queue, userId);
  const byId = new Map(tracks.map((t) => [t.id, t]));
  const queue = d.state.queue.map((id) => byId.get(id)).filter((t) => !!t);
  const cur = d.state.trackId ? queue.findIndex((t) => t!.id === d.state.trackId) : -1;
  return { tracks: queue, index: cur >= 0 ? cur : Math.min(d.state.index, Math.max(0, queue.length - 1)), positionMs: Math.round(position(d)), playing: d.state.playing };
}

/** Sends a command to one of the listener's devices; false when it isn't online. */
export function sendCommand(userId: string, deviceId: string, cmd: DeviceCommand, from: string | null): boolean {
  const d = devices.get(userId)?.get(deviceId);
  if (!d || Date.now() - d.seen > ONLINE_MS) return false;
  const t = Date.now();
  d.commands = d.commands.filter((c) => t - c.at < COMMAND_TTL).slice(-20);
  d.commands.push({ seq: ++d.seq, at: t, from, cmd });
  // what the others see changes at once, before the device confirms
  const s = d.state;
  if (cmd.type === 'play' || cmd.type === 'pause') { s.positionMs = position(d); d.at = t; s.playing = cmd.type === 'play'; }
  if (cmd.type === 'seek') { s.positionMs = cmd.positionMs; d.at = t; }
  if (cmd.type === 'volume') s.volume = cmd.volume;
  if (cmd.type === 'transfer') {
    s.queue = cmd.trackIds.slice(0, 500); s.index = cmd.index; s.trackId = s.queue[cmd.index] ?? null;
    s.positionMs = cmd.positionMs; s.playing = cmd.playing; d.at = t;
  }
  d.waiters.splice(0).forEach((w) => w());
  return true;
}

/** Commands for this device after [after]; waits up to [ms] for one when there are none yet. */
export async function takeCommands(userId: string, deviceId: string, after: number, ms: number) {
  const d = devices.get(userId)?.get(deviceId);
  // not reported itself yet: a short wait, so an app asking in a loop doesn't spin
  if (!d) { await new Promise((r) => setTimeout(r, Math.min(ms, 5_000))); return { seq: after, commands: [] }; }
  d.seen = Date.now();
  const fresh = () => d.commands.filter((c) => c.seq > after && Date.now() - c.at < COMMAND_TTL);
  if (!fresh().length && ms > 0) {
    await new Promise<void>((resolve) => {
      const done = () => { clearTimeout(timer); resolve(); };
      const timer = setTimeout(() => { d.waiters = d.waiters.filter((w) => w !== done); resolve(); }, ms);
      d.waiters.push(done);
    });
    d.seen = Date.now();
  }
  // a device that restarted asks from 0: it gets only what is new from now on
  const list = after > d.seq ? [] : fresh();
  return { seq: d.seq, commands: list.map((c) => ({ seq: c.seq, from: c.from, ...c.cmd })) };
}
