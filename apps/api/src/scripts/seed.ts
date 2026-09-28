// Demo seed: creates users, artists, albums, procedurally generated tracks, lyrics, canvases, playlists.
//   pnpm seed            (admin: admin / admin123, user: demo / demo123)
import fs from 'node:fs';
import path from 'node:path';
import { config, ensureDirs } from '../config.js';
import { openDatabase } from '../lib/db.js';
import { importAudioFile, saveCover } from '../services/importer.js';
import { register } from '../services/auth.js';
import { createPlaylist, addTracks } from '../services/playlists.js';
import { indexPlaylist, reindexAll } from '../services/search.js';
import { linesToLrc } from '../lib/lyrics.js';
import { SCALES, canvasSvg, coverSvg, synthesize } from './synth.js';
import { newId } from '../lib/util.js';

ensureDirs();
const db = openDatabase();

if ((db.prepare('SELECT COUNT(*) c FROM tracks').get() as any).c > 0 && !process.argv.includes('--force')) {
  console.log('База уже содержит треки. Запустите с --force, чтобы добавить демо-данные поверх.');
  process.exit(0);
}

const admin = (db.prepare(`SELECT id FROM users WHERE username='admin'`).get() as any)?.id
  ?? (await register(db, { email: 'admin@avrmusic.local', username: 'admin', password: process.env.SEED_ADMIN_PASSWORD || 'admin123', displayName: 'Администратор' })).id;
const demo = (db.prepare(`SELECT id FROM users WHERE username='demo'`).get() as any)?.id
  ?? (await register(db, { email: 'demo@avrmusic.local', username: 'demo', password: 'demo123', displayName: 'Демо' })).id;

interface DemoArtist { name: string; bio: string; genre: string; lead: 'sine' | 'saw' | 'square' | 'tri'; pad: 'sine' | 'saw' | 'tri'; scale: keyof typeof SCALES; bpm: [number, number]; drums: boolean; albums: Array<{ title: string; year: number; type?: string; tracks: string[] }> }

const ARTISTS: DemoArtist[] = [
  { name: 'Северное Сияние', bio: 'Электронный дуэт из Мурманска. Холодные синты, тёплые мелодии.', genre: 'Электроника', lead: 'saw', pad: 'saw', scale: 'minor', bpm: [118, 126], drums: true,
    albums: [
      { title: 'Полярная ночь', year: 2024, tracks: ['Полярная ночь', 'Ледяной берег', 'Огни над тундрой', 'Вспышка', 'Тишина в 4 утра'] },
      { title: 'Рассвет', year: 2025, type: 'ep', tracks: ['Рассвет', 'Первый луч', 'Оттепель'] },
    ] },
  { name: 'Luna Vale', bio: 'Dream-pop singer-songwriter. Whispered vocals over shimmering guitars.', genre: 'Дрим-поп', lead: 'tri', pad: 'sine', scale: 'major', bpm: [84, 96], drums: true,
    albums: [
      { title: 'Soft Focus', year: 2023, tracks: ['Soft Focus', 'Paper Moon', 'Velvet Hours', 'Slow Motion Heart', 'Daydreamer', 'Fade Into You'] },
      { title: 'Golden (Single)', year: 2025, type: 'single', tracks: ['Golden'] },
    ] },
  { name: 'Kairo Beats', bio: 'Lo-fi hip-hop producer. Dusty samples, late-night textures, study-friendly grooves.', genre: 'Lo-fi', lead: 'sine', pad: 'tri', scale: 'dorian', bpm: [72, 84], drums: true,
    albums: [
      { title: 'Midnight Tapes Vol. 1', year: 2022, tracks: ['Rainy Window', 'Coffee at 2AM', 'Tape Hiss', 'Slow Train', 'Bookshelf'] },
      { title: 'Midnight Tapes Vol. 2', year: 2024, tracks: ['Neon Puddles', 'Headphones On', 'Old Photographs', 'Last Bus Home'] },
    ] },
  { name: 'Атлас', bio: 'Инди-рок группа из Казани. Гитары, честные тексты и большие припевы.', genre: 'Инди-рок', lead: 'square', pad: 'saw', scale: 'major', bpm: [128, 148], drums: true,
    albums: [
      { title: 'Карты и маршруты', year: 2023, tracks: ['Карты и маршруты', 'Города без имён', 'Восемь утра', 'Провода', 'Бегущий по крышам'] },
    ] },
  { name: 'Mira Solis', bio: 'Neo-classical pianist and composer. Minimal, cinematic, patient.', genre: 'Неоклассика', lead: 'sine', pad: 'sine', scale: 'lydian', bpm: [60, 72], drums: false,
    albums: [
      { title: 'Stillness', year: 2021, tracks: ['Stillness', 'Winter Light', 'Aurora', 'Letters', 'Home'] },
    ] },
  { name: 'DJ Vortex', bio: 'Techno и progressive house. Резидент клубов Берлина и Тбилиси.', genre: 'Техно', lead: 'saw', pad: 'saw', scale: 'pentatonic', bpm: [126, 134], drums: true,
    albums: [
      { title: 'Turbine', year: 2024, tracks: ['Turbine', 'Pressure', 'Blackout', 'Afterhours', 'Rotor'] },
    ] },
];

