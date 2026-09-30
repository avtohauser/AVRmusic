// YouTube cookies for yt-dlp (uploaded in the admin panel, kept only on the server). When YouTube
// refuses the server ("Sign in to confirm you're not a bot"), a logged-in session lets yt-dlp through.
// yt-dlp picks them up in every call through its user config file ($XDG_CONFIG_HOME/yt-dlp/config).
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { badRequest } from '../lib/errors.js';

const cookiesFile = () => path.join(config.dataDir, 'youtube-cookies.txt');
const configFile = () => path.join(process.env.XDG_CONFIG_HOME || path.join(config.dataDir, 'config'), 'yt-dlp', 'config');

export interface CookiesStatus { present: boolean; updatedAt: string | null; youtubeCookies: number; loggedIn: boolean }

export function cookiesStatus(): CookiesStatus {
  try {
    const text = fs.readFileSync(cookiesFile(), 'utf8');
    const rows = text.split('\n').filter((l) => /(^|\t)\.?youtube\.com\t/.test(l.replace(/^#HttpOnly_/, '')));
    return { present: true, updatedAt: fs.statSync(cookiesFile()).mtime.toISOString(), youtubeCookies: rows.length, loggedIn: rows.some((l) => /\t(SAPISID|__Secure-3PSID|SID|LOGIN_INFO)\t/.test(l)) };
  } catch { return { present: false, updatedAt: null, youtubeCookies: 0, loggedIn: false }; }
}

/** Stores a cookies.txt (Netscape format) and points yt-dlp at it. */
export function saveCookies(text: string): CookiesStatus {
  const lines = text.replace(/\r/g, '').split('\n');
  const rows = lines.filter((l) => l && !l.startsWith('# ') && l !== '#' && l.split('\t').length === 7);
  if (!rows.length || !rows.some((l) => /youtube\.com\t/.test(l))) throw badRequest('Нужен файл cookies.txt (формат Netscape) с cookies youtube.com');
  fs.writeFileSync(cookiesFile(), `# Netscape HTTP Cookie File\n${lines.filter((l) => !/^# Netscape/.test(l)).join('\n')}\n`, { mode: 0o600 });
  fs.mkdirSync(path.dirname(configFile()), { recursive: true });
  fs.writeFileSync(configFile(), `--cookies ${cookiesFile()}\n`);
  return cookiesStatus();
}

export function removeCookies() {
  for (const f of [cookiesFile(), configFile()]) { try { fs.unlinkSync(f); } catch { /* already gone */ } }
}
