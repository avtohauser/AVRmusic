import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'avrmusic-cat-'));
process.env.JWT_SECRET = 'test-secret';
process.env.YTDLP_PATH = path.join(process.cwd(), 'tests/fixtures/fake-ytdlp.sh');
process.env.FFMPEG_PATH = path.join(process.cwd(), 'tests/fixtures/fake-ffmpeg.sh'); // copies input → output, enough for the canvas pipeline
process.env.FAKE_DETAILS = fs.mkdtempSync(path.join(os.tmpdir(), 'avrmusic-yt-'));   // per-upload details for the fake yt-dlp
process.env.AUTO_HEAL = 'false';   // the tests start the self-healing pass themselves
process.env.YOUTUBE_OEMBED = '';   // no network: upload titles come from the fake yt-dlp

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
const T2 = TRK(1002, 'Second Song (feat. Guest Star)', { isrc: 'FAKE00000002', contributors: [{ ...ART, role: 'Main' }, { ...ART2, role: 'Featured' }] });
const T3 = TRK(1003, 'Nowhere Track');
ALB.tracks = { data: [T1, T2, T3] } as any;
// solo version of the song whose "feat." version is T2 (no ISRC: only the featured artists tell them apart)
const T4 = TRK(1004, 'Second Song');
// the same recording as T2 released under another catalogue id (same ISRC)
const T5 = TRK(1005, 'Second Song (feat. Guest Star)', { isrc: 'FAKE00000002', contributors: [{ ...ART, role: 'Main' }, { ...ART2, role: 'Featured' }] });
// another artist's track featuring Fake Artist, and a various-artists compilation
const ART3 = { id: 300, name: 'Other Artist', picture_xl: null };
const ALB3 = { id: 502, title: 'Other Album', cover_xl: null, record_type: 'album', release_date: '2023-03-03', artist: ART3 };
const T6 = TRK(1006, 'Other Hit (feat. Fake Artist)', { artist: ART3, album: ALB3, contributors: [{ ...ART3, role: 'Main' }, { ...ART, role: 'Featured' }] });
const COMP = { id: 504, title: 'Summer Hits', cover_xl: null, record_type: 'compile', release_date: '2024-06-01', artist: { id: 5080, name: 'Various Artists' } };
const T8 = TRK(1008, 'Compilation Cut', { album: COMP });
const T9 = TRK(1009, 'Not Mine', { artist: ART3, album: COMP });

const dz = Fastify();
dz.get('/search/track', async (req: any) => ({ data: /fake/i.test(req.query.q) ? [T1, T2, T6] : [] }));
dz.get('/search/artist', async (req: any) => ({ data: /fake/i.test(req.query.q) ? [ART] : [] }));
dz.get('/search/album', async (req: any) => ({ data: /fake/i.test(req.query.q) ? [ALB] : [] }));
dz.get('/artist/100', async () => ART);
dz.get('/artist/100/top', async () => ({ data: [T1, T2] }));
dz.get('/artist/100/albums', async () => ({ data: [{ id: 501, title: 'Fake Single', cover_xl: null, record_type: 'single', release_date: '2022-01-01', nb_tracks: 1 }, { ...COMP, nb_tracks: 2 }, { ...ALB, tracks: undefined }] }));
dz.get('/artist/100/related', async () => ({ data: [ART2] }));
dz.get('/album/500', async () => ALB);
dz.get('/album/501', async () => ({ id: 501, title: 'Fake Single', record_type: 'single', release_date: '2022-01-01', artist: ART, tracks: { data: [T1] } }));
dz.get('/track/1001', async () => T1);
dz.get('/track/1002', async () => T2);
dz.get('/track/1003', async () => T3);
dz.get('/track/1004', async () => T4);
dz.get('/track/1005', async () => T5);
dz.get('/track/1006', async () => T6);
dz.get('/track/1008', async () => T8);
dz.get('/track/1009', async () => T9);
dz.get('/album/502', async () => ({ ...ALB3, tracks: { data: [T6] } }));
dz.get('/album/504', async () => ({ ...COMP, tracks: { data: [T8, T9] } }));
dz.get('/track/9999', async () => ({ error: { type: 'DataException', message: 'no data', code: 800 } }));

