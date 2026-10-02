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

test('YouTube accounts: validated, the old single cookies file migrated, a refused account rests and the next one is used', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avr-ck-'));
  process.env.XDG_CONFIG_HOME = path.join(dir, 'config');
  const { config } = await import('../src/config.js');
  const prev = { data: config.dataDir, tmp: config.tmpDir };
  (config as any).dataDir = dir;
  (config as any).tmpDir = path.join(dir, 'tmp');
  const cookies = (sid: string) => `# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t1999999999\tSAPISID\t${sid}\n.youtube.com\tTRUE\t/\tTRUE\t1999999999\tPREF\tx\n`;
  try {
    // an earlier version's single file and global yt-dlp config
    fs.writeFileSync(path.join(dir, 'youtube-cookies.txt'), cookies('old'));
    fs.mkdirSync(path.join(dir, 'config', 'yt-dlp'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'config', 'yt-dlp', 'config'), '--cookies x\n');
    const acc = await import('../src/services/youtubeAccounts.js');
    let list = acc.listAccounts();
    assert.equal(list.length, 1);
    assert.equal(list[0].loggedIn, true);
    assert.equal(list[0].cookies, 2);
    assert.ok(!fs.existsSync(path.join(dir, 'youtube-cookies.txt')));
    assert.ok(!fs.existsSync(path.join(dir, 'config', 'yt-dlp', 'config')));

    assert.throws(() => acc.addAccount('not a cookies file'), /cookies\.txt/);
    list = acc.addAccount(cookies('second'), 'Второй');
    assert.equal(list.length, 2);
    assert.equal(acc.downloadSlots(), 2);

    // the first account is refused: it rests and the second one does the download
    const used: string[] = [];
    const r = await acc.withAccount(async (a) => {
      used.push(a.label);
      if (used.length === 1) throw new Error('yt-dlp: Sign in to confirm you’re not a bot');
      return 'ok';
    });
    assert.equal(r, 'ok');
    assert.deepEqual(used, ['Аккаунт 1', 'Второй']);
    list = acc.listAccounts();
    assert.ok(list[0].coolingUntil);
    assert.equal(list[1].ok, 1);
    // other errors (the video is gone) are not the account's fault
    await assert.rejects(acc.withAccount(async () => { throw new Error('yt-dlp: Video unavailable'); }), /unavailable/);
    assert.equal(acc.listAccounts()[1].coolingUntil, null);

    // two downloads at once take different accounts
    acc.wakeAccount(list[0].id);
    const seen = new Set<string>();
    await Promise.all([1, 2].map(() => acc.withAccount(async (a) => { seen.add(a.label); await new Promise((res) => setTimeout(res, 30)); })));
    assert.equal(seen.size, 2);

    // lookups get a private copy of the cookies
    const args = await acc.withLookupCookies(async (a) => { assert.equal(a[0], '--cookies'); assert.ok(fs.existsSync(a[1])); return a; });
    assert.ok(!fs.existsSync(args[1]));

    list = acc.removeAccount(list[0].id);
    assert.equal(list.length, 1);
  } finally {
    (config as any).dataDir = prev.data;
    (config as any).tmpDir = prev.tmp;
    delete process.env.XDG_CONFIG_HOME;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
