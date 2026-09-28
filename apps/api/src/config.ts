import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };

function bool(v: string | undefined, def: boolean): boolean {
  if (v === undefined || v === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

const dataDir = path.resolve(process.cwd(), process.env.DATA_DIR || './data');
// Media (tracks, covers, canvases, avatars) may live on a different disk / network mount than the database.
const mediaDir = process.env.MEDIA_DIR ? path.resolve(process.cwd(), process.env.MEDIA_DIR) : path.join(dataDir, 'media');
const webDist = process.env.WEB_DIST
  ? path.resolve(process.cwd(), process.env.WEB_DIST)
  : path.resolve(here, '../../web/dist');

export const config = {
  version: pkg.version,
  port: Number(process.env.PORT || 8080),
  host: process.env.HOST || '0.0.0.0',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-do-not-use-in-production',
  dataDir,
  dbPath: path.join(dataDir, 'avrmusic.sqlite'),
  mediaDir,
  tracksDir: path.join(mediaDir, 'tracks'),
  videosDir: path.join(mediaDir, 'videos'),
  coversDir: path.join(mediaDir, 'covers'),
  canvasDir: path.join(mediaDir, 'canvas'),
  avatarsDir: path.join(mediaDir, 'avatars'),
  tmpDir: path.join(dataDir, 'tmp'),
  musicDir: process.env.MUSIC_DIR ? path.resolve(process.cwd(), process.env.MUSIC_DIR) : null,
  allowRegistration: bool(process.env.ALLOW_REGISTRATION, true),
  publicLibrary: bool(process.env.PUBLIC_LIBRARY, false),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 512),
  publicUrl: (process.env.PUBLIC_URL || 'http://localhost:8080').replace(/\/$/, ''),
  webDist,
  ytdlpPath: process.env.YTDLP_PATH || 'yt-dlp',
  ffmpegPath: process.env.FFMPEG_PATH || 'ffmpeg',
  lrclibUrl: (process.env.LRCLIB_URL || 'https://lrclib.net').replace(/\/$/, ''),
  catalogEnabled: bool(process.env.CATALOG_ENABLED, true),
  deezerApi: (process.env.DEEZER_API || 'https://api.deezer.com').replace(/\/$/, ''),
  acquireRole: ((['user', 'admin', 'off'].includes(process.env.ACQUIRE_ROLE || '') ? process.env.ACQUIRE_ROLE : 'user') as 'user' | 'admin' | 'off'),
  acquireSource: ((process.env.ACQUIRE_SOURCE === 'soundcloud' ? 'soundcloud' : 'youtube') as 'youtube' | 'soundcloud'),
  /** Ordered list of audio sources for catalogue acquisition (first = preferred). */
  acquireSources: ((process.env.ACQUIRE_SOURCES || process.env.ACQUIRE_SOURCE || 'youtube,audius,archive,soundcloud,jamendo')
    .split(',').map((s) => s.trim().toLowerCase()).filter((s) => ['youtube', 'soundcloud', 'audius', 'jamendo', 'archive'].includes(s)) as Array<'youtube' | 'soundcloud' | 'audius' | 'jamendo' | 'archive'>),
  audiusApi: (process.env.AUDIUS_API || '').replace(/\/$/, '') || null,
  audiusAppName: process.env.AUDIUS_APP_NAME || 'AVRmusic',
  jamendoClientId: process.env.JAMENDO_CLIENT_ID || '',
  jamendoApi: (process.env.JAMENDO_API || 'https://api.jamendo.com').replace(/\/$/, ''),
  archiveApi: (process.env.ARCHIVE_API || 'https://archive.org').replace(/\/$/, ''),
  /** Auto-fetch a canvas (slice of the official clip) for tracks added from the catalogue. */
  canvasAuto: bool(process.env.CANVAS_AUTO, true),
  canvasSeconds: Math.max(4, Math.min(20, Number(process.env.CANVAS_SECONDS || 9))),
  isProd: process.env.NODE_ENV === 'production',
  accessTtl: '15m',
  refreshTtlDays: 30,
  mediaTtl: '30d',
};

export function ensureDirs() {
  for (const d of [config.dataDir, config.mediaDir, config.tracksDir, config.videosDir, config.coversDir, config.canvasDir, config.avatarsDir, config.tmpDir]) {
    fs.mkdirSync(d, { recursive: true });
  }
}

export const AUDIO_EXT = new Set(['.mp3', '.flac', '.m4a', '.aac', '.ogg', '.oga', '.opus', '.wav', '.wma', '.aiff', '.aif', '.webm']);
export const CANVAS_VIDEO_EXT = new Set(['.mp4', '.webm', '.mov']);
export const CANVAS_IMAGE_EXT = new Set(['.gif', '.webp', '.png', '.jpg', '.jpeg', '.svg']);
export const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);
