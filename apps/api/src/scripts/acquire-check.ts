// Dry run of the acquisition matcher against the live catalogue and sources; nothing is imported.
//   node dist/scripts/acquire-check.js "imagine dragons take me to the beach" [--audio]
// Lists the catalogue versions of a song (solo, feat. …) and for each one the uploads considered, with
// YouTube Music's credits and why each was taken or refused. --audio also downloads the pick of every
// version and compares it with every version's catalogue preview (bit error rate, lower = same audio).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../lib/db.js';
import { newId } from '../lib/util.js';
import { config } from '../config.js';
import { parseFeaturing, rawSearchTracks, rawTrack } from '../services/catalog.js';
import { pickSources, wantOf } from '../services/acquire.js';
import { norm, wantedGuests } from '../services/matching.js';
import { bestAlignment, fingerprint, fingerprintAvailable } from '../services/fingerprint.js';

const [query, ...flags] = process.argv.slice(2);
if (!query) { console.error('usage: acquire-check "<artist> <song>" [--audio]'); process.exit(2); }
const withAudio = flags.includes('--audio');
const db = openDatabase(path.join(os.tmpdir(), `acquire-check-${process.pid}.sqlite`));

const hits = await rawSearchTracks(db, query, 25);
if (!hits.length) { console.log('каталог: ничего не найдено'); process.exit(0); }
const song = norm(parseFeaturing(hits[0].title ?? '', hits[0].title_short).title);
const versions: any[] = [];
for (const h of hits) {
  if (norm(parseFeaturing(h.title ?? '', h.title_short).title) !== song) continue;
  if (versions.some((v) => v.title === h.title && Math.abs(v.duration - h.duration) <= 2)) continue; // same recording on another release
  versions.push(h);
  if (versions.length >= 6) break;
}

const picks: Array<{ label: string; file: string | null; preview: string | null }> = [];
for (const h of versions) {
  const t = await rawTrack(db, Number(h.id));
  const want = wantOf(t);
  const label = `${t.artist?.name} — ${t.title}`;
  console.log(`\n=== ${label} · ${t.album?.title ?? '?'} · ${t.duration}s · ISRC ${t.isrc ?? '?'} · гости: ${wantedGuests(want).join(', ') || 'нет'}`);
  const { ranked, usable } = await pickSources(db, want, (s) => console.log(`    ${s}`));
  for (const r of ranked.slice(0, 8)) {
    const cr = r.c.credits;
    console.log(`  ${r.s >= 25 ? '✓' : '✗'} ${String(Math.round(r.s)).padStart(4)}  ${r.c.title}  [${r.c.channel ?? '?'}, ${r.c.duration ?? '?'}s]${cr?.structured ? `  YTM: ${cr.artists.join(' · ')} / ${cr.album ?? '?'}` : ''}  — ${r.why ?? ''}`);
  }
  const pick = usable[0];
  console.log(pick ? `  → берём: ${pick.c.title} (${pick.c.source}:${pick.c.id})` : '  → нет подходящей загрузки');
  let file: string | null = null;
  if (withAudio && pick) {
    const dir = path.join(config.tmpDir, `check-${newId()}`);
    try { file = await pick.src.download(pick.c, dir, () => {}, {}, { title: want.title, artist: want.artist }); }
    catch (e: any) { console.log(`  ! скачать не удалось: ${e?.message ?? e}`); }
  }
  picks.push({ label, file, preview: t.preview ?? null });
}

if (withAudio) {
  if (!(await fingerprintAvailable())) console.log('\nfpcalc не установлен — сверки звука нет');
  else {
    console.log('\nСверка звука: строка — скачанный файл, столбец — превью версии в каталоге (доля разных бит; ≤0.3 — та же запись)');
    const prints = await Promise.all(picks.map(async (p) => {
      if (!p.preview) return null;
      const tmp = path.join(config.tmpDir, `pv-${newId()}.mp3`);
      try { const r = await fetch(p.preview); fs.mkdirSync(config.tmpDir, { recursive: true }); fs.writeFileSync(tmp, new Uint8Array(await r.arrayBuffer())); return await fingerprint(tmp, 60); }
      catch { return null; } finally { try { fs.unlinkSync(tmp); } catch { /* ignore */ } }
    }));
    for (const p of picks) {
      const f = p.file ? await fingerprint(p.file) : null;
      const cells = prints.map((pv) => (f && pv ? bestAlignment(pv, f).toFixed(2) : '  - '));
      console.log(`  ${cells.join('  ')}   ${p.label}`);
    }
    console.log(`  (столбцы по порядку: ${picks.map((p, i) => `${i + 1}. ${p.label}`).join('; ')})`);
  }
  for (const p of picks) if (p.file) fs.rmSync(path.dirname(p.file), { recursive: true, force: true });
}
process.exit(0);
