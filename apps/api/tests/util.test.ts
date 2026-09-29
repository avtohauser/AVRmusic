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
