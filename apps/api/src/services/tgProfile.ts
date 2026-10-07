// What plays now, in the listener's own Telegram profile: the "about" line becomes "🎧 Artist — Title"
// while the music plays and goes back to what it was a few minutes after it stops. The listener links their
// Telegram account once (phone, the code Telegram sends, the cloud password if set); the session is kept
// encrypted and used for nothing but that line. The app's Telegram API id/hash are the admin's
// (my.telegram.org → API development tools, in Админка → Сервисы).
import crypto from 'node:crypto';
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { Logger, LogLevel } from 'telegram/extensions/Logger.js';
import type { DB } from '../lib/db.js';
import { config } from '../config.js';
import { getMeta, setMeta } from './meta.js';
import { nowPlaying } from './social.js';

/** Telegram's limit for the "about" line without Premium. */
const ABOUT_MAX = 70;
/** at most one change a minute (Telegram dislikes a profile edited too often) */
const MIN_GAP = 60_000;
/** the old line comes back this long after the music stopped */
const RESTORE_AFTER = 5 * 60_000;
const MARK = '🎧';

export function tgApp(db: DB): { id: number; hash: string } | null {
  const id = Number(getMeta(db, 'tgapp.id')), hash = getMeta(db, 'tgapp.hash');
  return id > 0 && hash ? { id, hash } : null;
}

export function setTgApp(db: DB, id: number, hash: string | null) {
  setMeta(db, 'tgapp.id', String(id));
  if (hash) setMeta(db, 'tgapp.hash', hash.trim());
}

/* ---------- the session, encrypted at rest ---------- */

const key = () => crypto.createHash('sha256').update(`${config.jwtSecret}:tg-profile`).digest();

export function seal(text: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), enc.toString('base64')].join(':');
}

export function unseal(s: string): string {
  const [v, iv, tag, enc] = s.split(':');
  if (v !== 'v1') throw new Error('unknown format');
  const d = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(enc, 'base64')), d.final()]).toString('utf8');
}

/** "🎧 Artist — Title", cut to Telegram's limit. */
export function aboutLine(artist: string, title: string): string {
  const s = `${MARK} ${artist} — ${title}`.replace(/\s+/g, ' ').trim();
  return s.length <= ABOUT_MAX ? s : `${s.slice(0, ABOUT_MAX - 1).trimEnd()}…`;
}

function client(app: { id: number; hash: string }, session = '') {
  return new TelegramClient(new StringSession(session), app.id, app.hash, {
    connectionRetries: 3, baseLogger: new Logger(LogLevel.NONE), deviceModel: 'avr music', systemVersion: 'server', appVersion: '1.0',
  });
}

/** Telegram's error codes in words people understand. */
function explain(e: any): Error {
  const m = String(e?.errorMessage ?? e?.message ?? e);
  const words: Record<string, string> = {
    PHONE_NUMBER_INVALID: 'Неверный номер — в международном формате, например +79001234567',
    PHONE_CODE_INVALID: 'Неверный код', PHONE_CODE_EXPIRED: 'Код устарел — запросите новый',
    PASSWORD_HASH_INVALID: 'Неверный облачный пароль', PHONE_NUMBER_BANNED: 'Этот номер заблокирован в Telegram',
    API_ID_INVALID: 'Администратор указал неверные API ID / API hash',
  };
  if (/FLOOD/.test(m)) return new Error(`Telegram просит подождать${e?.seconds ? ` ${Math.ceil(e.seconds / 60)} мин` : ''}`);
  return new Error(words[m] ?? `Telegram: ${m}`);
}

/* ---------- linking an account ---------- */

interface Pending { client: TelegramClient; phone: string; hash: string; at: number }
const pending = new Map<string, Pending>();

function dropPending(userId: string) {
  const p = pending.get(userId);
  if (p) { pending.delete(userId); void p.client.disconnect().catch(() => {}); }
}

setInterval(() => { for (const [u, p] of pending) if (Date.now() - p.at > 10 * 60_000) dropPending(u); }, 60_000).unref();