// ---- fake Audius + Internet Archive (direct-file sources) ----
const srcSrv = Fastify();
let wavPathForSources = '';
srcSrv.get('/v1/tracks/search', async (req: any) => ({ data: /second song/i.test(req.query.query) ? [{ id: 'aud1', title: 'Second Song (feat. Guest Star)', duration: 181, user: { name: 'Fake Artist' }, is_downloadable: false, permalink: '/fake/second' }] : [] }));
srcSrv.get('/v1/tracks/aud1/stream', async (_req, reply) => reply.header('content-type', 'audio/wav').send(fs.createReadStream(wavPathForSources)));
srcSrv.get('/advancedsearch.php', async (req: any) => ({ response: { docs: /fake song/i.test(req.query.q) ? [{ identifier: 'fake-live-2020', title: 'Fake Artist Live 2020', creator: 'Fake Artist', downloads: 10 }] : [] } }));
srcSrv.get('/metadata/fake-live-2020/files', async () => ({ result: [{ name: '01 Fake Song.flac', format: 'Flac', length: '181.00', title: 'Fake Song', size: '1000' }, { name: '01 Fake Song.mp3', format: 'VBR MP3', length: '181', title: 'Fake Song' }] }));
srcSrv.get('/download/fake-live-2020/:file', async (_req, reply) => reply.header('content-type', 'audio/wav').send(fs.createReadStream(wavPathForSources)));

let app: Awaited<ReturnType<typeof buildApp>>;
let access = '';

before(async () => {
  await dz.listen({ port: 0, host: '127.0.0.1' });
  (config as any).deezerApi = `http://127.0.0.1:${(dz.server.address() as any).port}`;
  await srcSrv.listen({ port: 0, host: '127.0.0.1' });
  const srcBase = `http://127.0.0.1:${(srcSrv.server.address() as any).port}`;
  (config as any).audiusApi = srcBase;
  (config as any).archiveApi = srcBase;
  (config as any).acquireSources = ['youtube', 'audius', 'archive'];
  const wavPath = path.join(process.env.DATA_DIR!, 'fake.wav');
  fs.writeFileSync(wavPath, synthesize({ bpm: 120, bars: 2, root: 57, scale: SCALES.major, progression: [0, 3], lead: 'sine', pad: 'sine', drums: false, swing: 0, seed: 11 }).wav);
  process.env.FAKE_WAV = wavPath;
  wavPathForSources = wavPath;
  app = await buildApp({ db: openDatabase(':memory:'), logger: false });
  const r = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: 'a@b.co', username: 'admin', password: 'secret1' } });
  access = r.json().accessToken;
});
after(async () => { await app.close(); await dz.close(); await srcSrv.close(); fs.rmSync(process.env.DATA_DIR!, { recursive: true, force: true }); });

test('invite code is required for the second account', async () => {
  const info = await app.inject({ method: 'GET', url: '/api/info' });
  assert.equal(info.json().inviteRequired, true);
  assert.equal(info.json().catalog, true);
  const bad = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: 'f@b.co', username: 'friend', password: 'secret1' } });
  assert.equal(bad.statusCode, 403);
  const invite = (await app.inject({ method: 'POST', url: '/api/admin/invites', headers: { authorization: `Bearer ${access}` }, payload: { note: 'friend' } })).json();
  const ok = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: 'f@b.co', username: 'friend', password: 'secret1', inviteCode: invite.code } });
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
  assert.ok(topic > video && video >= 25, `${topic} ${video}`);
  assert.ok(cover < 0 && live < 0, `other versions of the song are never taken: ${cover} ${live}`);
  const flac = scoreCandidate({ source: 'archive', title: 'Fake Song', duration: 181, artist: 'Fake Artist', quality: { lossless: true } }, want);
  const yt = scoreCandidate({ source: 'youtube', title: 'Fake Song', duration: 181, channel: 'Fake Artist' }, want);
  assert.ok(flac > yt, 'lossless file outranks a plain lossy match');
});

