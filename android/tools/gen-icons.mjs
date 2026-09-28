// Renders launcher icons for every density from the PWA icons (run: node android/tools/gen-icons.mjs).
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const res = path.join(root, 'app/src/main/res');
const icons = path.resolve(root, '../apps/web/public/icons');
const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 600, height: 600 }, deviceScaleFactor: 1 });
async function render(src, size, out) {
  const data = fs.readFileSync(src).toString('base64');
  await page.setContent(`<html><body style="margin:0;background:transparent"><img id="i" src="data:image/png;base64,${data}" style="display:block;width:${size}px;height:${size}px"></body></html>`);
  const el = await page.$('#i');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await el.screenshot({ path: out, omitBackground: true });
}
for (const [d, k] of Object.entries(dens)) {
  await render(path.join(icons, 'icon-512.png'), Math.round(48 * k), path.join(res, `mipmap-${d}/ic_launcher.png`));
  await render(path.join(icons, 'icon-512.png'), Math.round(48 * k), path.join(res, `mipmap-${d}/ic_launcher_round.png`));
  await render(path.join(icons, 'icon-512-maskable.png'), Math.round(108 * k), path.join(res, `mipmap-${d}/ic_launcher_foreground.png`));
}
await browser.close();
console.log('icons written');
