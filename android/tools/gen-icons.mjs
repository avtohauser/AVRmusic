// Renders every icon of the project from the vector logo (apps/web/public/logo.svg):
//   PWA: icons/icon-192.png, icon-512.png, icon-512-maskable.png, logo-mark-512.png
//   Android: mipmap-*/ic_launcher(.round).png (legacy), ic_launcher_foreground.png (adaptive), drawable-xxhdpi/splash.png
// Run from the repo root: node android/tools/gen-icons.mjs
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const android = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const res = path.join(android, 'app/src/main/res');
const pub = path.resolve(android, '../apps/web/public');
const mark = fs.readFileSync(path.join(pub, 'logo.svg'), 'utf8');
const BG = '#141218'; // app surface colour (dark theme)
const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 1200 }, deviceScaleFactor: 1 });

/** Draw the mark at `scale` of a `size` box; `bg` = colour or null for transparent. */
async function render(size, scale, bg, out) {
  const inner = Math.round(size * scale);
  await page.setContent(`<html><body style="margin:0;background:transparent">
    <div id="box" style="width:${size}px;height:${size}px;background:${bg ?? 'transparent'};display:flex;align-items:center;justify-content:center">
      <div style="width:${inner}px;height:${inner}px">${mark}</div>
    </div></body></html>`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await (await page.$('#box')).screenshot({ path: out, omitBackground: true });
}

// PWA / web
await render(192, 0.68, BG, path.join(pub, 'icons/icon-192.png'));
await render(512, 0.68, BG, path.join(pub, 'icons/icon-512.png'));
await render(512, 0.54, BG, path.join(pub, 'icons/icon-512-maskable.png'));
await render(512, 1, null, path.join(pub, 'icons/logo-mark-512.png'));

// Android
for (const [d, k] of Object.entries(dens)) {
  await render(Math.round(48 * k), 0.68, BG, path.join(res, `mipmap-${d}/ic_launcher.png`));
  await render(Math.round(48 * k), 0.68, BG, path.join(res, `mipmap-${d}/ic_launcher_round.png`));
  await render(Math.round(108 * k), 0.52, null, path.join(res, `mipmap-${d}/ic_launcher_foreground.png`)); // adaptive: safe zone is the inner 66/108
}
await render(512, 0.9, null, path.join(res, 'drawable-xxhdpi/splash.png'));

// Status-bar / notification icons must be single-colour on transparent
const white = mark.replace(/fill="url\(#[^)]+\)"/, 'fill="#ffffff"');
async function renderWhite(size, scale, out) {
  const inner = Math.round(size * scale);
  await page.setContent(`<html><body style="margin:0;background:transparent"><div id="box" style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center"><div style="width:${inner}px;height:${inner}px">${white}</div></div></body></html>`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await (await page.$('#box')).screenshot({ path: out, omitBackground: true });
}
await renderWhite(96, 0.84, path.join(pub, 'icons/badge-96.png'));
for (const [d, k] of Object.entries(dens)) await renderWhite(Math.round(24 * k), 0.84, path.join(res, `drawable-${d}/ic_notification_icon.png`));

await browser.close();
console.log('icons written');
