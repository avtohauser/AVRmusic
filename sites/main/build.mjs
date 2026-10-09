// Assembles the visitka into dist/: the page itself plus the shared brand files it links to.
import { cp, rm, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const brand = path.join(here, '..', '..', 'brand');
const dist = path.join(here, 'dist');

await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, 'brand'), { recursive: true });
for (const f of ['index.html', 'site.css', 'site.js', 'theme-boot.js']) await cp(path.join(here, f), path.join(dist, f));
for (const f of ['avr.css', 'avr.js', 'fonts']) await cp(path.join(brand, f), path.join(dist, 'brand', f), { recursive: true });
await cp(path.join(here, 'public'), dist, { recursive: true });
// only what the page uses, not the whole asset tree
for (const d of ['mark', 'signs', 'icons', 'lockups', 'social']) {
  await cp(path.join(brand, 'assets', d), path.join(dist, 'brand', 'assets', d), { recursive: true });
}
console.log('built', dist);
