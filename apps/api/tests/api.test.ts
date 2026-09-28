import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'avrmusic-test-'));
process.env.JWT_SECRET = 'test-secret';
process.env.PUBLIC_LIBRARY = 'false';

const { buildApp } = await import('../src/app.js');
const { openDatabase } = await import('../src/lib/db.js');
const { synthesize, SCALES } = await import('../src/scripts/synth.js');
const { parseLrc, lrcToPlain } = await import('../src/lib/lyrics.js');

let app: Awaited<ReturnType<typeof buildApp>>;
let access = '';
let media = '';
let refresh = '';
let trackId = '';

before(async () => {
  app = await buildApp({ db: openDatabase(':memory:'), logger: false });
});
after(async () => {
  await app.close();
  fs.rmSync(process.env.DATA_DIR!, { recursive: true, force: true });
});

test('lyrics: LRC parse & plain', () => {
  const lrc = '[ti:x]\n[00:01.50]Hello\n[00:03.000]World\n[00:02.00]Between';
  const parsed = parseLrc(lrc)!;
  assert.equal(parsed.length, 3);
  assert.deepEqual(parsed.map((l) => l.timeMs), [1500, 2000, 3000]);
  assert.equal(lrcToPlain(lrc), 'Hello\nWorld\nBetween');
  assert.equal(parseLrc('no timestamps here'), null);
});

test('server info reports setup needed', async () => {
  const r = await app.inject({ method: 'GET', url: '/api/info' });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().needsSetup, true);
});

test('register first user becomes admin; login + refresh work', async () => {
  const r = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: 'a@b.co', username: 'admin', password: 'secret1' } });
  assert.equal(r.statusCode, 200, r.body);
  const body = r.json();
  assert.equal(body.user.role, 'admin');
  access = body.accessToken; media = body.mediaToken; refresh = body.refreshToken;

  const bad = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'admin', password: 'wrong' } });
  assert.equal(bad.statusCode, 401);

  const rr = await app.inject({ method: 'POST', url: '/api/auth/refresh', payload: { refreshToken: refresh } });
  assert.equal(rr.statusCode, 200);
  assert.ok(rr.json().accessToken);
  const reuse = await app.inject({ method: 'POST', url: '/api/auth/refresh', payload: { refreshToken: refresh } });
  assert.equal(reuse.statusCode, 401, 'refresh tokens are single-use');
  refresh = rr.json().refreshToken;
});

test('library requires auth when PUBLIC_LIBRARY=false', async () => {
  const r = await app.inject({ method: 'GET', url: '/api/home' });
  assert.equal(r.statusCode, 401);
});