test('candidate scoring tells a "feat." recording from the solo one', () => {
  const solo = { title: 'Second Song', artist: 'Fake Artist', durationSec: 181 };
  const feat = { ...solo, featuring: ['Guest Star'] };
  const soloUpload = { id: 's', title: 'Second Song', duration: 181, channel: 'Fake Artist - Topic' };
  const featUpload = { id: 'f', title: 'Second Song (feat. Guest Star)', duration: 181, channel: 'Fake Artist - Topic' };
  assert.ok(scoreCandidate(featUpload, feat) > scoreCandidate(soloUpload, feat), 'feat version wants the upload that credits the guest');
  assert.ok(scoreCandidate(soloUpload, solo) > scoreCandidate(featUpload, solo), 'solo version avoids uploads crediting someone else');
  // an upload that doesn't credit the guest is never good enough for the feat. version (reliable = 25+)
  assert.ok(scoreCandidate(soloUpload, feat) < 25, `solo upload is ruled out for the feat. version (${scoreCandidate(soloUpload, feat)})`);
  assert.ok(scoreCandidate(featUpload, solo) < 25, `feat. upload is ruled out for the solo version (${scoreCandidate(featUpload, solo)})`);
  // YouTube Music often credits guests only in the description
  const described = { ...soloUpload, description: 'Provided to YouTube by Label\n\nSecond Song · Fake Artist · Guest Star\n\nFake Album' };
  assert.ok(scoreCandidate(described, feat) >= 25, 'a guest credited in the description counts');
  // a guest listed among the recording's credits isn't "someone else"
  const credited = { ...solo, credits: ['Guest Star'] };
  assert.ok(scoreCandidate(featUpload, credited) >= 25, 'feat. mark naming a credited artist is fine');
});

test('sourceFits tells whether an upload is the recording a track wants', async () => {
  const { sourceFits } = await import('../src/services/acquire.js');
  const feat = { title: 'Second Song', artist: 'Fake Artist', durationSec: 181, featuring: ['Guest Star'] };
  assert.equal(sourceFits({ title: 'Second Song', channel: 'Fake Artist - Topic' }, feat), false);
  assert.equal(sourceFits({ title: 'Second Song (feat. Guest Star)', channel: 'Fake Artist - Topic' }, feat), true);
  assert.equal(sourceFits({ title: 'Second Song', channel: 'Fake Artist - Topic', description: 'Second Song · Fake Artist · Guest Star' }, feat), true);
  const solo = { title: 'Second Song', artist: 'Fake Artist', durationSec: 181 };
  assert.equal(sourceFits({ title: 'Second Song (feat. Guest Star)', channel: 'Fake Artist - Topic' }, solo), false);
  assert.equal(sourceFits({ title: 'Second Song', channel: 'Fake Artist - Topic' }, solo), true);
});

