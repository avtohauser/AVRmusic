// Several YouTube accounts for yt-dlp (a cookies.txt each, uploaded in the admin panel and kept only on
// the server). Every download takes the least busy account — up to two downloads per account at a time —
// so N accounts fetch 2·N tracks at once. Friends may give spare accounts of their own (Профиль → «Помочь
// с загрузками»): each counts like the admin's and stays theirs to see and take back. An account YouTube refuses ("not a bot", 429) rests for a while and the
// download moves on to the next one; with every account resting it is tried without cookies.
// Every yt-dlp run gets a private copy of the cookies (it writes the jar back on exit); after a good
// download the refreshed jar replaces the account's file in one step.
// With other servers given as download exits (DOWNLOAD_PROXIES), every exit has the same slots again —
// YouTube sees several IPs — and a download takes the least busy exit; an exit that stops answering
// rests a few minutes and its downloads go through the others.
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { badRequest, notFound } from '../lib/errors.js';
import { newId } from '../lib/util.js';

export interface YtAccountInfo {
  id: string;
  label: string;
  createdAt: string;
  updatedAt: string;
  cookies: number;
  loggedIn: boolean;
  busy: boolean;
  coolingUntil: string | null;
  ok: number;
  failed: number;
  lastError: string | null;
  lastUsedAt: string | null;
  /** who gave it (a friend's spare account); null — the admin's own */
  owner: string | null;
}

interface Meta { id: string; label: string; createdAt: string; owner?: string | null }
interface Live { running: number; at: number[]; coolUntil: number; ok: number; failed: number; lastError: string | null; lastUsedAt: string | null }

/** How long an account rests after YouTube refused it. */
const COOL_MS = 20 * 60_000;
/** Downloads at once without any account, and per account. */
const ANON_SLOTS = 2;
const PER_ACCOUNT = 2;
const MAX_ACCOUNTS = 30;
/** spare accounts one person may give */
export const MAX_GIVEN = 3;

const dir = () => path.join(config.dataDir, 'youtube-accounts');
const metaFile = () => path.join(dir(), 'accounts.json');
const cookiesOf = (id: string) => path.join(dir(), `${id}.txt`);
// earlier versions: one cookies file, given to every yt-dlp call through its user config
const legacyCookies = () => path.join(config.dataDir, 'youtube-cookies.txt');
const legacyConfig = () => path.join(process.env.XDG_CONFIG_HOME || path.join(config.dataDir, 'config'), 'yt-dlp', 'config');

const live = new Map<string, Live>();
function state(id: string): Live {
  let s = live.get(id);
  if (!s) live.set(id, (s = { running: 0, at: [], coolUntil: 0, ok: 0, failed: 0, lastError: null, lastUsedAt: null }));
  return s;
}

/* ---------- where downloads leave from ---------- */

interface Exit { proxy: string | null; name: string; busy: number; anon: number; downUntil: number }
let exitsFor: string | null = null;
let exitList: Exit[] = [];
/** This server first, then every other server from DOWNLOAD_PROXIES ("url#name"). */
function exits(): Exit[] {
  const key = config.downloadProxies.join(',');
  if (key !== exitsFor) {
    exitsFor = key;
    exitList = [{ proxy: null, name: '', busy: 0, anon: 0, downUntil: 0 }, ...config.downloadProxies.map((p) => {
      const [url, name] = p.split('#');
      return { proxy: url.trim(), name: (name ?? url).trim(), busy: 0, anon: 0, downUntil: 0 };
    })];
  }
  return exitList;
}
const exitUp = (e: Exit) => e.downUntil <= Date.now();
/** How long an exit that stopped answering rests. */
const EXIT_REST_MS = 5 * 60_000;
const PROXY_FAILURE = /proxy|tunnel connection failed|connection refused|no route to host|network is unreachable|timed out/i;
/** Did the other server fail us (as opposed to YouTube or the video)? */
function exitFailed(e: Exit, msg: string, log?: (s: string) => void): boolean {
  if (!e.proxy || !PROXY_FAILURE.test(msg)) return false;
  e.downUntil = Date.now() + EXIT_REST_MS;
  log?.(`   … сервер «${e.name}» не отвечает — качаю через остальные`);
  return true;
}
const via = (e: Exit) => (e.proxy ? ` · через «${e.name}»` : '');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function readMeta(): Meta[] {
  try { return JSON.parse(fs.readFileSync(metaFile(), 'utf8')) as Meta[]; } catch { return []; }
}
function writeMeta(list: Meta[]) {
  fs.mkdirSync(dir(), { recursive: true });
  fs.writeFileSync(metaFile(), JSON.stringify(list, null, 2));
}