const LYRIC_BANK = {
  'Электроника': ['Над городом ночь, и мы одни', 'Свет фонарей дрожит на воде', 'Ты слышишь, как поёт тишина', 'Мы растворяемся в этом ритме', 'Полярная ночь, полярный день', 'Не отпускай мою руку', 'Всё, что было — просто сон', 'Мы летим сквозь холодный свет'],
  'Дрим-поп': ['Soft focus, blurry lights', 'You and me in slow motion', 'Paper moon above the sea', 'Hold this moment, let it breathe', 'Velvet hours, quiet hearts', 'I keep dreaming in your colours', 'We fade into the golden air', 'Stay a little longer here'],
  'Инди-рок': ['Мы рисуем карты по памяти', 'Города, где нас никто не ждёт', 'Восемь утра, кофе и дорога', 'Провода поют над головой', 'Беги, пока горит рассвет', 'Мы не спали эту ночь', 'Всё ещё верим в чудеса', 'Давай останемся живыми'],
  'Lo-fi': ['rain on the window again', 'coffee going cold at 2am', 'tape hiss and the sound of you', 'slow train through the sleeping town', 'headphones on, world off', 'old photographs, new feelings', 'neon puddles on the street', 'last bus home, empty seats'],
};

function makeLyrics(genre: string, durationSec: number, seed: number) {
  const bank = (LYRIC_BANK as any)[genre] as string[] | undefined;
  if (!bank) return null;
  const lines: { timeMs: number; text: string }[] = [];
  const count = Math.max(6, Math.min(bank.length * 2, Math.floor(durationSec / 3)));
  const start = 2500;
  const step = ((durationSec - 4) * 1000 - start) / count;
  for (let i = 0; i < count; i++) {
    lines.push({ timeMs: Math.round(start + i * step), text: bank[(seed + i) % bank.length] });
  }
  return linesToLrc(lines);
}

const demoDir = path.join(config.tmpDir, 'seed');
fs.rmSync(demoDir, { recursive: true, force: true });
fs.mkdirSync(demoDir, { recursive: true });

let seed = 7;
const allTrackIds: string[] = [];
const byGenre: Record<string, string[]> = {};

