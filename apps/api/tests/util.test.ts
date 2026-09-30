import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { moveFile } from '../src/lib/util.js';

test('moveFile works across disks (rename fails with EXDEV)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avr-move-'));
  const src = path.join(dir, 'a.jpg'), dest = path.join(dir, 'b.jpg');
  fs.writeFileSync(src, 'avatar');
  const rename = fs.renameSync;
  (fs as any).renameSync = () => { const e: any = new Error('EXDEV: cross-device link not permitted'); e.code = 'EXDEV'; throw e; };
  try { moveFile(src, dest); } finally { (fs as any).renameSync = rename; }
  assert.equal(fs.readFileSync(dest, 'utf8'), 'avatar');
  assert.ok(!fs.existsSync(src), 'the temp file is removed');
  // other errors are not swallowed
  assert.throws(() => moveFile(path.join(dir, 'missing'), path.join(dir, 'c')), /ENOENT/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('YouTube cookies: validated, stored with a yt-dlp config pointing at them, removable', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avr-ck-'));
  process.env.XDG_CONFIG_HOME = path.join(dir, 'config');
  const { config } = await import('../src/config.js');
  const prev = config.dataDir;
  (config as any).dataDir = dir;
  try {
    const { saveCookies, cookiesStatus, removeCookies } = await import('../src/services/youtubeCookies.js');
    assert.throws(() => saveCookies('not a cookies file'), /cookies\.txt/);
    const st = saveCookies('# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t1999999999\tSAPISID\tabc\n.youtube.com\tTRUE\t/\tTRUE\t1999999999\tPREF\tx\n');
    assert.equal(st.present, true); assert.equal(st.loggedIn, true); assert.equal(st.youtubeCookies, 2);
    assert.match(fs.readFileSync(path.join(dir, 'config', 'yt-dlp', 'config'), 'utf8'), /--cookies .*youtube-cookies\.txt/);
    removeCookies();
    assert.equal(cookiesStatus().present, false);
    assert.ok(!fs.existsSync(path.join(dir, 'config', 'yt-dlp', 'config')));
  } finally { (config as any).dataDir = prev; delete process.env.XDG_CONFIG_HOME; fs.rmSync(dir, { recursive: true, force: true }); }
});