let migratedFor = '';
function load(): Meta[] {
  // once per data directory: the old single cookies file becomes the first account
  if (migratedFor !== config.dataDir) {
    migratedFor = config.dataDir;
    try { fs.unlinkSync(legacyConfig()); } catch { /* not there */ }
    if (fs.existsSync(legacyCookies())) {
      const list = readMeta();
      const id = newId();
      fs.mkdirSync(dir(), { recursive: true });
      fs.copyFileSync(legacyCookies(), cookiesOf(id));
      fs.chmodSync(cookiesOf(id), 0o600);
      list.push({ id, label: `Аккаунт ${list.length + 1}`, createdAt: new Date().toISOString() });
      writeMeta(list);
      fs.unlinkSync(legacyCookies());
    }
  }
  return readMeta();
}

function inspect(text: string) {
  const rows = text.split('\n').filter((l) => /(^|\t)\.?youtube\.com\t/.test(l.replace(/^#HttpOnly_/, '')));
  return { cookies: rows.length, loggedIn: rows.some((l) => /\t(SAPISID|__Secure-3PSID|SID|LOGIN_INFO)\t/.test(l)) };
}

export function listAccounts(): YtAccountInfo[] {
  return load().map((m) => {
    let text = '';
    let updatedAt = m.createdAt;
    try { text = fs.readFileSync(cookiesOf(m.id), 'utf8'); updatedAt = fs.statSync(cookiesOf(m.id)).mtime.toISOString(); } catch { /* missing file */ }
    const s = state(m.id);
    return {
      ...m, updatedAt, ...inspect(text), busy: s.running > 0,
      coolingUntil: s.coolUntil > Date.now() ? new Date(s.coolUntil).toISOString() : null,
      ok: s.ok, failed: s.failed, lastError: s.lastError, lastUsedAt: s.lastUsedAt, owner: m.owner ?? null,
    };
  });
}

/** Adds an account from a cookies.txt (Netscape format). */
export function addAccount(text: string, label?: string | null, owner: string | null = null): YtAccountInfo[] {
  const lines = text.replace(/\r/g, '').split('\n');
  const rows = lines.filter((l) => l && !l.startsWith('# ') && l !== '#' && l.split('\t').length === 7);
  if (!rows.length || !rows.some((l) => /youtube\.com\t/.test(l))) throw badRequest('Нужен файл cookies.txt (формат Netscape) с cookies youtube.com');
  const list = load();
  if (list.length >= MAX_ACCOUNTS) throw badRequest(`Не больше ${MAX_ACCOUNTS} аккаунтов`);
  if (owner && list.filter((m) => m.owner === owner).length >= MAX_GIVEN) throw badRequest(`Можно дать не больше ${MAX_GIVEN} аккаунтов`);
  const id = newId();
  fs.mkdirSync(dir(), { recursive: true });
  fs.writeFileSync(cookiesOf(id), `# Netscape HTTP Cookie File\n${lines.filter((l) => !/^# Netscape/.test(l)).join('\n')}\n`, { mode: 0o600 });
  list.push({ id, label: label?.trim().slice(0, 60) || `Аккаунт ${list.length + 1}`, createdAt: new Date().toISOString(), owner });
  writeMeta(list);
  return listAccounts();
}

export function removeAccount(id: string): YtAccountInfo[] {
  const list = load();
  if (!list.some((m) => m.id === id)) throw notFound('Аккаунт не найден');
  writeMeta(list.filter((m) => m.id !== id));
  try { fs.unlinkSync(cookiesOf(id)); } catch { /* already gone */ }
  live.delete(id);
  return listAccounts();
}

/** Lets a resting account work again right away. */
export function wakeAccount(id: string): YtAccountInfo[] {
  if (!load().some((m) => m.id === id)) throw notFound('Аккаунт не найден');
  state(id).coolUntil = 0;
  return listAccounts();
}

/** How many downloads may run at once: two per account (two without accounts), on every exit. */
export function downloadSlots(): number {
  const n = load().length;
  return (n ? n * PER_ACCOUNT : ANON_SLOTS) * Math.max(1, exits().filter(exitUp).length);
}

/** A private copy of an account's cookies for one yt-dlp run. */
function privateCopy(id: string): string | null {
  const tmp = path.join(config.tmpDir, `ck-${newId()}.txt`);
  try {
    fs.mkdirSync(config.tmpDir, { recursive: true });
    fs.copyFileSync(cookiesOf(id), tmp);
    fs.chmodSync(tmp, 0o600);
    return tmp;
  } catch { return null; }
}

/** The jar yt-dlp wrote back (YouTube rotates some cookies) replaces the account's file atomically. */
function keepRefreshed(id: string, copy: string) {
  try {
    if (!fs.statSync(copy).size) return;
    const next = `${cookiesOf(id)}.${newId()}`;
    fs.copyFileSync(copy, next);
    fs.chmodSync(next, 0o600);
    fs.renameSync(next, cookiesOf(id));
  } catch { /* keep the old file */ }
}

const REFUSAL = /\b429\b|too many requests|rate.?limit|not a bot|sign in to confirm|confirm your age|use --cookies|\b403\b|forbidden/i;
/** Did YouTube refuse the account (as opposed to the video being gone or the network failing)? */
export const isRefusal = (msg: string) => REFUSAL.test(msg);

export interface AccountUse { cookies: string | null; label: string; proxy: string | null }
interface UseOpts { log?: (s: string) => void; cancelled?: () => boolean }

/** Without cookies: two at a time on every exit; one more try after a refusal, another exit after a failure. */
async function anonymous<T>(fn: (a: AccountUse) => Promise<T>, opts: UseOpts): Promise<T> {
  let retried = false;
  for (;;) {
    if (opts.cancelled?.()) throw new Error('Отменено');
    const e = exits().filter((x) => exitUp(x) && x.anon < ANON_SLOTS).sort((a, b) => a.busy - b.busy)[0];
    if (!e) { await sleep(300); continue; }
    e.anon++; e.busy++;
    try {
      return await fn({ cookies: null, label: `без аккаунта${via(e)}`, proxy: e.proxy });
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      if (opts.cancelled?.()) throw err;
      if (exitFailed(e, msg, opts.log)) continue;
      if (!isRefusal(msg) || retried) throw err;
      retried = true;
      opts.log?.('   … YouTube отказал, повтор через 15 с');
      await sleep(15_000);
    } finally {
      e.anon--; e.busy--;
    }
  }
}

/**
 * Runs a download with a free account on the least busy exit, waiting while all are busy. When YouTube
 * refuses an account, it rests and the next free one is tried; when none is left, one try without cookies.
 */
export async function withAccount<T>(fn: (a: AccountUse) => Promise<T>, opts: UseOpts = {}): Promise<T> {
  const tried = new Set<string>();
  for (;;) {
    if (opts.cancelled?.()) throw new Error('Отменено');
    const now = Date.now();
    const usable = load().filter((m) => !tried.has(m.id) && state(m.id).coolUntil <= now && fs.existsSync(cookiesOf(m.id)));
    if (!usable.length) {
      if (tried.size) opts.log?.('   … все аккаунты YouTube отдыхают — пробую без них');
      return anonymous(fn, opts);
    }
    // the least busy exit, then the least busy account with a free slot there
    const all = exits();
    let pick: { m: Meta; e: number } | null = null;
    for (const e of all.map((_, i) => i).filter((i) => exitUp(all[i])).sort((a, b) => all[a].busy - all[b].busy)) {
      const m = usable.filter((x) => (state(x.id).at[e] ?? 0) < PER_ACCOUNT).sort((a, b) => state(a.id).running - state(b.id).running)[0];
      if (m) { pick = { m, e }; break; }
    }
    if (!pick) { await sleep(300); continue; }
    const { m: free, e: ei } = pick;
    const exit = all[ei];
    const s = state(free.id);
    const copy = privateCopy(free.id);
    if (!copy) { tried.add(free.id); continue; }
    s.running++; s.at[ei] = (s.at[ei] ?? 0) + 1; exit.busy++;
    s.lastUsedAt = new Date().toISOString();
    try {
      const r = await fn({ cookies: copy, label: `${free.label}${via(exit)}`, proxy: exit.proxy });
      s.ok++;
      s.lastError = null;
      keepRefreshed(free.id, copy);
      return r;
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (opts.cancelled?.()) throw e;
      // the other server is down: not the account's fault — same account, another exit
      if (exitFailed(exit, msg, opts.log)) continue;
      tried.add(free.id);
      s.failed++;
      s.lastError = msg.slice(0, 300);
      if (!isRefusal(msg)) throw e;
      s.coolUntil = Date.now() + COOL_MS;
      opts.log?.(`   … YouTube отказал аккаунту «${free.label}» — отдыхает ${COOL_MS / 60_000} мин, беру следующий`);
    } finally {
      s.running--; s.at[ei]--; exit.busy--;
      try { fs.unlinkSync(copy); } catch { /* gone */ }
    }
  }
}

let turn = 0;
/** Cookies for a quick lookup (search, upload details): a private copy of one of the accounts. */
export async function withLookupCookies<T>(fn: (args: string[]) => Promise<T>): Promise<T> {
  const now = Date.now();
  const list = load().filter((m) => state(m.id).coolUntil <= now);
  if (!list.length) return fn([]);
  const m = list[turn++ % list.length];
  const tmp = privateCopy(m.id);
  if (!tmp) return fn([]);
  try { return await fn(['--cookies', tmp]); } finally { try { fs.unlinkSync(tmp); } catch { /* gone */ } }
}
