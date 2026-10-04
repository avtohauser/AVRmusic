// Friends on the server: what everyone is listening to right now, and "listen together" sessions —
// one queue and one playing position for everybody in them, anyone may add, skip or pause. Both live in
// memory: they only matter while people are listening (a restart simply ends the sessions).
import type { DB } from '../lib/db.js';
import type { FriendRef, Track } from '@avrmusic/shared';
import { avatarUrl, getTrack } from './library.js';
import { newId } from '../lib/util.js';

export function friendRef(db: DB, userId: string): FriendRef | null {
  const u = db.prepare('SELECT id, display_name, avatar_path FROM users WHERE id = ?').get(userId) as any;
  return u ? { id: u.id, displayName: u.display_name, avatarUrl: avatarUrl(u.avatar_path) } : null;
}

/* ---------- now playing ---------- */

interface Now { trackId: string | null; positionMs: number; playing: boolean; at: number }
const now = new Map<string, Now>();

/** The apps tell the server what they play (on every change and every 15 s while playing). */
export function setNowPlaying(userId: string, trackId: string | null, positionMs: number, playing: boolean) {
  now.set(userId, { trackId, positionMs: Math.max(0, positionMs), playing, at: Date.now() });
}

/** What a user listens to now: kept for 90 s after the last word from their app. */
export function nowPlaying(db: DB, userId: string, viewerId?: string): { track: Track; positionMs: number; playing: boolean; at: string } | null {
  const n = now.get(userId);
  if (!n || !n.trackId || Date.now() - n.at > 90_000) return null;
  if (!n.playing && Date.now() - n.at > 30_000) return null;
  const track = getTrack(db, n.trackId, viewerId);
  if (!track) return null;
  const positionMs = n.playing ? n.positionMs + (Date.now() - n.at) : n.positionMs;
  return { track, positionMs, playing: n.playing, at: new Date(n.at).toISOString() };
}

/* ---------- listen together ---------- */

export interface Jam {
  id: string;
  hostId: string;
  members: Map<string, number>;
  queue: string[];
  index: number;
  positionMs: number;
  playing: boolean;
  /** server time of the last change of position / play state */
  updatedAt: number;
  version: number;
  /** who did the last thing, and what ("added", "skipped" …), for a line in the apps */
  lastBy: string | null;
  lastAction: string | null;
}

const jams = new Map<string, Jam>();
const waiters = new Map<string, Array<() => void>>();

function notify(j: Jam) {
  j.version++;
  const list = waiters.get(j.id) ?? [];
  waiters.delete(j.id);
  list.forEach((w) => w());
}

/** Members not heard from in a minute leave; an empty session ends. */
function sweep() {
  const t = Date.now();
  for (const j of jams.values()) {
    let changed = false;
    for (const [u, seen] of j.members) if (t - seen > 60_000) { j.members.delete(u); changed = true; }
    if (!j.members.size) { jams.delete(j.id); notify(j); continue; }
    if (!j.members.has(j.hostId)) { j.hostId = j.members.keys().next().value as string; changed = true; }
    if (changed) notify(j);
  }
}
setInterval(sweep, 15_000).unref();

export function jamOf(userId: string): Jam | null {
  for (const j of jams.values()) if (j.members.has(userId)) return j;
  return null;
}

export function getJam(id: string): Jam | null { return jams.get(id) ?? null; }

export function listJams(): Jam[] { return [...jams.values()]; }

/** Where the session is right now. */
export function jamPosition(j: Jam): number {
  return j.playing ? j.positionMs + (Date.now() - j.updatedAt) : j.positionMs;
}

export function jamView(db: DB, j: Jam, viewerId?: string) {
  const tracks = j.queue.map((id) => getTrack(db, id, viewerId)).filter((t): t is Track => !!t);
  return {
    id: j.id,
    host: friendRef(db, j.hostId),
    members: [...j.members.keys()].map((u) => friendRef(db, u)).filter(Boolean),
    queue: tracks,
    index: Math.min(j.index, Math.max(0, tracks.length - 1)),
    positionMs: Math.round(jamPosition(j)),
    playing: j.playing,
    version: j.version,
    serverNow: Date.now(),
    lastBy: j.lastBy ? friendRef(db, j.lastBy) : null,
    lastAction: j.lastAction,
  };
}