test('admin upload imports a wav with sidecar-less metadata overrides', async () => {
  const { wav } = synthesize({ bpm: 120, bars: 2, root: 57, scale: SCALES.major, progression: [0, 3], lead: 'sine', pad: 'sine', drums: false, swing: 0, seed: 3 });
  const boundary = '----avrtest';
  const parts: Buffer[] = [];
  const field = (name: string, value: string) => parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  field('artist', 'Test Artist feat. Guest');
  field('album', 'Test Album');
  field('genre', 'Testcore');
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="01 - Test Artist - Test Song.wav"\r\nContent-Type: audio/wav\r\n\r\n`));
  parts.push(wav);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  const r = await app.inject({ method: 'POST', url: '/api/admin/upload', headers: { authorization: `Bearer ${access}`, 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: Buffer.concat(parts) });
  assert.equal(r.statusCode, 200, r.body);
  const body = r.json();
  assert.equal(body.imported.length, 1);
  const t = body.imported[0];
  trackId = t.id;
  assert.equal(t.title, 'Test Song');
  assert.equal(t.artist.name, 'Test Artist');
  assert.equal(t.featuring[0].name, 'Guest');
  assert.equal(t.album.title, 'Test Album');
  assert.ok(t.durationMs > 3000);
  assert.equal(t.mimeType, 'audio/wav');
});

test('search finds the track, album and artist', async () => {
  const r = await app.inject({ method: 'GET', url: '/api/search?q=test', headers: { authorization: `Bearer ${access}` } });
  assert.equal(r.statusCode, 200);
  const s = r.json();
  assert.equal(s.tracks[0].id, trackId);
  assert.equal(s.albums[0].title, 'Test Album');
  assert.ok(s.artists.some((a: any) => a.name === 'Test Artist'));
  assert.ok(s.top);
  const prefix = await app.inject({ method: 'GET', url: '/api/search?q=tes', headers: { authorization: `Bearer ${access}` } });
  assert.equal(prefix.json().tracks.length, 1, 'prefix search');
  const sug = await app.inject({ method: 'GET', url: '/api/search/suggest?q=gue', headers: { authorization: `Bearer ${access}` } });
  assert.ok(sug.json().some((x: any) => x.title === 'Guest'));
});

test('stream supports Range with media token in query', async () => {
  const noAuth = await app.inject({ method: 'GET', url: `/api/stream/${trackId}` });
  assert.equal(noAuth.statusCode, 401);
  const full = await app.inject({ method: 'GET', url: `/api/stream/${trackId}?t=${media}` });
  assert.equal(full.statusCode, 200);
  assert.equal(full.headers['accept-ranges'], 'bytes');
  const size = Number(full.headers['content-length']);
  const part = await app.inject({ method: 'GET', url: `/api/stream/${trackId}?t=${media}`, headers: { range: 'bytes=100-199' } });
  assert.equal(part.statusCode, 206);
  assert.equal(part.headers['content-range'], `bytes 100-199/${size}`);
  assert.equal(part.rawPayload.length, 100);
  const tail = await app.inject({ method: 'GET', url: `/api/stream/${trackId}?t=${media}`, headers: { range: 'bytes=-50' } });
  assert.equal(tail.statusCode, 206);
  assert.equal(tail.rawPayload.length, 50);
  const bad = await app.inject({ method: 'GET', url: `/api/stream/${trackId}?t=${media}`, headers: { range: `bytes=${size + 10}-` } });
  assert.equal(bad.statusCode, 416);
  // media-scoped token must not grant API access
  const apiWithMedia = await app.inject({ method: 'GET', url: '/api/home', headers: { authorization: `Bearer ${media}` } });
  assert.equal(apiWithMedia.statusCode, 401);
});

test('download sets attachment filename; album zip streams', async () => {
  const r = await app.inject({ method: 'GET', url: `/api/download/${trackId}?t=${media}` });
  assert.equal(r.statusCode, 200);
  assert.match(String(r.headers['content-disposition']), /attachment; filename="Test Artist - Test Song.wav"/);
  const albumId = (await app.inject({ method: 'GET', url: `/api/tracks/${trackId}`, headers: { authorization: `Bearer ${access}` } })).json().album.id;
  const z = await app.inject({ method: 'GET', url: `/api/download/album/${albumId}?t=${media}` });
  assert.equal(z.statusCode, 200);
  assert.equal(z.headers['content-type'], 'application/zip');
  assert.equal(z.rawPayload.subarray(0, 2).toString(), 'PK');
});

test('lyrics: set synced LRC via admin, read back parsed', async () => {
  const lrc = '[00:00.50]First line\n[00:02.00]Second line';
  const r = await app.inject({ method: 'PATCH', url: `/api/admin/tracks/${trackId}`, headers: { authorization: `Bearer ${access}` }, payload: { lyricsSynced: lrc } });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().hasSyncedLyrics, true);
  const l = await app.inject({ method: 'GET', url: `/api/tracks/${trackId}/lyrics`, headers: { authorization: `Bearer ${access}` } });
  assert.deepEqual(l.json().synced, [{ timeMs: 500, text: 'First line' }, { timeMs: 2000, text: 'Second line' }]);
  assert.equal(l.json().plain, 'First line\nSecond line');
  const invalid = await app.inject({ method: 'PATCH', url: `/api/admin/tracks/${trackId}`, headers: { authorization: `Bearer ${access}` }, payload: { lyricsSynced: 'not lrc' } });
  assert.equal(invalid.statusCode, 400);
});

test('canvas upload and range serving', async () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>';
  const boundary = '----canvas';
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="loop.svg"\r\nContent-Type: image/svg+xml\r\n\r\n`),
    Buffer.from(svg),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const r = await app.inject({ method: 'POST', url: `/api/admin/tracks/${trackId}/canvas`, headers: { authorization: `Bearer ${access}`, 'content-type': `multipart/form-data; boundary=${boundary}` }, payload });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().hasCanvas, true);
  assert.equal(r.json().canvasKind, 'image');
  const c = await app.inject({ method: 'GET', url: `/api/canvas/${trackId}?t=${media}` });
  assert.equal(c.statusCode, 200);
  assert.equal(c.headers['content-type'], 'image/svg+xml');
  assert.equal(c.body, svg);
});

