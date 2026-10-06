// "Guess the melody": friends hear the same short piece of a song and pick its title out of four; a right
// answer scores more the faster it came. Rooms live in memory, like listen-together sessions — a restart
// simply ends them. The piece is cut to its own file so neither its address nor its tags give the song away.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { DB } from '../lib/db.js';
import { config } from '../config.js';
import { newId } from '../lib/util.js';
import { getTrack, getTrackRaw } from './library.js';
import { friendRef } from './social.js';

const CLIP_MS = 15_000;
/** time to load the piece before the round starts */
const LEAD_MS = 3_000;
const ANSWER_MS = 20_000;
const REVEAL_MS = 8_000;

export type GameSource = 'library' | 'ours' | 'playlist';

interface Round {
  trackId: string;
  options: string[];
  correct: number;
  offsetMs: number;
  /** the cut piece; null when ffmpeg failed (the apps then play the song from offsetMs) */
  clip: string | null;
  startsAt: number;
  endsAt: number;
  answers: Map<string, { n: number; points: number }>;
}

export interface Game {
  id: string;
  db: DB;
  hostId: string;
  source: GameSource;
  playlistId: string | null;
  rounds: number;
  players: Map<string, { score: number; seen: number }>;
  state: 'lobby' | 'round' | 'reveal' | 'done';
  /** 1-based; 0 in the lobby */
  round: number;
  current: Round | null;
  /** the next round, prepared while this one is played */
  next: Promise<Round | null> | null;
  played: string[];
  createdAt: number;
  doneAt: number | null;
  version: number;
  timer: NodeJS.Timeout | null;
  /** a round being started (the pause's timer and a player's "next" may come together) */
  advancing: boolean;
}

const games = new Map<string, Game>();
const waiters = new Map<string, Array<() => void>>();
const clipDir = () => path.join(config.tmpDir, 'game');

function notify(g: Game) {
  g.version++;
  const list = waiters.get(g.id) ?? [];
  waiters.delete(g.id);
  list.forEach((w) => w());
}

function schedule(g: Game, ms: number, fn: () => void) {
  if (g.timer) clearTimeout(g.timer);
  g.timer = setTimeout(() => { g.timer = null; fn(); }, Math.max(0, ms));
  g.timer.unref();
}

function removeClip(r: Round | null) {
  if (r?.clip) fs.rm(r.clip, { force: true }, () => {});
}

function end(g: Game) {
  if (g.timer) clearTimeout(g.timer);
  games.delete(g.id);
  removeClip(g.current);
  g.next?.then(removeClip).catch(() => {});
  notify(g);
}

/** Players not heard from in a minute leave; finished games go after ten minutes, any after three hours. */
function sweep() {
  const t = Date.now();
  for (const g of games.values()) {
    let changed = false;
    for (const [u, p] of g.players) if (t - p.seen > 60_000) { g.players.delete(u); changed = true; }
    if (!g.players.size || t - g.createdAt > 3 * 3600_000 || (g.doneAt && t - g.doneAt > 10 * 60_000)) { end(g); continue; }
    if (!g.players.has(g.hostId)) { g.hostId = g.players.keys().next().value as string; changed = true; }
    if (changed) notify(g);
  }
}
setInterval(sweep, 15_000).unref();

export function getGame(id: string): Game | null { return games.get(id) ?? null; }

export function gameOf(userId: string): Game | null {
  for (const g of games.values()) if (g.players.has(userId)) return g;
  return null;
}

/** A song for the next round: from the chosen source, not played in this game yet, long enough for a piece. */
function pickTrack(db: DB, g: Game): string | null {
  const played = JSON.stringify(g.played);
  const players = JSON.stringify([...g.players.keys()]);
  const base = `t.duration_ms >= 30000 AND t.id NOT IN (SELECT value FROM json_each(?))`;
  const one = (sql: string, ...params: unknown[]) => (db.prepare(sql).get(...params) as any)?.id as string | undefined;
  let id: string | undefined;
  if (g.source === 'ours') {
    id = one(`SELECT t.id FROM tracks t WHERE ${base} AND t.id IN (
        SELECT track_id FROM plays WHERE ms_played >= 30000 AND user_id IN (SELECT value FROM json_each(?))
        UNION SELECT entity_id FROM likes WHERE entity_type = 'track' AND user_id IN (SELECT value FROM json_each(?)))
      ORDER BY RANDOM() LIMIT 1`, played, players, players);
  } else if (g.source === 'playlist' && g.playlistId) {
    id = one(`SELECT t.id FROM playlist_tracks pt JOIN tracks t ON t.id = pt.track_id WHERE pt.playlist_id = ? AND ${base} ORDER BY RANDOM() LIMIT 1`, g.playlistId, played);
  }
  return id ?? one(`SELECT t.id FROM tracks t WHERE ${base} ORDER BY RANDOM() LIMIT 1`, played) ?? null;
}

