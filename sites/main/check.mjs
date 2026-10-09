// Checks the built visitka before it goes anywhere: every local file the page links to exists, and the scripts parse.
import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { copyFile } from 'node:fs/promises';

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');
let bad = 0;
const fail = (msg) => { console.error('FAIL', msg); bad++; };

const html = await readFile(path.join(dist, 'index.html'), 'utf8');
const refs = [...html.matchAll(/(?:src|href)="(\/[^"#?]+)"/g)].map((m) => m[1]);
for (const r of new Set(refs)) {
  try { await access(path.join(dist, r)); } catch { fail(`index.html links to ${r}, which is not in dist/`); }
}

// the scripts are ES modules or plain scripts: node can only check a copy named .mjs
for (const f of ['site.js', 'theme-boot.js']) {
  const tmp = path.join(os.tmpdir(), `check-${f}.mjs`);
  await copyFile(path.join(dist, f), tmp);
  const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
  if (r.status !== 0) fail(`${f} does not parse:\n${r.stderr}`);
}

if (bad) process.exit(1);
console.log(`ok: ${new Set(refs).size} linked files exist, scripts parse`);
