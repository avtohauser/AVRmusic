import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { MultipartFile } from '@fastify/multipart';
import { IMAGE_EXT, config } from '../config.js';
import { badRequest } from './errors.js';
import { moveFile, newId } from './util.js';

/** Stream an uploaded multipart file to a temp path; returns the temp path. */
export async function spoolToTmp(file: MultipartFile): Promise<{ tmpPath: string; filename: string; mimetype: string }> {
  fs.mkdirSync(config.tmpDir, { recursive: true });
  const ext = path.extname(file.filename || '').toLowerCase();
  const tmpPath = path.join(config.tmpDir, `${newId()}${ext}`);
  await pipeline(file.file, fs.createWriteStream(tmpPath));
  if ((file.file as any).truncated) {
    fs.unlinkSync(tmpPath);
    throw badRequest(`Файл больше лимита ${config.maxUploadMb} МБ`);
  }
  return { tmpPath, filename: file.filename, mimetype: file.mimetype };
}

/** Validate and store an uploaded image (cover/avatar). Returns stored filename. */
export async function saveUploadedImage(file: MultipartFile, dir: string): Promise<string> {
  const ext = path.extname(file.filename || '').toLowerCase() || (file.mimetype === 'image/png' ? '.png' : '.jpg');
  if (!IMAGE_EXT.has(ext) && !file.mimetype.startsWith('image/')) throw badRequest('Ожидается изображение');
  const { tmpPath } = await spoolToTmp(file);
  const name = `${newId()}${IMAGE_EXT.has(ext) ? ext : '.jpg'}`;
  fs.mkdirSync(dir, { recursive: true });
  moveFile(tmpPath, path.join(dir, name));
  return name;
}
