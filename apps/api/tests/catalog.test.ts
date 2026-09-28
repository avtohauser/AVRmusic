import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'avrmusic-cat-'));
process.env.JWT_SECRET = 'test-secret';
process.env.INVITE_CODE = 'friends';
process.env.YTDLP_PATH = path.join(process.cwd(), 'tests/fixtures/fake-ytdlp.sh');
process.env.FFMPEG_PATH = '/nonexistent/ffmpeg';

const { buildApp } = await import('../src/app.js');
const { openDatabase } = await import('../src/lib/db.js');
const { config } = await import('../src/config.js');
const { synthesize, SCALES } = await import('../src/scripts/synth.js');
const { scoreCandidate } = await import('../src/services/acquire.js');
const { parseFeaturing } = await import('../src/services/catalog.js');

// ---- fake Deezer ----
const ART = { id: 100, name: 'Fake Artist', picture_xl: 'http://127.0.0.1:1/none.jpg', nb_album: 2, nb_fan: 1234 };
const ART2 = { id: 200, name: 'Guest Star', picture_xl: null, nb_album: 1, nb_fan: 5 };
const ALB = { id: 500, title: 'Fake Album', cover_xl: null, record_type: 'album', release_date: '2021-05-01', explicit_lyrics: false, nb_tracks: 3, label: 'Fake Records', genres: { data: [{ id: 1, name: 'Pop' }] }, artist: ART, contributors: [{ ...ART, role: 'Main' }] };
const TRK = (id: number, title: string, extra: any = {}) => ({ id, title, title_short: title.replace(/\s*\(feat\..*\)$/, ''), duration: 181, track_position: id - 1000, disk_number: 1, explicit_lyrics: false, preview: `http://x/${id}.mp3`, artist: ART, album: { id: ALB.id, title: ALB.title, cover_xl: null, release_date: ALB.release_date }, ...extra });
const T1 = TRK(1001, 'Fake Song');
const T2 = TRK(1002, 'Second Song (feat. Guest Star)', { contributors: [{ ...ART, role: 'Main' }, { ...ART2, role: 'Featured' }] });
const T3 = TRK(1003, 'Nowhere Track');
ALB.tracks = { data: [T1, T2, T3] } as any;

const dz = Fastify();
dz.get('/search/track', async (req: any) => ({ data: /fake/i.test(req.query.q) ? [T1, T2] : [] }));
dz.get('/search/artist', async (req: any) => ({ data: /fake/i.test(req.query.q) ? [ART] : [] }));
dz.get('/search/album', async (req: any) => ({ data: /fake/i.test(req.query.q) ? [ALB] : [] }));
dz.get('/artist/100', async () => ART);
dz.get('/artist/100/top', async () => ({ data: [T1, T2] }));
dz.get('/artist/100/albums', async () => ({ data: [{ ...ALB, tracks: undefined }, { id: 501, title: 'Fake Single', cover_xl: null, record_type: 'single', release_date: '2022-01-01', nb_tracks: 1 }] }));
dz.get('/artist/100/related', async () => ({ data: [ART2] }));
dz.get('/album/500', async () => ALB);
dz.get('/album/501', async () => ({ id: 501, title: 'Fake Single', record_type: 'single', release_date: '2022-01-01', artist: ART, tracks: { data: [T1] } }));
dz.get('/track/1001', async () => T1);
dz.get('/track/1002', async () => T2);
dz.get('/track/1003', async () => T3);
dz.get('/track/9999', async () => ({ error: { type: 'DataException', message: 'no data', code: 800 } }));

let app: Awaited<ReturnType<typeof buildApp>>;
let access = '';

before(async () => {
  await dz.listen({ port: 0, host: '127.0.0.1' });
  (config as any).deezerApi = `http://127.0.0.1:${(dz.server.address() as any).port}`;
  const wavPath = path.join(process.env.DATA_DIR!, 'fake.wav');
  fs.writeFileSync(wavPath, synthesize({ bpm: 120, bars: 2, root: 57, scale: SCALES.major, progression: [0, 3], lead: 'sine', pad: 'sine', drums: false, swing: 0, seed: 11 }).wav);
  process.env.FAKE_WAV = wavPath;
  app = await buildApp({ db: openDatabase(':memory:'), logger: false });
  const r = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: 'a@b.co', username: 'admin', password: 'secret1' } });
  access = r.json().accessToken;
});
after(async () => { await app.close(); await dz.close(); fs.rmSync(process.env.DATA_DIR!, { recursive: true, force: true }); });