export function startJam(userId: string, queue: string[], index: number, positionMs: number, playing: boolean): Jam {
  leaveJam(userId);
  const j: Jam = {
    id: newId(), hostId: userId, members: new Map([[userId, Date.now()]]), queue: queue.slice(0, 500),
    index: Math.max(0, Math.min(index, queue.length - 1)), positionMs, playing, updatedAt: Date.now(), version: 1, lastBy: userId, lastAction: 'started',
  };
  jams.set(j.id, j);
  return j;
}

export function joinJam(j: Jam, userId: string) {
  const other = jamOf(userId);
  if (other && other.id !== j.id) leaveJam(userId);
  const fresh = !j.members.has(userId);
  j.members.set(userId, Date.now());
  if (fresh) { j.lastBy = userId; j.lastAction = 'joined'; notify(j); }
}

export function leaveJam(userId: string) {
  const j = jamOf(userId);
  if (!j) return;
  j.members.delete(userId);
  if (!j.members.size) { jams.delete(j.id); notify(j); return; }
  if (j.hostId === userId) j.hostId = j.members.keys().next().value as string;
  j.lastBy = userId; j.lastAction = 'left';
  notify(j);
}

export type JamOp =
  | { op: 'play' } | { op: 'pause' } | { op: 'seek'; positionMs: number }
  | { op: 'skip'; index: number } | { op: 'next' } | { op: 'prev' }
  | { op: 'add'; trackIds: string[]; next?: boolean } | { op: 'remove'; index: number } | { op: 'move'; from: number; to: number }
  | { op: 'replace'; trackIds: string[]; index: number; positionMs?: number };

/** Anyone in the session changes it for everyone. */
export function applyJam(j: Jam, userId: string, o: JamOp) {
  j.members.set(userId, Date.now());
  const at = jamPosition(j);
  const restart = (i: number) => { j.index = Math.max(0, Math.min(i, j.queue.length - 1)); j.positionMs = 0; j.updatedAt = Date.now(); };
  switch (o.op) {
    case 'play': j.positionMs = at; j.playing = true; j.updatedAt = Date.now(); break;
    case 'pause': j.positionMs = at; j.playing = false; j.updatedAt = Date.now(); break;
    case 'seek': j.positionMs = Math.max(0, o.positionMs); j.updatedAt = Date.now(); break;
    // everyone's app reports the same automatic move to the next track: only the first one counts
    case 'skip': if (o.index !== j.index) restart(o.index); j.playing = true; break;
    case 'next': if (j.index + 1 < j.queue.length) restart(j.index + 1); else { j.positionMs = at; j.playing = false; j.updatedAt = Date.now(); } break;
    case 'prev': if (at > 3000 || j.index === 0) { j.positionMs = 0; j.updatedAt = Date.now(); } else restart(j.index - 1); break;
    case 'add': {
      const ids = o.trackIds.filter((id) => !j.queue.includes(id)).slice(0, 200);
      if (o.next) j.queue.splice(j.index + 1, 0, ...ids); else j.queue.push(...ids);
      break;
    }
    case 'remove':
      if (o.index >= 0 && o.index < j.queue.length && o.index !== j.index) {
        j.queue.splice(o.index, 1);
        if (o.index < j.index) j.index--;
      }
      break;
    case 'move': {
      if (o.from < 0 || o.from >= j.queue.length || o.to < 0 || o.to >= j.queue.length) break;
      const [id] = j.queue.splice(o.from, 1);
      j.queue.splice(o.to, 0, id);
      const cur = j.index;
      if (o.from === cur) j.index = o.to;
      else if (o.from < cur && o.to >= cur) j.index--;
      else if (o.from > cur && o.to <= cur) j.index++;
      break;
    }
    case 'replace': j.queue = o.trackIds.slice(0, 500); restart(o.index); if (o.positionMs) j.positionMs = o.positionMs; j.playing = true; break;
  }
  j.lastBy = userId;
  j.lastAction = o.op;
  notify(j);
}

/** Waits (up to [ms]) until the session changes past [version]; returns right away if it already has. */
export function waitJam(j: Jam, version: number, ms: number): Promise<void> {
  if (j.version !== version) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => { clearTimeout(timer); resolve(); };
    const timer = setTimeout(() => {
      const list = waiters.get(j.id);
      if (list) waiters.set(j.id, list.filter((w) => w !== done));
      resolve();
    }, ms);
    const list = waiters.get(j.id) ?? [];
    list.push(done);
    waiters.set(j.id, list);
  });
}