test('Take Me to the Beach: the solo, the feat. Ado and the feat. Baker Boy versions are told apart exactly', async () => {
  const { judgeUpload } = await import('../src/services/matching.js');
  const { scoreCandidate } = await import('../src/services/acquire.js');
  const solo = { title: 'Take Me to the Beach', artist: 'Imagine Dragons', durationSec: 158, featuring: [], credits: [], album: 'LOOM' };
  const ado = { title: 'Take Me to the Beach', artist: 'Imagine Dragons', durationSec: 160, featuring: ['Ado'], credits: ['Ado'], album: 'Take Me to the Beach (feat. Ado)' };
  const ytm = (title: string, artists: string[], album: string) => ({ source: 'youtube' as const, id: 'x', title, duration: 159, channel: 'Imagine Dragons - Topic', credits: { title, artists, album, structured: true } });
  const upSolo = ytm('Take Me to the Beach', ['Imagine Dragons'], 'LOOM');
  const upAdo = ytm('Take Me to the Beach (feat. Ado)', ['Imagine Dragons', 'Ado'], 'Take Me to the Beach (feat. Ado)');
  const upAdoPlainTitle = ytm('Take Me to the Beach', ['Imagine Dragons', 'Ado'], 'Take Me to the Beach');
  const upBaker = ytm('Take Me to the Beach (feat. Baker Boy)', ['Imagine Dragons', 'Baker Boy'], 'Take Me to the Beach (feat. Baker Boy)');
  const ok = (c: any, w: any) => judgeUpload(c, w).ok;
  // the solo version: only the upload crediting Imagine Dragons alone
  assert.ok(ok(upSolo, solo));
  assert.ok(!ok(upAdo, solo), judgeUpload(upAdo, solo).why);
  assert.ok(!ok(upAdoPlainTitle, solo), 'Ado credited only in the YouTube Music credits still makes it the Ado version');
  assert.ok(!ok(upBaker, solo));
  // the Ado version: only the upload crediting exactly Imagine Dragons + Ado
  assert.ok(ok(upAdo, ado) && judgeUpload(upAdo, ado).exact);
  assert.ok(ok(upAdoPlainTitle, ado));
  assert.ok(!ok(upSolo, ado), judgeUpload(upSolo, ado).why);
  assert.ok(!ok(upBaker, ado), 'another guest is another version');
  assert.ok(scoreCandidate(upAdo, ado) > scoreCandidate(upAdoPlainTitle, ado), 'same release (album) ranks first');
  // plain uploads are judged by the artists their title names
  assert.ok(ok({ title: 'Imagine Dragons - Take Me to the Beach (Official Music Video)', channel: 'ImagineDragonsVEVO' }, solo));
  assert.ok(!ok({ title: 'Imagine Dragons, Ado - Take Me to the Beach', channel: 'x' }, solo));
  assert.ok(!ok({ title: 'Imagine Dragons x Ado - Take Me to the Beach', channel: 'x' }, solo));
  assert.ok(ok({ title: 'Imagine Dragons x Ado - Take Me to the Beach', channel: 'x' }, ado));
  assert.ok(!ok({ title: 'Imagine Dragons - Take Me to the Beach', channel: 'Tornado Music' }, ado), '"Ado" inside "Tornado" is not Ado');
  assert.ok(!ok({ title: 'Take Me to the Beach (Sped Up)', channel: 'x' }, solo));
  assert.ok(!ok({ title: 'Imagine Dragons - Take Me to the Beach (Live From Las Vegas)', channel: 'x' }, solo));
  assert.ok(!ok(ytm('Bones', ['Imagine Dragons'], 'Mercury'), solo), 'another song');
  // seen on YouTube: a mash-up of every version, and a dash without spaces on one side
  assert.ok(!ok({ title: 'Imagine Dragons -Take Me To The Beach (Baker Boy x Jungeli x Ernia x Ado)', channel: 'x' }, ado));
  assert.ok(ok({ title: 'Imagine Dragons -Take Me To The Beach (feat. Ado)', channel: 'x' }, ado));
  assert.ok(ok({ title: 'Imagine Dragons - Take Me To The Beach (Lyrics) feat. Ado', channel: 'Shooting Star' }, ado));
  assert.ok(!ok({ title: 'Imagine Dragons - Take Me To The Beach (Lyrics) feat. Ado', channel: 'Shooting Star' }, solo));
  // the same people written in another script pair up
  const yonezu = { title: 'KICK BACK', artist: 'Kenshi Yonezu', durationSec: 193, featuring: [], credits: [] };
  assert.ok(ok({ ...ytm('KICK BACK', ['米津玄師'], 'KICK BACK'), channel: '米津玄師 - Topic' }, yonezu));
});

test('YouTube Music credits are read from "Provided to YouTube by" descriptions', async () => {
  const { parseProvidedCredits } = await import('../src/services/matching.js');
  const d = 'Provided to YouTube by KIDinaKORNER/Interscope Records\n\nTake Me to the Beach (feat. Ado) · Imagine Dragons · Ado\n\nTake Me to the Beach (feat. Ado)\n\n℗ 2024 KIDinaKORNER/Interscope Records\n\nReleased on: 2024-07-12';
  assert.deepEqual(parseProvidedCredits(d), { title: 'Take Me to the Beach (feat. Ado)', artists: ['Imagine Dragons', 'Ado'], album: 'Take Me to the Beach (feat. Ado)', structured: true });
  assert.equal(parseProvidedCredits('Official video for "Bones"'), null);
});

test('audio check finds the catalogue preview inside the downloaded track', async () => {
  const { bestAlignment } = await import('../src/services/fingerprint.js');
  let seed = 2463534242;
  const rnd = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed; }; // xorshift32
  const track = Array.from({ length: 1400 }, rnd);
  // the preview: 30 s from the middle of the same recording, re-encoded (a few bits differ)
  const preview = track.slice(600, 842).map((x, i) => (i % 3 === 0 ? (x ^ (1 << (i % 32))) >>> 0 : x));
  const other = Array.from({ length: 1400 }, rnd);
  assert.ok(bestAlignment(preview, track) < 0.05, `same recording: ${bestAlignment(preview, track)}`);
  assert.ok(bestAlignment(preview, other) > 0.35, `another recording: ${bestAlignment(preview, other)}`);
});