/** Telegram sends a login code to the listener's Telegram (or by SMS). */
export async function tgLoginStart(db: DB, userId: string, phone: string): Promise<{ viaApp: boolean }> {
  const app = tgApp(db);
  if (!app) throw new Error('Администратор ещё не подключил Telegram API (Админка → Сервисы)');
  dropPending(userId);
  const c = client(app);
  try {
    await c.connect();
    const r = await c.sendCode({ apiId: app.id, apiHash: app.hash }, phone);
    pending.set(userId, { client: c, phone, hash: r.phoneCodeHash, at: Date.now() });
    return { viaApp: r.isCodeViaApp };
  } catch (e) { void c.disconnect().catch(() => {}); throw explain(e); }
}

/** The code from Telegram; with a cloud password set, that is asked next. */
export async function tgLoginCode(db: DB, userId: string, code: string): Promise<{ needPassword: boolean }> {
  const p = pending.get(userId);
  if (!p) throw new Error('Начните заново — код устарел');
  try {
    await p.client.invoke(new Api.auth.SignIn({ phoneNumber: p.phone, phoneCodeHash: p.hash, phoneCode: code }));
  } catch (e: any) {
    if (e?.errorMessage === 'SESSION_PASSWORD_NEEDED') return { needPassword: true };
    throw explain(e);
  }
  await finish(db, userId, p);
  return { needPassword: false };
}

export async function tgLoginPassword(db: DB, userId: string, password: string) {
  const p = pending.get(userId);
  const app = tgApp(db);
  if (!p || !app) throw new Error('Начните заново — код устарел');
  let failed: unknown = null;
  try {
    await p.client.signInWithPassword({ apiId: app.id, apiHash: app.hash }, { password: async () => password, onError: async (e) => { failed = e; return true; } });
  } catch (e) { throw explain(failed ?? e); }
  await finish(db, userId, p);
}

async function finish(db: DB, userId: string, p: Pending) {
  pending.delete(userId);
  try {
    const me = (await p.client.getMe()) as Api.User;
    const full = await p.client.invoke(new Api.users.GetFullUser({ id: new Api.InputUserSelf() }));
    const about = full.fullUser.about ?? '';
    const session = (p.client.session as StringSession).save();
    db.prepare(`INSERT INTO tg_profiles (user_id, session, username, original_about, enabled) VALUES (?,?,?,?,1)
      ON CONFLICT(user_id) DO UPDATE SET session = excluded.session, username = excluded.username, original_about = excluded.original_about, enabled = 1`)
      .run(userId, seal(session), me.username ?? null, about.startsWith(MARK) ? '' : about);
    live.set(userId, { client: p.client, connectedAt: Date.now(), lastText: null, lastAt: 0, nextAllowed: 0, timer: null, shown: false, stoppedAt: null });
  } catch (e) { void p.client.disconnect().catch(() => {}); throw explain(e); }
}

export function tgProfile(db: DB, userId: string): { username: string | null; enabled: boolean } | null {
  const r = db.prepare('SELECT username, enabled FROM tg_profiles WHERE user_id = ?').get(userId) as any;
  return r ? { username: r.username ?? null, enabled: !!r.enabled } : null;
}

/* ---------- keeping the line up to date ---------- */

interface Live { client: TelegramClient | null; connectedAt: number; lastText: string | null; lastAt: number; nextAllowed: number; timer: NodeJS.Timeout | null; shown: boolean; stoppedAt: number | null }
const live = new Map<string, Live>();

function stateOf(userId: string): Live {
  let s = live.get(userId);
  if (!s) live.set(userId, (s = { client: null, connectedAt: 0, lastText: null, lastAt: 0, nextAllowed: 0, timer: null, shown: false, stoppedAt: null }));
  return s;
}

async function connected(db: DB, userId: string, s: Live): Promise<TelegramClient | null> {
  if (s.client?.connected) return s.client;
  const app = tgApp(db);
  const row = db.prepare('SELECT session FROM tg_profiles WHERE user_id = ?').get(userId) as any;
  if (!app || !row) return null;
  const c = client(app, unseal(row.session));
  await c.connect();
  s.client = c;
  s.connectedAt = Date.now();
  return c;
}

/** What the line should say for this listener now (null: the old line). */
function wanted(db: DB, userId: string): string | null {
  const n = nowPlaying(db, userId);
  if (!n || !n.playing) return null;
  return aboutLine(n.track.artist.name, n.track.title);
}