/** Three other songs to choose from: the same genre first, every title different. */
function distractors(db: DB, trackId: string): string[] {
  const t = getTrackRaw(db, trackId);
  const rows = db.prepare(`SELECT id, title FROM tracks WHERE id <> ? AND lower(title) <> lower(?)
    ORDER BY CASE WHEN genre = ? THEN 0 ELSE 1 END, RANDOM() LIMIT 20`).all(trackId, t?.title ?? '', t?.genre ?? '') as any[];
  const seen = new Set([String(t?.title ?? '').toLowerCase()]);
  const out: string[] = [];
  for (const r of rows) {
    const k = String(r.title).toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r.id);
    if (out.length === 3) break;
  }
  return out;
}

/** The piece as AAC in an .m4a (any player, any phone), with a short fade at both ends. */
function cutClip(src: string, out: string, offsetMs: number): Promise<string> {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const len = CLIP_MS / 1000;
  return new Promise((resolve, reject) => {
    const ff = spawn(config.ffmpegPath, ['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(offsetMs / 1000), '-t', String(len), '-i', src,
      '-vn', '-map', '0:a:0', '-map_metadata', '-1', '-af', `afade=t=in:d=0.4,afade=t=out:st=${len - 1.2}:d=1.2`,
      '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', out], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    ff.stderr.on('data', (d) => { err = (err + d).slice(-1000); });
    const timer = setTimeout(() => ff.kill('SIGKILL'), 30_000);
    ff.on('error', (e) => { clearTimeout(timer); reject(e); });
    ff.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 && fs.existsSync(out) && fs.statSync(out).size > 1024) resolve(out);
      else { fs.rmSync(out, { force: true }); reject(new Error(`ffmpeg ${code}: ${err.trim()}`)); }
    });
  });
}

async function prepareRound(db: DB, g: Game): Promise<Round | null> {
  const trackId = pickTrack(db, g);
  if (!trackId) return null;
  g.played.push(trackId); // taken now, so a round prepared alongside can't pick it
  const raw = getTrackRaw(db, trackId);
  const dur = Number(raw?.duration_ms) || 0;
  // somewhere in the middle, where songs are recognisable
  const offsetMs = dur > CLIP_MS + 20_000 ? Math.round(Math.min(dur * (0.2 + Math.random() * 0.4), dur - CLIP_MS - 5_000)) : 0;
  const clip = raw ? await cutClip(raw.file_path, path.join(clipDir(), `${g.id}-${newId()}.m4a`), offsetMs).catch(() => null) : null;
  const options = [trackId, ...distractors(db, trackId)].sort(() => Math.random() - 0.5);
  return { trackId, options, correct: options.indexOf(trackId), offsetMs, clip, startsAt: 0, endsAt: 0, answers: new Map() };
}

function reveal(g: Game) {
  if (g.state !== 'round') return;
  g.state = 'reveal';
  if (g.round >= g.rounds) { g.state = 'done'; g.doneAt = Date.now(); }
  else schedule(g, REVEAL_MS, () => { void advance(g); });
  notify(g);
}

/** The next round (or the end of the game). */
export async function advance(g: Game) {
  if (g.state === 'round' || g.state === 'done' || g.advancing) return;
  g.advancing = true;
  if (g.timer) { clearTimeout(g.timer); g.timer = null; }
  const prev = g.current;
  const r = await (g.next ?? prepareRound(g.db, g)).finally(() => { g.advancing = false; });
  g.next = null;
  if (!games.has(g.id)) { removeClip(r); return; }
  removeClip(prev);
  if (!r) { g.state = 'done'; g.doneAt = Date.now(); notify(g); return; }
  g.round++;
  r.startsAt = Date.now() + LEAD_MS;
  r.endsAt = r.startsAt + ANSWER_MS;
  g.current = r;
  g.state = 'round';
  schedule(g, r.endsAt - Date.now(), () => reveal(g));
  if (g.round < g.rounds) g.next = prepareRound(g.db, g);
  notify(g);
}

