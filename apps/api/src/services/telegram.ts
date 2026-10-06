// The Telegram bot. Linked from the app's profile, it takes a song's name or a link and fetches the song
// to the server, answering with where to play it; passes on what friends send, new releases, the Sunday
// digest and concerts; answers /now (what friends play) and /new (fresh in the library); and tells the
// admins when the music storage goes away. The token is the admin's (Админка → Telegram), kept in the
// database and, for the storage server's watchdog, in a root-only file next to the music.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Track } from '@avrmusic/shared';
import type { DB } from '../lib/db.js';
import { config } from '../config.js';
import { enqueue, getJob, listJobs } from './jobs.js';
import { searchCatalog } from './catalog.js';
import { nowPlaying } from './social.js';
import { getTrack } from './library.js';
import { getMeta, setMeta } from './meta.js';

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function telegramBot(db: DB): string | null { return getMeta(db, 'telegram.token') ? getMeta(db, 'telegram.bot') : null; }

async function tg(token: string, method: string, body: Record<string, unknown> = {}, timeoutMs = 20_000): Promise<any> {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
  });
  const j = (await r.json().catch(() => null)) as any;
  if (!j?.ok) throw Object.assign(new Error(j?.description ?? `Telegram ответил ${r.status}`), { code: j?.error_code ?? r.status });
  return j.result;
}

