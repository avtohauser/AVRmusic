// CLI: import an existing music folder without copying files.
//   pnpm scan [/path/to/music]   (defaults to MUSIC_DIR)
import path from 'node:path';
import { config, ensureDirs } from '../config.js';
import { openDatabase } from '../lib/db.js';
import { scanDirectory } from '../services/importer.js';

ensureDirs();
const dir = process.argv[2] ? path.resolve(process.argv[2]) : config.musicDir;
if (!dir) {
  console.error('Укажите папку: pnpm scan /path/to/music  (или MUSIC_DIR в .env)');
  process.exit(1);
}
const db = openDatabase();
console.log(`Сканирую ${dir} …`);
const r = await scanDirectory(db, dir, (f) => console.log('  +', path.relative(dir, f)));
console.log(`Импортировано: ${r.imported.length}, пропущено: ${r.skipped.length}`);
for (const s of r.skipped.slice(0, 30)) console.log('  -', path.relative(dir, s.file), '→', s.reason);
db.close();