async function apply(db: DB, userId: string, text: string | null) {
  const s = stateOf(userId);
  const row = db.prepare('SELECT original_about, enabled FROM tg_profiles WHERE user_id = ?').get(userId) as any;
  if (!row) return;
  if (!row.enabled && text) text = null;
  if (!text && !s.shown) return;
  const c = await connected(db, userId, s);
  if (!c) return;
  try {
    // the first song after a quiet time: the line the listener has now is the one to come back to
    if (text && !s.shown) {
      const full = await c.invoke(new Api.users.GetFullUser({ id: new Api.InputUserSelf() }));
      const now = full.fullUser.about ?? '';
      if (!now.startsWith(MARK)) db.prepare('UPDATE tg_profiles SET original_about = ? WHERE user_id = ?').run(now, userId);
    }
    const about = text ?? (db.prepare('SELECT original_about FROM tg_profiles WHERE user_id = ?').get(userId) as any)?.original_about ?? '';
    await c.invoke(new Api.account.UpdateProfile({ about }));
    s.lastText = text;
    s.lastAt = Date.now();
    s.shown = !!text;
  } catch (e: any) {
    const m = String(e?.errorMessage ?? '');
    if (/FLOOD/.test(m)) s.nextAllowed = Date.now() + (Number(e?.seconds) || 300) * 1000;
    // the listener ended the session in Telegram (Settings → Devices): unlinked
    else if (/AUTH_KEY_UNREGISTERED|SESSION_REVOKED|USER_DEACTIVATED|AUTH_KEY_DUPLICATED/.test(m)) forget(db, userId);
  }
}

/** Brings the line up to date for this listener (now, or as soon as Telegram allows). */
export function tgSync(db: DB, userId: string) {
  if (!tgProfile(db, userId)) return;
  const s = stateOf(userId);
  const text = wanted(db, userId);
  s.stoppedAt = text ? null : s.stoppedAt ?? Date.now();
  if (text === s.lastText && (text !== null || !s.shown)) return;
  // the music stopped: wait a few minutes before the old line comes back (a pause is not the end)
  if (!text && Date.now() - (s.stoppedAt ?? 0) < RESTORE_AFTER) return;
  const at = Math.max(s.lastAt + MIN_GAP, s.nextAllowed);
  if (s.timer) return;
  const run = () => { s.timer = null; void apply(db, userId, wanted(db, userId)).catch(() => {}); };
  if (Date.now() >= at) run();
  else { s.timer = setTimeout(run, at - Date.now()); s.timer.unref(); }
}

function forget(db: DB, userId: string) {
  const s = live.get(userId);
  if (s?.timer) clearTimeout(s.timer);
  void s?.client?.disconnect().catch(() => {});
  live.delete(userId);
  db.prepare('DELETE FROM tg_profiles WHERE user_id = ?').run(userId);
}

/** On or off without unlinking (off puts the old line back). */
export async function tgSetEnabled(db: DB, userId: string, on: boolean) {
  db.prepare('UPDATE tg_profiles SET enabled = ? WHERE user_id = ?').run(on ? 1 : 0, userId);
  if (!on) await apply(db, userId, null).catch(() => {});
  else tgSync(db, userId);
}

/** Unlinks: the old line comes back and the session is ended in Telegram too. */
export async function tgUnlink(db: DB, userId: string) {
  const s = stateOf(userId);
  try {
    if (s.shown) await apply(db, userId, null);
    const c = await connected(db, userId, s);
    await c?.invoke(new Api.auth.LogOut());
  } catch { /* gone already */ }
  forget(db, userId);
}

/** Every minute: lines of people who stopped listening go back; idle connections close. */
export function startTgProfiles(db: DB) {
  setInterval(() => {
    for (const r of db.prepare('SELECT user_id FROM tg_profiles WHERE enabled = 1').all() as any[]) {
      try { tgSync(db, r.user_id); } catch { /* next time */ }
    }
    for (const [u, s] of live) {
      if (s.client && !s.timer && !s.shown && Date.now() - s.lastAt > 20 * 60_000 && Date.now() - s.connectedAt > 60_000) {
        void s.client.disconnect().catch(() => {});
        s.client = null;
      }
      if (!tgProfile(db, u)) live.delete(u);
    }
  }, 60_000).unref();
}
