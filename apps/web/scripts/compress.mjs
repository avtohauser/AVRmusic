// Pre-compresses the built client (brotli + gzip next to each file). The API serves these as-is
// (@fastify/static preCompressed), so pages load compressed whatever proxy sits in front.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const dist = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../dist');
const exts = new Set(['.js', '.css', '.html', '.svg', '.json', '.webmanifest', '.txt', '.mjs', '.map']);
let raw = 0, br = 0, n = 0;
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) { walk(f); continue; }
    if (!exts.has(path.extname(e.name)) || fs.statSync(f).size < 1024) continue;
    const buf = fs.readFileSync(f);
    const b = zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length } });
    fs.writeFileSync(`${f}.br`, b);
    fs.writeFileSync(`${f}.gz`, zlib.gzipSync(buf, { level: 9 }));
    raw += buf.length; br += b.length; n++;
  }
}
walk(dist);
console.log(`compressed ${n} files: ${(raw / 1024).toFixed(0)} KB → ${(br / 1024).toFixed(0)} KB brotli`);
