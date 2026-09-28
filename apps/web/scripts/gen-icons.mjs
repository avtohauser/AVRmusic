// Renders the app icon (SVG) to PNG sizes required by the PWA manifest / Android.
// Usage: node scripts/gen-icons.mjs   (needs playwright + chromium; falls back to the global install)
import { writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {
  const globalRoot = execSync('npm root -g').toString().trim();
  ({ chromium } = require(path.join(globalRoot, 'playwright')));
}

const svg = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="512" height="512">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8b5cf6"/><stop offset="1" stop-color="#22d3ee"/></linearGradient></defs>
<rect width="64" height="64" rx="${pad ? 0 : 16}" fill="url(#g)"/>
<g transform="translate(32 32) scale(${pad ? 0.72 : 1}) translate(-32 -32)"><path d="M40 14v26.5a7.5 7.5 0 1 1-4-6.6V22l-12 3.4v19.1a7.5 7.5 0 1 1-4-6.6V19.6L40 14z" fill="#fff"/></g></svg>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });
mkdirSync('public/icons', { recursive: true });
for (const [name, size, maskable] of [['icon-192.png', 192, false], ['icon-512.png', 512, false], ['icon-512-maskable.png', 512, true]]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg(maskable).replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body></html>`);
  const buf = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  writeFileSync(`public/icons/${name}`, buf);
  console.log('wrote', name);
}
await browser.close();