test('invite code is required for the second account', async () => {
  const info = await app.inject({ method: 'GET', url: '/api/info' });
  assert.equal(info.json().inviteRequired, true);
  assert.equal(info.json().catalog, true);
  const bad = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: 'f@b.co', username: 'friend', password: 'secret1' } });
  assert.equal(bad.statusCode, 403);
  const ok = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: 'f@b.co', username: 'friend', password: 'secret1', inviteCode: 'friends' } });
  assert.equal(ok.statusCode, 200, ok.body);
});

test('featuring parser', () => {
  assert.deepEqual(parseFeaturing('Song (feat. A & B)', 'Song'), { title: 'Song', featuring: ['A', 'B'] });
  assert.deepEqual(parseFeaturing('Song ft. Somebody'), { title: 'Song', featuring: ['Somebody'] });
  assert.deepEqual(parseFeaturing('Plain'), { title: 'Plain', featuring: [] });
});

test('candidate scoring prefers official topic audio with matching duration', () => {
  const want = { title: 'Fake Song', artist: 'Fake Artist', durationSec: 181 };
  const topic = scoreCandidate({ id: 'a', title: 'Fake Song', duration: 181, channel: 'Fake Artist - Topic' }, want);
  const live = scoreCandidate({ id: 'b', title: 'Fake Artist - Fake Song (Live at Arena)', duration: 250, channel: 'Random' }, want);
  const cover = scoreCandidate({ id: 'c', title: 'Fake Song (cover)', duration: 182, channel: 'Someone' }, want);
  const video = scoreCandidate({ id: 'd', title: 'Fake Artist - Fake Song (Official Video)', duration: 183, channel: 'FakeArtistVEVO' }, want);
  assert.ok(topic > video && video > cover && cover > live, `${topic} ${video} ${cover} ${live}`);
  assert.ok(live < 25);
});

test('catalog search maps artists, albums, tracks and features', async () => {
  const r = await app.inject({ method: 'GET', url: '/api/catalog/search?q=fake', headers: { authorization: `Bearer ${access}` } });
  assert.equal(r.statusCode, 200, r.body);
  const s = r.json();
  assert.equal(s.top.kind, 'artist');
  assert.equal(s.artists[0].name, 'Fake Artist');
  assert.equal(s.albums[0].type, 'album');
  assert.equal(s.tracks[1].title, 'Second Song');
  assert.equal(s.tracks[1].featuring[0].name, 'Guest Star');
  assert.equal(s.tracks[0].libraryTrackId, null);
  const nothing = await app.inject({ method: 'GET', url: '/api/catalog/search?q=zzz', headers: { authorization: `Bearer ${access}` } });
  assert.equal(nothing.json().tracks.length, 0);
});

test('catalog artist page: discography split, related, appears-on', async () => {
  const r = await app.inject({ method: 'GET', url: '/api/catalog/artists/100', headers: { authorization: `Bearer ${access}` } });
  assert.equal(r.statusCode, 200, r.body);
  const a = r.json();
  assert.equal(a.artist.fans, 1234);
  assert.equal(a.albums.length, 1);
  assert.equal(a.singles.length, 1);
  assert.equal(a.related[0].name, 'Guest Star');
  assert.equal(a.topTracks.length, 2);
});

test('catalog album page', async () => {
  const r = await app.inject({ method: 'GET', url: '/api/catalog/albums/500', headers: { authorization: `Bearer ${access}` } });
  const a = r.json();
  assert.equal(a.tracks.length, 3);
  assert.equal(a.label, 'Fake Records');
  assert.deepEqual(a.genres, ['Pop']);
  assert.equal(a.inLibrary, 0);
  const missing = await app.inject({ method: 'GET', url: '/api/catalog/tracks/9999', headers: { authorization: `Bearer ${access}` } });
  assert.equal(missing.statusCode, 404);
});