test('findCandidates merges every source and ranks lossless first', async () => {
  const { findCandidates } = await import('../src/services/acquire.js');
  const ranked = await findCandidates({ title: 'Fake Song', artist: 'Fake Artist', durationSec: 181 });
  const sources = new Set(ranked.map((r) => r.c.source));
  assert.ok(sources.has('youtube') && sources.has('archive'), [...sources].join(','));
  assert.equal(ranked[0].c.source, 'youtube', 'official YouTube audio wins with the default order');
  // with the archive preferred in config, its lossless file wins
  const prev = (config as any).acquireSources;
  (config as any).acquireSources = ['archive', 'audius', 'youtube'];
  const ranked2 = await findCandidates({ title: 'Fake Song', artist: 'Fake Artist', durationSec: 181 });
  (config as any).acquireSources = prev;
  assert.equal(ranked2[0].c.source, 'archive');
  assert.equal(ranked2[0].c.quality?.lossless, true);
  const only = await findCandidates({ title: 'Second Song', artist: 'Fake Artist', durationSec: 181 });
  assert.ok(only.some((r) => r.c.source === 'audius'));
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

test('canvas scoring: official clip beats lyric video, topic uploads and other songs', async () => {
  const { scoreVideo } = await import('../src/services/canvas.js');
  const want = { title: 'Second Song', artist: 'Fake Artist', durationSec: 181 };
  const official = scoreVideo({ id: 'a', title: 'Fake Artist - Second Song (Official Video)', duration: 201, channel: 'FakeArtistVEVO', viewCount: 2_500_000 }, want);
  const lyric = scoreVideo({ id: 'b', title: 'Fake Artist - Second Song (Lyric Video)', duration: 183, channel: 'Fake Artist', viewCount: 5000 }, want);
  const topic = scoreVideo({ id: 'c', title: 'Second Song', duration: 181, channel: 'Fake Artist - Topic', viewCount: null }, want);
  const other = scoreVideo({ id: 'd', title: 'Fake Artist - Completely Different (Official Video)', duration: 200, channel: 'FakeArtistVEVO', viewCount: 9_000_000 }, want);
  const live = scoreVideo({ id: 'e', title: 'Fake Artist - Second Song (Live at Arena)', duration: 250, channel: 'Fake Artist', viewCount: 100000 }, want);
  assert.ok(official >= 40, `official ${official}`);
  assert.ok(lyric < 40 && lyric < official, `lyric ${lyric}`);
  assert.ok(topic < official && topic < 40, `topic ${topic}`);
  assert.ok(other < 0, `other song ${other}`);
  assert.ok(live < 40, `live ${live}`);
  // words that are part of the song title are not penalised ("Remix" in a remix track)
  const remixWant = { title: 'Second Song (Remix)', artist: 'Fake Artist', durationSec: 181 };
  assert.ok(scoreVideo({ id: 'f', title: 'Fake Artist - Second Song (Remix) [Official Video]', duration: 185, channel: 'Fake Artist', viewCount: 1000 }, remixWant) >= 40);
});

test('canvas: an acquired track gets a slice of the official clip automatically', async () => {
  const jobs = (await app.inject({ method: 'GET', url: '/api/catalog/jobs', headers: { authorization: `Bearer ${access}` } })).json();
  const cj = jobs.find((j: any) => j.kind === 'canvas' && j.title.includes('Second Song'));
  assert.ok(cj, 'a canvas job follows the acquisition');
  const done = await waitJob(cj.id);
  assert.equal(done.status, 'done', JSON.stringify(done.log));
  assert.equal(done.stats.found, 1, JSON.stringify(done.log));
  assert.ok(done.log.some((l: string) => l.includes('Official Video')), 'the official clip was chosen');
  assert.ok(!done.log.some((l: string) => l.includes('Lyric Video') && l.startsWith('   →')), 'the lyric video was not used');
  const trackId = (await app.inject({ method: 'GET', url: '/api/catalog/search?q=fake', headers: { authorization: `Bearer ${access}` } })).json().tracks[1].libraryTrackId;
  const t = (await app.inject({ method: 'GET', url: `/api/tracks/${trackId}`, headers: { authorization: `Bearer ${access}` } })).json();
  assert.equal(t.hasCanvas, true);
  assert.equal(t.canvasKind, 'video');
  // manual re-fetch (user endpoint) replaces the canvas and is de-duplicated while running
  const m = await app.inject({ method: 'POST', url: `/api/tracks/${trackId}/canvas/fetch`, headers: { authorization: `Bearer ${access}` } });
  assert.equal(m.statusCode, 200, m.body);
  const again = await app.inject({ method: 'POST', url: `/api/tracks/${trackId}/canvas/fetch`, headers: { authorization: `Bearer ${access}` } });
  assert.equal(again.json().jobId, m.json().jobId);
  const mj = await waitJob(m.json().jobId);
  assert.equal(mj.status, 'done', JSON.stringify(mj.log));
  assert.equal(mj.stats.found, 1);
  const missing = await app.inject({ method: 'POST', url: '/api/admin/canvas/fetch-missing', headers: { authorization: `Bearer ${access}` } });
  assert.equal(missing.statusCode, 200);
});

test('job queue is persistent: an unfinished job resumes after a restart', async () => {
  const { initJobs } = await import('../src/services/jobs.js');
  const trackId = (await app.inject({ method: 'GET', url: '/api/catalog/search?q=fake', headers: { authorization: `Bearer ${access}` } })).json().tracks[1].libraryTrackId;
  const id = 'resume-test-1';
  app.db.prepare('INSERT INTO jobs(id, kind, title, status, progress, log, imported, created_at, payload) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id, 'canvas', 'Канвас: resumed', 'running', 40, '["…"]', '[]', new Date().toISOString(), JSON.stringify({ trackIds: [trackId], force: true }));
  initJobs(app.db); // what a fresh process does at boot
  const j = await waitJob(id);
  assert.equal(j.status, 'done', JSON.stringify(j.log));
  assert.ok(j.log.some((l: string) => l.includes('перезапустился')));
  assert.equal(j.stats.found, 1);
  assert.equal((app.db.prepare('SELECT status FROM jobs WHERE id = ?').get(id) as any).status, 'done');
  // finished jobs are stored with their log, so the queue history survives too
  const stored = app.db.prepare("SELECT COUNT(*) c FROM jobs WHERE status = 'done'").get() as any;
  assert.ok(stored.c >= 2);
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
  // album (3: two already there, one not found) + single (same track id, skipped) + compilation (only
  // the artist's own track) + a feature on another artist's album
  assert.equal(aj.stats.total, 5, JSON.stringify(aj.log));
  assert.equal(aj.stats.imported, 2, JSON.stringify(aj.log));
  assert.ok(aj.log.some((l: string) => l.includes('фиты у других 1')), JSON.stringify(aj.log));
  assert.ok(!aj.log.some((l: string) => l.includes('Not Mine')), 'other artists from compilations are skipped');
  const titles = aj.imported.map((t: any) => t.title).sort();
  assert.deepEqual(titles, ['Compilation Cut', 'Other Hit']);
  const feat = aj.imported.find((t: any) => t.title === 'Other Hit');
  assert.equal(feat.artist.name, 'Other Artist');
  assert.equal(feat.featuring[0].name, 'Fake Artist');
});

test('a solo version and a "feat." version of the same song are different tracks', async () => {
  // T2 "Second Song (feat. Guest Star)" is in the library; its solo version must not look like a duplicate
  const before = await app.inject({ method: 'GET', url: '/api/catalog/tracks/1004', headers: { authorization: `Bearer ${access}` } });
  assert.equal(before.json().libraryTrackId, null);
  const r = await app.inject({ method: 'POST', url: '/api/catalog/acquire', headers: { authorization: `Bearer ${access}` }, payload: { kind: 'track', id: 1004 } });
  const job = await waitJob(r.json().jobId);
  assert.equal(job.status, 'done', JSON.stringify(job.log));
  assert.equal(job.stats.imported, 1, JSON.stringify(job.log));
  assert.equal(job.imported[0].featuring.length, 0);
  const feat = (await app.inject({ method: 'GET', url: '/api/catalog/tracks/1002', headers: { authorization: `Bearer ${access}` } })).json();
  assert.notEqual(job.imported[0].id, feat.libraryTrackId);
  // the same recording under another catalogue id (same ISRC) is recognised as already there
  const dup = await app.inject({ method: 'POST', url: '/api/catalog/acquire', headers: { authorization: `Bearer ${access}` }, payload: { kind: 'track', id: 1005 } });
  const dj = await waitJob(dup.json().jobId);
  assert.equal(dj.status, 'done', JSON.stringify(dj.log));
  assert.equal(dj.stats.exists, 1);
  assert.equal(dj.imported[0].id, feat.libraryTrackId);
});

async function runHealJob() {
  const { kickHeal } = await import('../src/services/runners.js');
  const { getJob } = await import('../src/services/jobs.js');
  const job = kickHeal(app.db);
  assert.ok(job, 'there is something to heal');
  for (let i = 0; i < 100; i++) {
    const j: any = getJob(job!.id);
    if (j && (j.status === 'done' || j.status === 'error')) return j;
    await new Promise((res) => setTimeout(res, 100));
  }
  throw new Error('heal timeout');
}

test('a track that got another track\'s audio heals itself with its own recording', async () => {
  const feat = app.db.prepare('SELECT id, source, file_path, source_title FROM tracks WHERE deezer_id = 1002').get() as any;
  const solo = app.db.prepare('SELECT id, source, file_path FROM tracks WHERE deezer_id = 1004').get() as any;
  assert.notEqual(feat.source, solo.source, 'new acquisitions never share a source');
  assert.match(feat.source_title, /Guest Star/, 'the source an upload came from is recorded');
  // simulate a library from before the fix: the solo version was given the feat version's video
  app.db.prepare('UPDATE tracks SET source = ? WHERE id = ?').run(feat.source, solo.id);
  const job = await runHealJob();
  assert.equal(job.status, 'done', JSON.stringify(job.log));
  assert.equal(job.stats.replaced, 1, JSON.stringify(job.log));
  const after = app.db.prepare('SELECT id, source, file_path, source_ok FROM tracks WHERE id = ?').get(solo.id) as any;
  assert.notEqual(after.source, feat.source);
  assert.notEqual(after.file_path, solo.file_path);
  assert.equal(after.source_ok, 1);
  assert.ok(fs.existsSync(after.file_path));
  assert.ok(!fs.existsSync(solo.file_path), 'the wrong file is removed');
  const { kickHeal } = await import('../src/services/runners.js');
  assert.equal(kickHeal(app.db), null, 'nothing left to heal');
});

test('a feat. version that plays the solo recording is found out and re-fetched by itself', async () => {
  const feat = app.db.prepare('SELECT id, source, file_path FROM tracks WHERE deezer_id = 1002').get() as any;
  // acquired before sources were recorded, from the upload of the solo version
  fs.writeFileSync(path.join(process.env.FAKE_DETAILS!, 'oldsolo1'), JSON.stringify({ id: 'oldsolo1', title: 'Second Song', channel: 'Fake Artist - Topic', description: 'Provided to YouTube by Label\n\nSecond Song · Fake Artist' }));
  app.db.prepare('UPDATE tracks SET source = ?, source_title = NULL, source_ok = NULL WHERE id = ?').run('youtube:oldsolo1', feat.id);
  const job = await runHealJob();
  assert.equal(job.status, 'done', JSON.stringify(job.log));
  assert.equal(job.stats.wrong, 1, JSON.stringify(job.log));
  assert.equal(job.stats.replaced, 1, JSON.stringify(job.log));
  const after = app.db.prepare('SELECT source, source_title, source_ok, file_path FROM tracks WHERE id = ?').get(feat.id) as any;
  assert.notEqual(after.source, 'youtube:oldsolo1');
  assert.match(after.source_title, /Guest Star/);
  assert.equal(after.source_ok, 1);
  // likes, playlists etc. hang off the same track id — it is still there, with a new file
  assert.notEqual(after.file_path, feat.file_path);
});

test('acquire respects ACQUIRE_ROLE=admin', async () => {
  (config as any).acquireRole = 'admin';
  const friend = (await app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'friend', password: 'secret1' } })).json();
  const r = await app.inject({ method: 'POST', url: '/api/catalog/acquire', headers: { authorization: `Bearer ${friend.accessToken}` }, payload: { kind: 'track', id: 1001 } });
  assert.equal(r.statusCode, 403);
  (config as any).acquireRole = 'user';
});