export function createGame(db: DB, userId: string, source: GameSource, rounds: number, playlistId: string | null): Game {
  const old = gameOf(userId);
  if (old) leaveGame(old, userId);
  const g: Game = {
    id: newId(), db, hostId: userId, source, playlistId, rounds, players: new Map([[userId, { score: 0, seen: Date.now() }]]),
    state: 'lobby', round: 0, current: null, next: null, played: [], createdAt: Date.now(), doneAt: null, version: 1, timer: null, advancing: false,
  };
  games.set(g.id, g);
  return g;
}

export function joinGame(g: Game, userId: string) {
  const old = gameOf(userId);
  if (old && old.id !== g.id) leaveGame(old, userId);
  if (g.players.has(userId)) { g.players.get(userId)!.seen = Date.now(); return; }
  g.players.set(userId, { score: 0, seen: Date.now() });
  notify(g);
}

export function leaveGame(g: Game, userId: string) {
  if (!g.players.delete(userId)) return;
  if (!g.players.size) { end(g); return; }
  if (g.hostId === userId) g.hostId = g.players.keys().next().value as string;
  if (g.state === 'round' && [...g.players.keys()].every((u) => g.current?.answers.has(u))) { reveal(g); return; }
  notify(g);
}

export function seenInGame(g: Game, userId: string) {
  const p = g.players.get(userId);
  if (p) p.seen = Date.now();
}

/** A player's pick: right and fast is up to 1000 points, right and slow at least 100. */
export function answerGame(g: Game, userId: string, n: number): boolean {
  const r = g.current;
  const p = g.players.get(userId);
  if (g.state !== 'round' || !r || !p || r.answers.has(userId)) return false;
  const correct = n === r.correct;
  const points = correct ? Math.max(100, Math.round(1000 - Math.max(0, Date.now() - r.startsAt) / 20)) : 0;
  r.answers.set(userId, { n, points });
  p.score += points;
  if ([...g.players.keys()].every((u) => r.answers.has(u))) reveal(g);
  else notify(g);
  return correct;
}

/** The file the round's piece plays from, and where in it. */
export function gameClip(g: Game, round: number): { file: string; mime: string } | null {
  const r = g.current;
  if (!r || round !== g.round) return null;
  if (r.clip) return { file: r.clip, mime: 'audio/mp4' };
  const raw = getTrackRaw(g.db, r.trackId);
  return raw ? { file: raw.file_path, mime: raw.mime_type } : null;
}

export function gameView(db: DB, g: Game, viewerId: string) {
  const r = g.current;
  const shown = g.state === 'reveal' || g.state === 'done';
  const track = (id: string) => getTrack(db, id, viewerId);
  return {
    id: g.id,
    host: friendRef(db, g.hostId),
    state: g.state,
    round: g.round,
    rounds: g.rounds,
    source: g.source,
    players: [...g.players.entries()].map(([u, p]) => {
      const a = r?.answers.get(u);
      return { user: friendRef(db, u), score: p.score, answered: !!a, points: shown && r ? a?.points ?? 0 : null, correct: shown && r ? a?.n === r.correct : null };
    }).filter((p) => p.user).sort((a, b) => b.score - a.score),
    options: r ? r.options.map((id, n) => { const t = track(id); return { n, title: t?.title ?? '', artist: t?.artist.name ?? '' }; }) : [],
    clipUrl: r && g.state !== 'done' ? `/api/games/${g.id}/clip/${g.round}` : null,
    clipOffsetMs: r && !r.clip ? r.offsetMs : 0,
    clipMs: CLIP_MS,
    startsAt: r?.startsAt ?? null,
    endsAt: r?.endsAt ?? null,
    myChoice: r?.answers.get(viewerId)?.n ?? null,
    answer: shown && r ? { n: r.correct, track: track(r.trackId) } : null,
    played: g.state === 'done' ? g.played.slice(0, g.round).map(track).filter(Boolean) : [],
    version: g.version,
    serverNow: Date.now(),
  };
}

/** Waits (up to [ms]) until the game changes past [version]; returns right away if it already has. */
export function waitGame(g: Game, version: number, ms: number): Promise<void> {
  if (g.version !== version) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => { clearTimeout(timer); resolve(); };
    const timer = setTimeout(() => {
      const list = waiters.get(g.id);
      if (list) waiters.set(g.id, list.filter((w) => w !== done));
      resolve();
    }, ms);
    const list = waiters.get(g.id) ?? [];
    list.push(done);
    waiters.set(g.id, list);
  });
}

/** Pieces left from before a restart. */
export function clearGameClips() {
  fs.rm(clipDir(), { recursive: true, force: true }, () => {});
}