/** Sends to a chat; a chat that blocked the bot is unlinked. */
async function send(db: DB, chatId: number | string, html: string) {
  const token = getMeta(db, 'telegram.token');
  if (!token) return;
  try {
    await tg(token, 'sendMessage', { chat_id: chatId, text: html.slice(0, 4000), parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
  } catch (e: any) {
    if (e?.code === 403) db.prepare('DELETE FROM telegram_links WHERE chat_id = ?').run(String(chatId));
  }
}

export function sendToUser(db: DB, userId: string, html: string) {
  const l = db.prepare('SELECT chat_id FROM telegram_links WHERE user_id = ?').get(userId) as any;
  if (l) void send(db, l.chat_id, html);
}

function adminChats(db: DB): string[] {
  return (db.prepare(`SELECT l.chat_id FROM telegram_links l JOIN users u ON u.id = l.user_id WHERE u.role = 'admin' AND u.disabled = 0`).all() as any[]).map((r) => String(r.chat_id));
}

/* ---------- settings and linking ---------- */

/** The admin sets (or removes, with null) the bot's token; it is checked with Telegram first. */
export async function setTelegramToken(db: DB, token: string | null): Promise<{ bot: string | null }> {
  if (!token) {
    setMeta(db, 'telegram.token', null);
    setMeta(db, 'telegram.bot', null);
    startTelegram(db);
    return { bot: null };
  }
  const me = await tg(token, 'getMe');
  setMeta(db, 'telegram.token', token);
  setMeta(db, 'telegram.bot', me.username);
  setMeta(db, 'telegram.offset', null);
  startTelegram(db);
  return { bot: me.username };
}

const codes = new Map<string, { userId: string; at: number }>();

/** A one-time link that opens the bot and ties this chat to the listener. */
export function telegramLinkUrl(db: DB, userId: string): string {
  const bot = telegramBot(db);
  if (!bot) throw new Error('Администратор ещё не подключил бота (Админка → Telegram)');
  for (const [k, v] of codes) if (Date.now() - v.at > 15 * 60_000) codes.delete(k);
  const code = crypto.randomBytes(12).toString('base64url');
  codes.set(code, { userId, at: Date.now() });
  return `https://t.me/${bot}?start=${code}`;
}

export function telegramLink(db: DB, userId: string): { username: string | null } | null {
  const l = db.prepare('SELECT username FROM telegram_links WHERE user_id = ?').get(userId) as any;
  return l ? { username: l.username ?? null } : null;
}

export function unlinkTelegram(db: DB, userId: string) {
  db.prepare('DELETE FROM telegram_links WHERE user_id = ?').run(userId);
  writeWatchdog(db);
}

/* ---------- the storage server's watchdog ---------- */

/** What the watchdog on the storage server needs to warn the admins: the token, their chats, what to check. */
export function writeWatchdog(db: DB) {
  if (config.mediaMarker && !fs.existsSync(path.join(config.mediaDir, config.mediaMarker))) return;
  const file = path.join(config.mediaDir, '.watchdog.env');
  const token = getMeta(db, 'telegram.token');
  const chats = adminChats(db).filter((c) => /^-?\d+$/.test(c));
  try {
    if (!token || !chats.length || !/^[\w:-]+$/.test(token)) { fs.rmSync(file, { force: true }); return; }
    fs.writeFileSync(`${file}.part`, `TOKEN=${token}\nCHATS=${chats.join(' ')}\nURL=${config.publicUrl}/api/health\n`, { mode: 0o600 });
    fs.renameSync(`${file}.part`, file);
  } catch { /* the storage is away: written next time */ }
}

/* ---------- what the bot answers ---------- */

const HELP = [
  'Пришлите <b>название песни</b> (можно с исполнителем) — скачаю её на сервер и пришлю, где слушать.',
  'Ссылка на плейлист <b>Spotify</b> или <b>Яндекс Музыки</b> — перенесу его в вашу библиотеку.',
  '',
  '/now — кто что слушает сейчас',
  '/new — свежее в библиотеке',
  '/unlink — отвязать бота',
].join('\n');

const trackUrl = (t: { album: { id: string } | null }) => (t.album ? `${config.publicUrl}/album/${t.album.id}` : config.publicUrl);
const trackLine = (t: { title: string; artist: { name: string }; album: { id: string } | null }) =>
  `<a href="${esc(trackUrl(t))}">${esc(t.artist.name)} — ${esc(t.title)}</a>`;

function mayAcquire(db: DB, userId: string): boolean {
  const u = db.prepare('SELECT role, can_acquire FROM users WHERE id = ?').get(userId) as any;
  if (!u || config.acquireRole === 'off' || (config.acquireRole === 'admin' && u.role !== 'admin')) return false;
  return u.role === 'admin' || u.can_acquire !== 0;
}

/** Jobs started from the bot: the chat hears how they ended. */
const watching = new Map<string, { chat: string; deezerId: number | null; what: string }>();

function watchJobs(db: DB) {
  for (const [id, w] of watching) {
    const j = getJob(id);
    if (!j) { watching.delete(id); continue; }
    if (j.status !== 'done' && j.status !== 'error') continue;
    watching.delete(id);
    let t: Track | null = j.imported?.[0] ?? null;
    if (!t && w.deezerId) {
      const have = db.prepare('SELECT id FROM tracks WHERE deezer_id = ?').get(w.deezerId) as any;
      t = have ? getTrack(db, have.id) : null;
    }
    if (j.status === 'done' && t) void send(db, w.chat, `✅ Готово: ${trackLine(t)}`);
    else if (j.status === 'done') void send(db, w.chat, `✅ ${esc(w.what)} — готово, смотрите в библиотеке`);
    else void send(db, w.chat, `Не получилось: ${esc(w.what)}${j.error ? ` — ${esc(j.error)}` : ''}`);
  }
}

async function onMessage(db: DB, m: any) {
  if (m?.chat?.type !== 'private') return;
  const chat = String(m.chat.id);
  const text = String(m.text ?? '').trim();
  const reply = (html: string) => send(db, chat, html);

  const start = /^\/start(?:@\w+)?\s+([\w-]{8,64})$/.exec(text);
  if (start) {
    const c = codes.get(start[1]);
    if (!c || Date.now() - c.at > 15 * 60_000) return reply('Ссылка устарела — откройте привязку в приложении ещё раз.');
    codes.delete(start[1]);
    db.prepare('DELETE FROM telegram_links WHERE chat_id = ? OR user_id = ?').run(chat, c.userId);
    db.prepare('INSERT INTO telegram_links (user_id, chat_id, username) VALUES (?,?,?)').run(c.userId, chat, m.from?.username ?? null);
    writeWatchdog(db);
    const name = (db.prepare('SELECT display_name FROM users WHERE id = ?').get(c.userId) as any)?.display_name ?? '';
    return reply(`Привязано к <b>${esc(name)}</b> в avr music.\n\n${HELP}`);
  }

  const link = db.prepare('SELECT l.user_id, u.disabled FROM telegram_links l JOIN users u ON u.id = l.user_id WHERE l.chat_id = ?').get(chat) as any;
  if (!link || link.disabled) return reply('Это бот <b>avr music</b>. Привяжите его в приложении: Профиль → Telegram.');
  const userId = link.user_id as string;

  if (/^\/(start|help)\b/.test(text)) return reply(HELP);
  if (/^\/unlink\b/.test(text)) { unlinkTelegram(db, userId); return reply('Бот отвязан. Привязать снова можно в приложении.'); }
  if (/^\/now\b/.test(text)) {
    const users = db.prepare('SELECT id, display_name FROM users WHERE disabled = 0 AND id <> ?').all(userId) as any[];
    const lines = users.map((u) => ({ u, n: nowPlaying(db, u.id, userId) })).filter((x) => x.n)
      .map((x) => `🎧 <b>${esc(x.u.display_name)}</b>${x.n!.playing ? '' : ' (пауза)'}: ${trackLine(x.n!.track)}`);
    return reply(lines.length ? lines.join('\n') : 'Сейчас никто не слушает.');
  }
  if (/^\/new\b/.test(text)) {
    const ids = (db.prepare('SELECT id FROM tracks ORDER BY created_at DESC LIMIT 12').all() as any[]).map((r) => r.id as string);
    const lines = ids.map((id) => getTrack(db, id, userId)).filter((t) => !!t).map((t) => `• ${trackLine(t!)}`);
    return reply(lines.length ? `<b>Свежее в библиотеке</b>\n${lines.join('\n')}` : 'Библиотека пока пуста.');
  }
  if (text.startsWith('/')) return reply(HELP);
  if (text.length < 2) return;

  const url = /(https?:\/\/\S+)/i.exec(text)?.[1];
  if (url) {
    if (/spotify\.com|music\.yandex\./i.test(url)) {
      const job = enqueue({ kind: 'acquire', title: 'Импорт плейлиста по ссылке', requestedBy: userId }, { kind: 'link', url, userId, canAcquire: mayAcquire(db, userId) });
      watching.set(job.id, { chat, deezerId: null, what: 'Плейлист по ссылке' });
      return reply('Переношу плейлист — он появится в вашей библиотеке. Напишу, когда закончу.');
    }
    const admin = (db.prepare('SELECT role FROM users WHERE id = ?').get(userId) as any)?.role === 'admin';
    if (admin && /youtu\.?be|soundcloud\.com|bandcamp\.com/i.test(url)) {
      const job = enqueue({ kind: 'url', url, mode: 'audio', requestedBy: userId }, {});
      watching.set(job.id, { chat, deezerId: null, what: 'Загрузка по ссылке' });
      return reply('Скачиваю по ссылке…');
    }
    return reply('Такие ссылки не понимаю. Пришлите ссылку на плейлист Spotify или Яндекс Музыки — или просто название песни.');
  }

  // a song by its name: from the library if it is there, else fetched
  let found;
  try { found = await searchCatalog(db, text.slice(0, 200), 5); } catch { return reply('Каталог сейчас не отвечает — попробуйте чуть позже.'); }
  const t = found.top?.kind === 'track' ? found.top.item : found.tracks[0];
  if (!t) return reply('Ничего не нашёл. Попробуйте написать иначе — например, «исполнитель — название».');
  const label = `${t.artist.name} — ${t.title}`;
  if (t.libraryTrackId) {
    const lib = getTrack(db, t.libraryTrackId, userId);
    if (lib) return reply(`Уже есть: ${trackLine(lib)}`);
  }
  if (!mayAcquire(db, userId)) return reply(`Нашёл «${esc(label)}», но скачивать треки на сервер вам не разрешено.`);
  const dup = listJobs().find((j) => j.kind === 'acquire' && (j.status === 'queued' || j.status === 'running') && (j.payload as any)?.kind === 'track' && (j.payload as any)?.id === t.id);
  const job = dup ?? enqueue({ kind: 'acquire', title: label, requestedBy: userId }, { kind: 'track', id: t.id });
  watching.set(job.id, { chat, deezerId: t.id, what: label });
  return reply(`Скачиваю «${esc(label)}»…`);
}

/* ---------- passing on what arrives in the inbox ---------- */

function describeShare(db: DB, s: any): string | null {
  const from = s.from_user ? (db.prepare('SELECT display_name FROM users WHERE id = ?').get(s.from_user) as any)?.display_name ?? '' : '';
  const note = s.message && !['release', 'digest', 'concert'].includes(s.kind) && !s.message.startsWith('{') ? `\n«${esc(s.message)}»` : '';
  const json = () => { try { return JSON.parse(s.message || '{}'); } catch { return {}; } };
  switch (s.kind) {
    case 'track': { const t = getTrack(db, s.ref_id, s.to_user); return t ? `📨 <b>${esc(from)}</b>: ${trackLine(t)}${note}` : null; }
    case 'album': { const a = db.prepare('SELECT al.id, al.title, ar.name FROM albums al JOIN artists ar ON ar.id = al.artist_id WHERE al.id = ?').get(s.ref_id) as any;
      return a ? `📨 <b>${esc(from)}</b>: альбом <a href="${config.publicUrl}/album/${a.id}">${esc(a.name)} — ${esc(a.title)}</a>${note}` : null; }
    case 'artist': { const a = db.prepare('SELECT id, name FROM artists WHERE id = ?').get(s.ref_id) as any;
      return a ? `📨 <b>${esc(from)}</b>: исполнитель <a href="${config.publicUrl}/artist/${a.id}">${esc(a.name)}</a>${note}` : null; }
    case 'playlist': { const p = db.prepare('SELECT id, title FROM playlists WHERE id = ?').get(s.ref_id) as any;
      return p ? `📨 <b>${esc(from)}</b>: плейлист <a href="${config.publicUrl}/playlist/${p.id}">${esc(p.title)}</a>${note}` : null; }
    case 'jam': return `🎧 <b>${esc(from)}</b> зовёт слушать вместе — откройте avr music${note}`;
    case 'badge': {
      const b = db.prepare('SELECT title, emoji FROM badges WHERE id = ?').get(s.ref_id) as any;
      return b ? `🏅 Новая ачивка: ${esc(b.emoji)} <b>${esc(b.title)}</b>` : null;
    }
    case 'game': return `🎲 <b>${esc(from)}</b> зовёт в «Угадай мелодию» — откройте avr music${note}`;
    case 'release': { const r = json(); return `🆕 Новый релиз: <b>${esc(r.artist)}</b> — ${esc(r.title)}`; }
    case 'concert': { const c = json(); return `🎤 Концерт: <b>${esc(c.artist)}</b> — ${esc(c.title)}\n${esc(c.date ?? '')}${c.place ? `, ${esc(c.place)}` : ''}${c.url ? `\n${esc(c.url)}` : ''}`; }
    case 'digest': {
      const d = json();
      const my = d.myTop ? getTrack(db, d.myTop, s.to_user) : null;
      const group = d.groupTop ? getTrack(db, d.groupTop, s.to_user) : null;
      return [`📊 <b>Ваша неделя</b>: ${d.minutes ?? 0} мин музыки`, my ? `Трек недели: ${trackLine(my)}` : '', group ? `Трек компании: ${trackLine(group)}` : '']
        .filter(Boolean).join('\n');
    }
    default: return null;
  }
}

function forwardShares(db: DB) {
  const last = Number(getMeta(db, 'telegram.shares') ?? -1);
  const max = (db.prepare('SELECT COALESCE(MAX(rowid), 0) m FROM shares').get() as any).m as number;
  // linked for the first time: start from now, not from the whole history
  if (last < 0 || last > max) { setMeta(db, 'telegram.shares', String(max)); return; }
  const rows = db.prepare(`SELECT s.rowid r, s.*, l.chat_id FROM shares s JOIN telegram_links l ON l.user_id = s.to_user
    WHERE s.rowid > ? AND s.rowid <= ? ORDER BY s.rowid LIMIT 40`).all(last, max) as any[];
  for (const s of rows) { const html = describeShare(db, s); if (html) void send(db, s.chat_id, html); }
  setMeta(db, 'telegram.shares', String(rows.length === 40 ? rows[rows.length - 1].r : max));
}

/* ---------- running ---------- */

let loop: { stop: boolean } | null = null;
let storageUp: boolean | null = null;
let storageMisses = 0;

/** The storage gone (or back): the admins hear it from the main server too. */
function watchStorage(db: DB) {
  if (!config.mediaMarker) return;
  const up = fs.existsSync(path.join(config.mediaDir, config.mediaMarker));
  if (up) storageMisses = 0; else storageMisses++;
  const now = up ? true : storageMisses >= 3 ? false : storageUp;
  if (storageUp !== null && now !== storageUp) {
    const html = now ? '✅ Хранилище музыки снова на месте' : '⚠️ Хранилище музыки недоступно — музыка не играет, загрузки ждут';
    for (const c of adminChats(db)) void send(db, c, html);
  }
  if (now !== null) storageUp = now;
  if (up) writeWatchdog(db);
}

/** Starts (or restarts, after the token changed) the bot's long poll. */
export function startTelegram(db: DB) {
  if (loop) loop.stop = true;
  const token = getMeta(db, 'telegram.token');
  writeWatchdog(db);
  if (!token) { loop = null; return; }
  const me = { stop: false };
  loop = me;
  void (async () => {
    let offset = Number(getMeta(db, 'telegram.offset') ?? 0);
    while (!me.stop) {
      try {
        const updates = await tg(token, 'getUpdates', { offset, timeout: 50, allowed_updates: ['message'] }, 65_000) as any[];
        if (me.stop) break;
        for (const u of updates) {
          offset = u.update_id + 1;
          setMeta(db, 'telegram.offset', String(offset));
          if (u.message) await onMessage(db, u.message).catch(() => {});
        }
      } catch { await sleep(15_000); }
    }
  })();
}

let timers = false;
export function startTelegramWatchers(db: DB) {
  startTelegram(db);
  if (timers) return;
  timers = true;
  setInterval(() => {
    if (!getMeta(db, 'telegram.token')) return;
    try { forwardShares(db); watchJobs(db); } catch { /* next time */ }
  }, 10_000).unref();
  setInterval(() => { try { watchStorage(db); } catch { /* next time */ } }, 60_000).unref();
}