for (const a of ARTISTS) {
  for (const al of a.albums) {
    const albumDir = path.join(demoDir, `${a.name} - ${al.title}`);
    fs.mkdirSync(albumDir, { recursive: true });
    const cover = coverSvg(seed++, al.title, a.name);
    fs.writeFileSync(path.join(albumDir, 'cover.svg'), cover);
    const coverName = saveCover(Buffer.from(cover), 'image/svg+xml');
    for (let i = 0; i < al.tracks.length; i++) {
      const title = al.tracks[i];
      const s = seed++;
      const bpm = a.bpm[0] + Math.floor(((s * 37) % 100) / 100 * (a.bpm[1] - a.bpm[0]));
      const progressions = [[0, 5, 3, 4], [0, 3, 4, 4], [5, 3, 0, 4], [0, 4, 5, 3], [1, 4, 0, 0]];
      const { wav, durationSec } = synthesize({
        bpm, bars: 14 + (s % 4), root: 48 + (s % 7), scale: SCALES[a.scale], progression: progressions[s % progressions.length],
        lead: a.lead, pad: a.pad, drums: a.drums, swing: a.genre === 'Lo-fi' ? 0.18 : 0, seed: s * 7919,
      });
      const file = path.join(albumDir, `${String(i + 1).padStart(2, '0')} - ${a.name} - ${title}.wav`);
      fs.writeFileSync(file, wav);
      const lrc = makeLyrics(a.genre, durationSec, s);
      if (lrc) fs.writeFileSync(file.replace(/\.wav$/, '.lrc'), lrc);
      if (s % 3 !== 0) fs.writeFileSync(file.replace(/\.wav$/, '.canvas.svg'), canvasSvg(s));

      const r = await importAudioFile(db, file, { mode: 'move', overrides: { title, artist: a.name, album: al.title, genre: a.genre, year: al.year } });
      if (!r.ok || !r.trackId) { console.warn('skip', title, r.reason); continue; }
      db.prepare('UPDATE tracks SET track_no = ?, play_count = ? WHERE id = ?').run(i + 1, Math.floor(((s * 31) % 97) * 3), r.trackId);
      // animated SVG canvas sidecar (importer only picks mp4/webm/gif automatically)
      const canvasSidecar = file.replace(/\.wav$/, '.canvas.svg');
      if (fs.existsSync(canvasSidecar)) {
        const name = `${newId()}.svg`;
        fs.copyFileSync(canvasSidecar, path.join(config.canvasDir, name));
        db.prepare(`UPDATE tracks SET canvas_path = ?, canvas_mime = 'image/svg+xml' WHERE id = ?`).run(name, r.trackId);
      }
      allTrackIds.push(r.trackId);
      (byGenre[a.genre] ??= []).push(r.trackId);
    }
    const albumId = (db.prepare('SELECT album_id FROM tracks WHERE id = ?').get(allTrackIds[allTrackIds.length - 1]) as any)?.album_id;
    if (albumId) db.prepare('UPDATE albums SET cover_path = ?, type = ?, description = ? WHERE id = ?').run(coverName, al.type ?? 'album', `${al.title} — ${al.type === 'single' ? 'сингл' : al.type === 'ep' ? 'мини-альбом' : 'альбом'} ${a.name} (${al.year}).`, albumId);
  }
  const artistId = (db.prepare('SELECT id FROM artists WHERE name = ?').get(a.name) as any).id;
  const img = saveCover(Buffer.from(coverSvg(seed++, a.name, a.genre)), 'image/svg+xml');
  db.prepare('UPDATE artists SET bio = ?, image_path = ?, verified = 1 WHERE id = ?').run(a.bio, img, artistId);
}

// Playlists
const mk = (owner: string, title: string, description: string, ids: string[], isPublic = true) => {
  const id = createPlaylist(db, owner, { title, description, isPublic });
  addTracks(db, id, ids, owner);
  indexPlaylist(db, id);
  return id;
};
const pick = (ids: string[], n: number, offset = 0) => ids.filter((_, i) => (i + offset) % Math.max(1, Math.floor(ids.length / n)) === 0).slice(0, n);
mk(admin, 'Фокус и работа', 'Lo-fi и неоклассика для концентрации.', [...(byGenre['Lo-fi'] ?? []), ...(byGenre['Неоклассика'] ?? [])]);
mk(admin, 'Ночной драйв', 'Электроника и техно для дороги.', [...pick(byGenre['Электроника'] ?? [], 5), ...pick(byGenre['Техно'] ?? [], 5)]);
mk(admin, 'Лучшее за неделю', 'Свежая ротация редакции AVRmusic.', pick(allTrackIds, 12, 3));
mk(demo, 'Мой микс', 'Всего понемногу.', pick(allTrackIds, 8, 5), false);

// Some likes and history for the demo user so the home feed is personalised
const likeIds = pick(allTrackIds, 9, 2);
for (const id of likeIds) db.prepare(`INSERT OR IGNORE INTO likes(user_id, entity_type, entity_id) VALUES (?,?,?)`).run(demo, 'track', id);
for (const id of pick(allTrackIds, 14, 1)) db.prepare(`INSERT INTO plays(user_id, track_id, ms_played, context, played_at) VALUES (?,?,?,?, datetime('now', ?))`).run(demo, id, 30000, 'seed', `-${Math.floor(Math.random() * 72)} hours`);
const artistIds = (db.prepare('SELECT id FROM artists').all() as any[]).map((r) => r.id);
for (const id of artistIds.slice(0, 3)) db.prepare(`INSERT OR IGNORE INTO likes(user_id, entity_type, entity_id) VALUES (?,?,?)`).run(demo, 'artist', id);

reindexAll(db);
fs.rmSync(demoDir, { recursive: true, force: true });
const stats = db.prepare('SELECT (SELECT COUNT(*) FROM artists) a, (SELECT COUNT(*) FROM albums) al, (SELECT COUNT(*) FROM tracks) t, (SELECT COUNT(*) FROM playlists) p').get() as any;
console.log(`Готово: ${stats.a} исполнителей, ${stats.al} альбомов, ${stats.t} треков, ${stats.p} плейлистов.`);
console.log('Вход: admin / admin123  ·  demo / demo123');
db.close();