async function waitJob(id: string) {
  for (let i = 0; i < 100; i++) {
    const r = await app.inject({ method: 'GET', url: '/api/catalog/jobs', headers: { authorization: `Bearer ${access}` } });
    const j = r.json().find((x: any) => x.id === id);
    if (j && (j.status === 'done' || j.status === 'error')) return j;
    await new Promise((res) => setTimeout(res, 100));
  }
  throw new Error('job timeout');
}

test('acquire a single track: yt-dlp match → library track with catalogue metadata', async () => {
  const r = await app.inject({ method: 'POST', url: '/api/catalog/acquire', headers: { authorization: `Bearer ${access}` }, payload: { kind: 'track', id: 1002 } });
  assert.equal(r.statusCode, 200, r.body);
  const job = await waitJob(r.json().jobId);
  assert.equal(job.status, 'done', JSON.stringify(job.log));
  assert.equal(job.imported.length, 1);
  const t = job.imported[0];
  assert.equal(t.title, 'Second Song');
  assert.equal(t.artist.name, 'Fake Artist');
  assert.equal(t.featuring[0].name, 'Guest Star');
  assert.equal(t.album.title, 'Fake Album');
  assert.equal(t.genre, 'Pop');
  assert.equal(t.trackNo, 2);
  assert.ok(t.durationMs > 1000);
  assert.ok(job.log.some((l: string) => l.includes('Topic')));
  // catalogue now reports the track as in-library
  const s = await app.inject({ method: 'GET', url: '/api/catalog/search?q=fake', headers: { authorization: `Bearer ${access}` } });
  assert.equal(s.json().tracks[1].libraryTrackId, t.id);
  assert.equal(s.json().artists[0].libraryArtistId, t.artist.id);
  // local artist page links back to the catalogue
  const la = await app.inject({ method: 'GET', url: `/api/artists/${t.artist.id}`, headers: { authorization: `Bearer ${access}` } });
  assert.equal(la.json().deezerId, 100);
  assert.equal(la.json().verified, true);
});

test('acquire an album: existing skipped, missing reported, others imported', async () => {
  const r = await app.inject({ method: 'POST', url: '/api/catalog/acquire', headers: { authorization: `Bearer ${access}` }, payload: { kind: 'album', id: 500 } });
  const job = await waitJob(r.json().jobId);
  assert.equal(job.status, 'done', JSON.stringify(job.log));
  assert.deepEqual(job.stats, { total: 3, imported: 1, exists: 1, failed: 1 });
  const al = await app.inject({ method: 'GET', url: '/api/catalog/albums/500', headers: { authorization: `Bearer ${access}` } });
  assert.equal(al.json().inLibrary, 2);
  assert.ok(al.json().libraryAlbumId);
  const local = await app.inject({ method: 'GET', url: `/api/albums/${al.json().libraryAlbumId}`, headers: { authorization: `Bearer ${access}` } });
  assert.equal(local.json().tracks.length, 2);
  assert.equal(local.json().year, 2021);
  assert.equal(local.json().label, 'Fake Records');
  // duplicate request while nothing is running returns a new job; a queued duplicate is coalesced
  const a1 = await app.inject({ method: 'POST', url: '/api/catalog/acquire', headers: { authorization: `Bearer ${access}` }, payload: { kind: 'artist', id: 100 } });
  const a2 = await app.inject({ method: 'POST', url: '/api/catalog/acquire', headers: { authorization: `Bearer ${access}` }, payload: { kind: 'artist', id: 100 } });
  assert.equal(a1.json().jobId, a2.json().jobId);
  const aj = await waitJob(a1.json().jobId);
  assert.equal(aj.status, 'done', JSON.stringify(aj.log));
  assert.equal(aj.stats.total, 4); // album (3) + single (1, already there)
});

test('acquire respects ACQUIRE_ROLE=admin', async () => {
  (config as any).acquireRole = 'admin';
  const friend = (await app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'friend', password: 'secret1' } })).json();
  const r = await app.inject({ method: 'POST', url: '/api/catalog/acquire', headers: { authorization: `Bearer ${friend.accessToken}` }, payload: { kind: 'track', id: 1001 } });
  assert.equal(r.statusCode, 403);
  (config as any).acquireRole = 'user';
});
