// The brand book as a PDF to keep: brand/index.html, laid out for print (a cover, a chapter a page, everything at
// rest), in the dark theme and the light one. Run from the repository root:
//   node brand/tools/pdf.mjs            → brand/avr-brandbook-dark.pdf, brand/avr-brandbook-light.pdf
// (Playwright: the global one, or set CHROMIUM to a browser). Browsers can do the same: Print → Save as PDF.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'))); }
catch { ({ chromium } = require('playwright-core')); }

const brand = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = process.argv[2] || brand;
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };

// the page loads avr.js as a module, which browsers refuse from file:// — so a tiny local server
const server = http.createServer((req, res) => {
  const file = path.join(brand, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(brand) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM, args: ['--no-sandbox'] } : {});
for (const theme of ['dark', 'light']) {
  // the same width as the PDF page, so the star field and the grids are laid out for it
  const page = await browser.newPage({ viewport: { width: 1240, height: 1754 } });
  await page.emulateMedia({ media: 'print', colorScheme: theme });
  await page.goto(`${base}/index.html`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);
  const file = path.join(out, `avr-brandbook-${theme}.pdf`);
  await page.pdf({ path: file, preferCSSPageSize: true, printBackground: true, outline: true, tagged: true });
  console.log(`${file}: ${(fs.statSync(file).size / 1024 / 1024).toFixed(1)} MB`);
  await page.close();
}
await browser.close();
server.close();
