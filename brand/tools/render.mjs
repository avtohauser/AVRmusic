// The brand's pictures as PNG, drawn by a browser from the SVGs that build.py made: app icons, link previews
// (1200 × 630), the GitHub banner and round avatars (Telegram bots, profiles). Run from the repository root
// after build.py:  node brand/tools/render.mjs   (Playwright: the global one, or set CHROMIUM to a browser)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'))); }
catch { ({ chromium } = require('playwright-core')); }

const brand = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const A = path.join(brand, 'assets');
const url = (p) => 'file://' + path.join(brand, p);
const svg = (p) => fs.readFileSync(path.join(A, p), 'utf8');

const PRODUCTS = {
  'avr': 'Своё. Для своих.',
  'avr-music': 'Своя музыка. Для своих.',
  'avrtube': 'Видео без рекламы. Для своих.',
  'avrgram': 'Переписка под вашей защитой.',
  'avr-studio': 'Проекты avr в одном месте.',
};

// fonts from disk need file access between local files
const args = ['--allow-file-access-from-files'];
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM, args: [...args, '--no-sandbox'] } : { args });
const page = await browser.newPage({ viewport: { width: 1400, height: 1400 }, deviceScaleFactor: 1 });

const fonts = `
  @font-face { font-family: 'Google Sans Flex'; font-weight: 400 900; src: url(${url('fonts/gsf-latin.woff2')}); unicode-range: U+0000-00FF, U+2000-206F; }
  @font-face { font-family: 'Roboto Flex'; font-weight: 400 900; src: url(${url('fonts/rf-cyrillic.woff2')}); unicode-range: U+0400-045F; }
  body { margin: 0; font-family: 'Google Sans Flex', 'Roboto Flex', sans-serif; }`;

async function shot(html, w, h, out, transparent = false) {
  await page.setViewportSize({ width: w, height: h });
  // a file of its own, so the page may load the brand's fonts and pictures from disk
  const tmp = path.join(os.tmpdir(), 'avr-render.html');
  fs.writeFileSync(tmp, `<!doctype html><html><head><meta charset="utf-8"><style>${fonts}</style></head><body>${html}</body></html>`);
  await page.goto('file://' + tmp, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await page.screenshot({ path: out, omitBackground: transparent, clip: { x: 0, y: 0, width: w, height: h } });
}

const fill = (s) => s.replace('<svg ', '<svg width="100%" height="100%" ');

// app icons: 1024 for stores and the README, 512 / 192 for the web, 48 for a quick look
for (const p of Object.keys(PRODUCTS)) {
  for (const s of [1024, 512, 192]) {
    await shot(`<div style="width:${s}px;height:${s}px">${fill(svg(`icons/${p}.svg`))}</div>`, s, s, path.join(A, `icons/png/${p}-${s}.png`), true);
  }
}
// the favicon of every avr site: the star alone (the attributes do not read below 32 px)
for (const s of [16, 32, 48, 180]) {
  await shot(`<div style="width:${s}px;height:${s}px">${fill(svg('icons/avr.svg'))}</div>`, s, s, path.join(A, `icons/png/favicon-${s}.png`), true);
}

// link previews: the dark ground with the star field, a big star cut by the edge, the sign and the name
const preview = (p, w, h) => `
  <div style="position:relative;width:${w}px;height:${h}px;overflow:hidden;background:#0B4248">
    <img src="${url('assets/backgrounds/starfield-dark.svg')}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.9">
    <div style="position:absolute;right:${-h * 0.42}px;top:${-h * 0.3}px;width:${h * 1.35}px;height:${h * 1.35}px;opacity:.16">${fill(svg('mark/star.svg'))}</div>
    <div style="position:absolute;left:${w * 0.07}px;bottom:${h * 0.16}px;display:grid;gap:${h * 0.05}px">
      <div style="height:${h * 0.2}px">${svg(`lockups/${p}-dark.svg`).replace('<svg ', `<svg height="${h * 0.2}" `)}</div>
      <div style="font-size:${h * 0.062}px;line-height:1.25;color:#A9C4C6;font-variation-settings:'wght' 460">${PRODUCTS[p]}</div>
    </div>
  </div>`;
for (const p of Object.keys(PRODUCTS)) await shot(preview(p, 1200, 630), 1200, 630, path.join(A, `social/og-${p}.png`));
await shot(preview('avr', 1280, 640), 1280, 640, path.join(A, 'social/github-banner.png'));

// round avatars: the sign in the middle of a circle-safe square
for (const p of Object.keys(PRODUCTS)) {
  const s = 640, sign = fs.existsSync(path.join(A, `signs/${p}.svg`)) ? `signs/${p}.svg` : 'mark/star.svg';
  await shot(`<div style="position:relative;width:${s}px;height:${s}px;background:radial-gradient(60% 60% at 50% 45%, #155A62, #0B4248 70%);display:grid;place-items:center">
    <div style="width:${s * (sign.startsWith('signs') ? 0.6 : 0.46)}px">${svg(sign).replace('<svg ', '<svg width="100%" ')}</div></div>`, s, s, path.join(A, `social/avatar-${p}.png`));
}

await browser.close();
console.log('brand/assets: PNGs done');
