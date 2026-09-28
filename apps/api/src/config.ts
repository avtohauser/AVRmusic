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
  mediaDir: path.join(dataDir, 'media'),
  tracksDir: path.join(dataDir, 'media', 'tracks'),
  coversDir: path.join(dataDir, 'media', 'covers'),
  canvasDir: path.join(dataDir, 'media', 'canvas'),
  avatarsDir: path.join(dataDir, 'media', 'avatars'),
  tmpDir: path.join(dataDir, 'tmp'),
  musicDir: process.env.MUSIC_DIR ? path.resolve(process.cwd(), process.env.MUSIC_DIR) : null,
  allowRegistration: bool(process.env.ALLOW_REGISTRATION, true),
  publicLibrary: bool(process.env.PUBLIC_LIBRARY, false),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 512),
  publicUrl: (process.env.PUBLIC_URL || 'http://localhost:8080').replace(/\/$/, ''),
  webDist,
  isProd: process.env.NODE_ENV === 'production',
  accessTtl: '15m',
  refreshTtlDays: 30,
  mediaTtl: '30d',
};

export function ensureDirs() {
  for (const d of [config.dataDir, config.mediaDir, config.tracksDir, config.coversDir, config.canvasDir, config.avatarsDir, config.tmpDir]) {
    fs.mkdirSync(d, { recursive: true });
  }
}

export const AUDIO_EXT = new Set(['.mp3', '.flac', '.m4a', '.aac', '.ogg', '.oga', '.opus', '.wav', '.wma', '.aiff', '.aif', '.webm']);
export const CANVAS_VIDEO_EXT = new Set(['.mp4', '.webm', '.mov']);
export const CANVAS_IMAGE_EXT = new Set(['.gif', '.webp', '.png', '.jpg', '.jpeg', '.svg']);
export const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);