test('playlists: create, add, reorder, remove, like, public listing', async () => {
  const c = await app.inject({ method: 'POST', url: '/api/playlists', headers: { authorization: `Bearer ${access}` }, payload: { title: 'Mine', trackIds: [trackId] } });
  assert.equal(c.statusCode, 200, c.body);
  const pl = c.json();
  assert.equal(pl.trackCount, 1);
  assert.equal(pl.isOwner, true);
  const again = await app.inject({ method: 'POST', url: `/api/playlists/${pl.id}/tracks`, headers: { authorization: `Bearer ${access}` }, payload: { trackIds: [trackId] } });
  assert.equal(again.json().added, 0, 'no duplicates');
  const order = await app.inject({ method: 'PUT', url: `/api/playlists/${pl.id}/order`, headers: { authorization: `Bearer ${access}` }, payload: { trackIds: [trackId] } });
  assert.equal(order.statusCode, 200);
  const like = await app.inject({ method: 'PUT', url: `/api/me/likes/playlist/${pl.id}`, headers: { authorization: `Bearer ${access}` } });
  assert.equal(like.json().liked, true);
  const mine = await app.inject({ method: 'GET', url: '/api/playlists', headers: { authorization: `Bearer ${access}` } });
  assert.equal(mine.json().length, 1);
  const s = await app.inject({ method: 'GET', url: '/api/search?q=mine&type=playlist', headers: { authorization: `Bearer ${access}` } });
  assert.equal(s.json().playlists[0].id, pl.id);
  const rm = await app.inject({ method: 'DELETE', url: `/api/playlists/${pl.id}/tracks/${trackId}`, headers: { authorization: `Bearer ${access}` } });
  assert.equal(rm.json().trackCount, 0);

  // second user cannot edit
  const u2 = (await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: 'u2@b.co', username: 'user2', password: 'secret1' } })).json();
  assert.equal(u2.user.role, 'user');
  const forbidden = await app.inject({ method: 'PATCH', url: `/api/playlists/${pl.id}`, headers: { authorization: `Bearer ${u2.accessToken}` }, payload: { title: 'Hijack' } });
  assert.equal(forbidden.statusCode, 403);
  const adminOnly = await app.inject({ method: 'GET', url: '/api/admin/stats', headers: { authorization: `Bearer ${u2.accessToken}` } });
  assert.equal(adminOnly.statusCode, 403);
});

test('likes + plays feed the home page', async () => {
  const like = await app.inject({ method: 'PUT', url: `/api/me/likes/track/${trackId}`, headers: { authorization: `Bearer ${access}` } });
  assert.equal(like.statusCode, 200);
  const liked = await app.inject({ method: 'GET', url: '/api/me/likes/tracks', headers: { authorization: `Bearer ${access}` } });
  assert.equal(liked.json()[0].id, trackId);
  assert.equal(liked.json()[0].liked, true);
  const play = await app.inject({ method: 'POST', url: '/api/me/plays', headers: { authorization: `Bearer ${access}` }, payload: { trackId, msPlayed: 31000, context: 'test' } });
  assert.equal(play.statusCode, 200);
  const t = await app.inject({ method: 'GET', url: `/api/tracks/${trackId}`, headers: { authorization: `Bearer ${access}` } });
  assert.equal(t.json().playCount, 1);
  const home = await app.inject({ method: 'GET', url: '/api/home', headers: { authorization: `Bearer ${access}` } });
  assert.equal(home.statusCode, 200);
  const h = home.json();
  assert.ok(h.sections.find((s: any) => s.id === 'recent'));
  assert.equal(h.quickPicks[0].kind, 'liked');
  const radio = await app.inject({ method: 'GET', url: `/api/tracks/${trackId}/radio`, headers: { authorization: `Bearer ${access}` } });
  assert.equal(radio.statusCode, 200);
  const stats = await app.inject({ method: 'GET', url: '/api/admin/stats', headers: { authorization: `Bearer ${access}` } });
  assert.equal(stats.json().tracks, 1);
  assert.equal(stats.json().withLyrics, 1);
  assert.equal(stats.json().withCanvas, 1);
});

test('delete track cleans up orphans', async () => {
  const r = await app.inject({ method: 'DELETE', url: `/api/admin/tracks/${trackId}`, headers: { authorization: `Bearer ${access}` } });
  assert.equal(r.statusCode, 200);
  const albums = await app.inject({ method: 'GET', url: '/api/albums', headers: { authorization: `Bearer ${access}` } });
  assert.equal(albums.json().total, 0);
  const s = await app.inject({ method: 'GET', url: '/api/search?q=test', headers: { authorization: `Bearer ${access}` } });
  assert.equal(s.json().tracks.length, 0);
});

test('filename heuristics', async () => {
  const { guessFromFilename, splitArtists } = await import('../src/services/importer.js');
  assert.deepEqual(guessFromFilename('01 - Artist Name - Song Title'), { artist: 'Artist Name', title: 'Song Title' });
  assert.deepEqual(guessFromFilename('Artist – Song'), { artist: 'Artist', title: 'Song' });
  assert.deepEqual(guessFromFilename('07. Just a title'), { artist: null, title: 'Just a title' });
  assert.deepEqual(splitArtists('A feat. B & C'), { main: 'A', featuring: ['B', 'C'] });
  assert.deepEqual(splitArtists('Solo'), { main: 'Solo', featuring: [] });
});

test('LRCLIB parsing helpers tolerate missing service', async () => {
  const { lookupLyrics } = await import('../src/services/lrclib.js');
  process.env.LRCLIB_URL = 'http://127.0.0.1:1'; // unreachable
  const { config } = await import('../src/config.js');
  (config as any).lrclibUrl = 'http://127.0.0.1:1';
  await assert.rejects(lookupLyrics({ artist: 'x', title: 'y' }));
});
