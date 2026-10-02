// Several YouTube accounts for yt-dlp (a cookies.txt each, uploaded in the admin panel and kept only on
// the server). Every download takes the least busy account — up to two downloads per account at a time —
// so N accounts fetch 2·N tracks at once. An account YouTube refuses ("not a bot", 429) rests for a while and the
// download moves on to the next one; with every account resting it is tried without cookies.
// Every yt-dlp run gets a private copy of the cookies (it writes the jar back on exit); after a good
// download the refreshed jar replaces the account's file in one step.
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
}

interface Meta { id: string; label: string; createdAt: string }
interface Live { running: number; coolUntil: number; ok: number; failed: number; lastError: string | null; lastUsedAt: string | null }

/** How long an account rests after YouTube refused it. */
const COOL_MS = 20 * 60_000;
/** Downloads at once without any account, and per account. */
const ANON_SLOTS = 2;
const PER_ACCOUNT = 2;
const MAX_ACCOUNTS = 10;

const dir = () => path.join(config.dataDir, 'youtube-accounts');
const metaFile = () => path.join(dir(), 'accounts.json');
const cookiesOf = (id: string) => path.join(dir(), `${id}.txt`);
// earlier versions: one cookies file, given to every yt-dlp call through its user config
const legacyCookies = () => path.join(config.dataDir, 'youtube-cookies.txt');
const legacyConfig = () => path.join(process.env.XDG_CONFIG_HOME || path.join(config.dataDir, 'config'), 'yt-dlp', 'config');

const live = new Map<string, Live>();
function state(id: string): Live {
  let s = live.get(id);
  if (!s) live.set(id, (s = { running: 0, coolUntil: 0, ok: 0, failed: 0, lastError: null, lastUsedAt: null }));
  return s;
}

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
      ok: s.ok, failed: s.failed, lastError: s.lastError, lastUsedAt: s.lastUsedAt,
    };
  });
}

/** Adds an account from a cookies.txt (Netscape format). */
export function addAccount(text: string, label?: string | null): YtAccountInfo[] {
  const lines = text.replace(/\r/g, '').split('\n');
  const rows = lines.filter((l) => l && !l.startsWith('# ') && l !== '#' && l.split('\t').length === 7);
  if (!rows.length || !rows.some((l) => /youtube\.com\t/.test(l))) throw badRequest('Нужен файл cookies.txt (формат Netscape) с cookies youtube.com');
  const list = load();
  if (list.length >= MAX_ACCOUNTS) throw badRequest(`Не больше ${MAX_ACCOUNTS} аккаунтов`);
  const id = newId();
  fs.mkdirSync(dir(), { recursive: true });
  fs.writeFileSync(cookiesOf(id), `# Netscape HTTP Cookie File\n${lines.filter((l) => !/^# Netscape/.test(l)).join('\n')}\n`, { mode: 0o600 });
  list.push({ id, label: label?.trim().slice(0, 60) || `Аккаунт ${list.length + 1}`, createdAt: new Date().toISOString() });
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

/** How many downloads may run at once: two per account (two without accounts). */
export function downloadSlots(): number {
  const n = load().length;
  return n ? n * PER_ACCOUNT : ANON_SLOTS;
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

export interface AccountUse { cookies: string | null; label: string }
interface UseOpts { log?: (s: string) => void; cancelled?: () => boolean }

let anonBusy = 0;
async function anonymous<T>(fn: (a: AccountUse) => Promise<T>, opts: UseOpts): Promise<T> {
  while (anonBusy >= ANON_SLOTS) {
    if (opts.cancelled?.()) throw new Error('Отменено');
    await sleep(300);
  }
  anonBusy++;
  try {
    try {
      return await fn({ cookies: null, label: 'без аккаунта' });
    } catch (e: any) {
      if (!isRefusal(e?.message ?? '') || opts.cancelled?.()) throw e;
      opts.log?.('   … YouTube отказал, повтор через 15 с');
      await sleep(15_000);
      return await fn({ cookies: null, label: 'без аккаунта' });
    }
  } finally {
    anonBusy--;
  }
}

/**
 * Runs a download with a free account, waiting while all are busy. When YouTube refuses an account,
 * it rests and the next free one is tried; when none is left, one try without cookies.
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
    // the least busy account with a free slot
    const free = usable.filter((m) => state(m.id).running < PER_ACCOUNT).sort((a, b) => state(a.id).running - state(b.id).running)[0];
    if (!free) { await sleep(300); continue; }
    const s = state(free.id);
    const copy = privateCopy(free.id);
    if (!copy) { tried.add(free.id); continue; }
    s.running++;
    s.lastUsedAt = new Date().toISOString();
    tried.add(free.id);
    try {
      const r = await fn({ cookies: copy, label: free.label });
      s.ok++;
      s.lastError = null;
      keepRefreshed(free.id, copy);
      return r;
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      s.failed++;
      s.lastError = msg.slice(0, 300);
      if (!isRefusal(msg) || opts.cancelled?.()) throw e;
      s.coolUntil = Date.now() + COOL_MS;
      opts.log?.(`   … YouTube отказал аккаунту «${free.label}» — отдыхает ${COOL_MS / 60_000} мин, беру следующий`);
    } finally {
      s.running--;
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
