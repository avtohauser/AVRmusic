import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'avrmusic-test-'));
process.env.JWT_SECRET = 'test-secret';
process.env.PUBLIC_LIBRARY = 'false';
process.env.AUTO_HEAL = 'false';
process.env.WAVE_DISCOVERY = 'false';
process.env.ANALYZE = 'false';
process.env.BACKGROUND = 'false';

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
  const inv2 = (await app.inject({ method: 'POST', url: '/api/admin/invites', headers: { authorization: `Bearer ${access}` }, payload: {} })).json();
  const u2 = (await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: 'u2@b.co', username: 'user2', password: 'secret1', inviteCode: inv2.code } })).json();
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

test('yt-dlp title cleanup', async () => {
  const { cleanTitle } = await import('../src/services/ytdlp.js');
  assert.equal(cleanTitle('Artist - Song (Official Video)'), 'Artist - Song');
  assert.equal(cleanTitle('Song [Official Lyric Video] | HD'), 'Song');
  assert.equal(cleanTitle('Песня (Премьера клипа 2025)'), 'Песня');
  assert.equal(cleanTitle('Plain Title (Live at Home)'), 'Plain Title (Live at Home)');
});

test('invites: registration needs a one-time code issued by an admin', async () => {
  const h = { authorization: `Bearer ${access}` };
  const info = (await app.inject({ method: 'GET', url: '/api/info' })).json();
  assert.equal(info.inviteRequired, true);
  const noCode = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: 'n@b.co', username: 'nocode', password: 'secret1' } });
  assert.equal(noCode.statusCode, 403);
  const wrong = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: 'n@b.co', username: 'nocode', password: 'secret1', inviteCode: 'ZZZZ-ZZZZ' } });
  assert.equal(wrong.statusCode, 403);

  const created = await app.inject({ method: 'POST', url: '/api/admin/invites', headers: h, payload: { note: 'для Пети' } });
  assert.equal(created.statusCode, 200, created.body);
  const inv = created.json();
  assert.match(inv.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal(inv.usedBy, null);
  const list = (await app.inject({ method: 'GET', url: '/api/admin/invites', headers: h })).json();
  assert.ok(list.some((i: any) => i.code === inv.code && i.note === 'для Пети'));
  const userToken = (await app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'user2', password: 'secret1' } })).json().accessToken;
  const asUser = await app.inject({ method: 'GET', url: '/api/admin/invites', headers: { authorization: `Bearer ${userToken}` } });
  assert.equal(asUser.statusCode, 403, 'only admins manage invites');

  // dashes/case/spaces do not matter; the code is consumed by exactly one registration
  const ok = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: 'p@b.co', username: 'petya', password: 'secret1', inviteCode: ` ${inv.code.toLowerCase().replace('-', '')} ` } });
  assert.equal(ok.statusCode, 200, ok.body);
  assert.equal(ok.json().user.role, 'user');
  const used = (await app.inject({ method: 'GET', url: '/api/admin/invites', headers: h })).json().find((i: any) => i.code === inv.code);
  assert.equal(used.usedBy.username, 'petya');
  const again = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: 'q@b.co', username: 'again', password: 'secret1', inviteCode: inv.code } });
  assert.equal(again.statusCode, 403);

  const expired = (await app.inject({ method: 'POST', url: '/api/admin/invites', headers: h, payload: { expiresDays: 1 } })).json();
  app.db.prepare("UPDATE invites SET expires_at = '2000-01-01T00:00:00.000Z' WHERE code = ?").run(expired.code.replace('-', ''));
  const late = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: 'l@b.co', username: 'late', password: 'secret1', inviteCode: expired.code } });
  assert.equal(late.statusCode, 403);
  const del = await app.inject({ method: 'DELETE', url: `/api/admin/invites/${expired.code}`, headers: h });
  assert.equal(del.statusCode, 200);
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/admin/invites/${expired.code}`, headers: h })).statusCode, 404);
});

test('avatar: upload shows up on the user, delete removes it', async () => {
  const h = { authorization: `Bearer ${access}` };
  const boundary = '----avravatar';
  const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64');
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="avatar.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
    jpeg,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const up = await app.inject({ method: 'POST', url: '/api/me/avatar', headers: { ...h, 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: body });
  assert.equal(up.statusCode, 200, up.body);
  const url = up.json().avatarUrl as string;
  assert.match(url, /^\/media\/avatars\/.+\.jpg$/);
  const img = await app.inject({ method: 'GET', url });
  assert.equal(img.statusCode, 200);
  assert.equal((await app.inject({ method: 'GET', url: '/api/auth/me', headers: h })).json().avatarUrl, url);
  const del = await app.inject({ method: 'DELETE', url: '/api/me/avatar', headers: h });
  assert.equal(del.statusCode, 200);
  assert.equal(del.json().avatarUrl, null);
  assert.equal((await app.inject({ method: 'GET', url })).statusCode, 404);
});

test('admin news reach everyone, newest first, and can be taken back', async () => {
  const h = { authorization: `Bearer ${access}` };
  const a = await app.inject({ method: 'POST', url: '/api/admin/news', headers: h, payload: { title: 'Первая', body: 'Привет всем' } });
  assert.equal(a.statusCode, 200, a.body);
  const first = a.json();
  assert.equal(first.title, 'Первая');
  await new Promise((r) => setTimeout(r, 5));
  const b = await app.inject({ method: 'POST', url: '/api/admin/news', headers: h, payload: { title: 'Вторая' } });
  const second = b.json();
  const list = (await app.inject({ method: 'GET', url: '/api/news', headers: h })).json();
  assert.deepEqual(list.slice(0, 2).map((n: any) => n.id), [second.id, first.id]);
  const since = (await app.inject({ method: 'GET', url: `/api/news?after=${encodeURIComponent(first.createdAt)}`, headers: h })).json();
  assert.deepEqual(since.map((n: any) => n.id), [second.id]);
  assert.equal((await app.inject({ method: 'GET', url: '/api/news' })).statusCode, 401);
  const empty = await app.inject({ method: 'POST', url: '/api/admin/news', headers: h, payload: { title: '' } });
  assert.equal(empty.statusCode, 400, empty.body);
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/admin/news/${first.id}`, headers: h })).statusCode, 200);
  assert.equal((await app.inject({ method: 'GET', url: '/api/news', headers: h })).json().some((n: any) => n.id === first.id), false);
});


async function uploadSong(title: string): Promise<string> {
  const { wav } = synthesize({ bpm: 100, bars: 1, root: 60, scale: SCALES.major, progression: [0], lead: 'sine', pad: 'sine', drums: false, swing: 0, seed: title.length * 7 + title.charCodeAt(0) });
  const boundary = '----avrsong';
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="Friend Band - ${title}.wav"\r\nContent-Type: audio/wav\r\n\r\n`),
    wav,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const r = await app.inject({ method: 'POST', url: '/api/admin/upload', headers: { authorization: `Bearer ${access}`, 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: body });
  assert.equal(r.statusCode, 200, r.body);
  return r.json().imported[0].id;
}

test('friends: now playing, shares, reactions, shared playlists, recap and compatibility', async () => {
  const h = { authorization: `Bearer ${access}` };
  trackId = await uploadSong('Together');
  const pt = (await app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'petya', password: 'secret1' } })).json().accessToken;
  const hp = { authorization: `Bearer ${pt}` };
  const users = (await app.inject({ method: 'GET', url: '/api/users', headers: h })).json();
  const petya = users.find((u: any) => u.username === 'petya');
  assert.ok(petya, 'petya is listed');

  await app.inject({ method: 'POST', url: '/api/me/now', headers: h, payload: { trackId, positionMs: 1000, playing: true } });
  const seen = (await app.inject({ method: 'GET', url: '/api/users', headers: hp })).json();
  const admin = seen.find((u: any) => u.now);
  assert.equal(admin.now.track.id, trackId, 'friends see what is playing');

  const sent = await app.inject({ method: 'POST', url: '/api/shares', headers: h, payload: { to: [petya.id], kind: 'track', refId: trackId, message: 'послушай' } });
  assert.equal(sent.json().sent, 1, sent.body);
  const inbox = (await app.inject({ method: 'GET', url: '/api/shares', headers: hp })).json();
  assert.equal(inbox[0].item.id, trackId);
  assert.equal(inbox[0].from.id, admin.id);
  assert.equal(inbox[0].seen, false);
  await app.inject({ method: 'POST', url: '/api/shares/seen', headers: hp });
  assert.equal((await app.inject({ method: 'GET', url: '/api/shares', headers: hp })).json()[0].seen, true);
  assert.equal((await app.inject({ method: 'POST', url: '/api/shares', headers: h, payload: { to: [petya.id], kind: 'track', refId: 'nope' } })).statusCode, 404);

  const r = await app.inject({ method: 'POST', url: `/api/tracks/${trackId}/reactions`, headers: hp, payload: { atMs: 1500, emoji: '🔥' } });
  assert.equal(r.statusCode, 200, r.body);
  const list = (await app.inject({ method: 'GET', url: `/api/tracks/${trackId}/reactions`, headers: h })).json();
  assert.equal(list[0].emoji, '🔥');
  assert.equal(list[0].user.id, petya.id);
  assert.equal((await app.inject({ method: 'POST', url: `/api/tracks/${trackId}/reactions`, headers: hp, payload: { atMs: 0 } })).statusCode, 400);
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/reactions/${list[0].id}`, headers: hp })).statusCode, 200);

  // a shared playlist: the invited friend may add tracks, others may not
  const pl = (await app.inject({ method: 'POST', url: '/api/playlists', headers: h, payload: { title: 'Вместе' } })).json();
  assert.equal((await app.inject({ method: 'POST', url: `/api/playlists/${pl.id}/tracks`, headers: hp, payload: { trackIds: [trackId] } })).statusCode, 403);
  assert.equal((await app.inject({ method: 'POST', url: `/api/playlists/${pl.id}/members`, headers: h, payload: { userId: petya.id } })).statusCode, 200);
  const add = await app.inject({ method: 'POST', url: `/api/playlists/${pl.id}/tracks`, headers: hp, payload: { trackIds: [trackId] } });
  assert.equal(add.statusCode, 200, add.body);
  const full = (await app.inject({ method: 'GET', url: `/api/playlists/${pl.id}`, headers: hp })).json();
  assert.equal(full.canEdit, true);
  assert.equal(full.members.length, 1);
  assert.equal(full.tracks[0].addedBy.id, petya.id);
  assert.ok((await app.inject({ method: 'GET', url: '/api/playlists', headers: hp })).json().some((p: any) => p.id === pl.id), 'a shared playlist is in the member\'s list');
  assert.equal((await app.inject({ method: 'GET', url: '/api/shares', headers: hp })).json()[0].message, 'invite');
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/playlists/${pl.id}/members/${petya.id}`, headers: hp })).statusCode, 200);
  assert.equal((await app.inject({ method: 'POST', url: `/api/playlists/${pl.id}/tracks`, headers: hp, payload: { trackIds: [trackId] } })).statusCode, 403);

  const rc = await app.inject({ method: 'GET', url: '/api/me/recap?period=year&tz=180', headers: h });
  assert.equal(rc.statusCode, 200, rc.body);
  assert.equal(rc.json().hours.length, 24);
  const prof = await app.inject({ method: 'GET', url: `/api/users/${petya.id}`, headers: h });
  assert.equal(prof.statusCode, 200, prof.body);
  assert.ok(prof.json().compat.score >= 0 && prof.json().compat.score <= 100);

  const wave = await app.inject({ method: 'POST', url: '/api/wave/next', headers: h, payload: { mode: `friend:${petya.id}` } });
  assert.equal(wave.statusCode, 200, wave.body);
  assert.equal((await app.inject({ method: 'POST', url: '/api/wave/next', headers: h, payload: { mode: 'run' } })).statusCode, 200);
  assert.equal((await app.inject({ method: 'POST', url: '/api/wave/next', headers: h, payload: { mode: 'bogus' } })).statusCode, 400);
});

test('an artist\'s whole discography plays as one list', async () => {
  const h = { authorization: `Bearer ${access}` };
  const id = await uploadSong('Deep Cut');
  const t = (await app.inject({ method: 'GET', url: `/api/tracks/${id}`, headers: h })).json();
  const all = await app.inject({ method: 'GET', url: `/api/artists/${t.artist.id}/tracks`, headers: h });
  assert.equal(all.statusCode, 200, all.body);
  assert.ok(all.json().some((x: any) => x.id === id));
  assert.equal((await app.inject({ method: 'GET', url: '/api/artists/nope/tracks', headers: h })).statusCode, 404);
});

test('listen together: start, join, ops and long-poll', async () => {
  const h = { authorization: `Bearer ${access}` };
  const hp = { authorization: `Bearer ${(await app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'petya', password: 'secret1' } })).json().accessToken}` };
  const j = (await app.inject({ method: 'POST', url: '/api/jam', headers: h, payload: { trackIds: [trackId], playing: false } })).json();
  assert.equal(j.queue[0].id, trackId);
  assert.equal((await app.inject({ method: 'GET', url: `/api/jam/${j.id}`, headers: hp })).statusCode, 403);
  const joined = (await app.inject({ method: 'POST', url: `/api/jam/${j.id}/join`, headers: hp })).json();
  assert.equal(joined.members.length, 2);
  const wait = app.inject({ method: 'GET', url: `/api/jam/${j.id}?v=${joined.version}`, headers: h });
  await new Promise((r) => setTimeout(r, 20));
  const played = (await app.inject({ method: 'POST', url: `/api/jam/${j.id}/op`, headers: hp, payload: { op: 'play' } })).json();
  assert.equal(played.playing, true);
  const woke = (await wait).json();
  assert.equal(woke.playing, true, 'the waiting member learns about the change');
  assert.ok(woke.version > joined.version);
  const other = await uploadSong('Second');
  const added = (await app.inject({ method: 'POST', url: `/api/jam/${j.id}/op`, headers: h, payload: { op: 'add', trackIds: [trackId, other], next: true } })).json();
  assert.deepEqual(added.queue.map((t: any) => t.id), [trackId, other], 'what is queued already stays once');
  const skipped = (await app.inject({ method: 'POST', url: `/api/jam/${j.id}/op`, headers: hp, payload: { op: 'next' } })).json();
  assert.equal(skipped.index, 1);
  assert.equal((await app.inject({ method: 'GET', url: '/api/jams', headers: hp })).json().length, 1);
  await app.inject({ method: 'POST', url: '/api/jam/leave', headers: hp });
  await app.inject({ method: 'POST', url: '/api/jam/leave', headers: h });
  assert.equal((await app.inject({ method: 'GET', url: '/api/jam', headers: h })).json(), null);
});

test('co-owners, blend, radar, reports, follows, lyrics search and lists to move', async () => {
  const h = { authorization: `Bearer ${access}` };
  const hp = { authorization: `Bearer ${(await app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'petya', password: 'secret1' } })).json().accessToken}` };
  const petya = (await app.inject({ method: 'GET', url: '/api/users', headers: h })).json().find((u: any) => u.username === 'petya');
  const song = await uploadSong('Owners Song');

  // a co-owner renames the playlist and invites others; only the creator deletes it
  const pl = (await app.inject({ method: 'POST', url: '/api/playlists', headers: h, payload: { title: 'Наш' } })).json();
  await app.inject({ method: 'POST', url: `/api/playlists/${pl.id}/members`, headers: h, payload: { userId: petya.id } });
  const renamed = await app.inject({ method: 'PATCH', url: `/api/playlists/${pl.id}`, headers: hp, payload: { title: 'Наш общий' } });
  assert.equal(renamed.statusCode, 200, renamed.body);
  assert.equal(renamed.json().title, 'Наш общий');
  assert.equal(renamed.json().isOwner, true);
  assert.equal(renamed.json().isCreator, false);
  assert.equal(renamed.json().owners.length, 2);
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/playlists/${pl.id}`, headers: hp })).statusCode, 403);

  // a blend of two people, filled from their tastes
  await app.inject({ method: 'PUT', url: `/api/me/likes/track/${song}`, headers: hp });
  const blend = await app.inject({ method: 'POST', url: '/api/playlists/blend', headers: h, payload: { userIds: [petya.id] } });
  assert.equal(blend.statusCode, 200, blend.body);
  assert.equal(blend.json().autoKind, 'blend');
  assert.ok(blend.json().tracks.some((t: any) => t.id === song), 'a liked song of an owner is in the blend');
  assert.equal((await app.inject({ method: 'POST', url: `/api/playlists/${blend.json().id}/refresh`, headers: hp })).statusCode, 200);
  const radar = await app.inject({ method: 'GET', url: '/api/me/radar', headers: h });
  assert.equal(radar.json().autoKind, 'radar');

  // a report reaches the admin, who closes it
  assert.equal((await app.inject({ method: 'POST', url: `/api/tracks/${song}/report`, headers: hp, payload: { reason: 'quality', note: 'хрипит' } })).statusCode, 200);
  const reports = (await app.inject({ method: 'GET', url: '/api/admin/reports', headers: h })).json();
  assert.equal(reports[0].track.id, song);
  assert.equal(reports[0].reason, 'quality');
  assert.equal((await app.inject({ method: 'GET', url: '/api/admin/reports', headers: hp })).statusCode, 403);
  await app.inject({ method: 'POST', url: `/api/admin/reports/${reports[0].id}/dismiss`, headers: h });
  assert.equal((await app.inject({ method: 'GET', url: '/api/admin/reports', headers: h })).json().length, 0);

  // following a catalogue artist
  assert.equal((await app.inject({ method: 'PUT', url: '/api/catalog/artists/27/follow', headers: h, payload: { name: 'Daft Punk' } })).json().following, true);
  assert.equal((await app.inject({ method: 'GET', url: '/api/me/follows', headers: h })).json()[0].id, 27);
  await app.inject({ method: 'DELETE', url: '/api/catalog/artists/27/follow', headers: h });
  assert.equal((await app.inject({ method: 'GET', url: '/api/me/follows', headers: h })).json().length, 0);

  // a like on a song still being fetched waits for it
  const pending = await app.inject({ method: 'PUT', url: '/api/me/likes/track/dz:777', headers: h });
  assert.equal(pending.json().pending, true);
  app.db.prepare('UPDATE tracks SET deezer_id = 777 WHERE id = ?').run(song);
  const { applyPendingLikes } = await import('../src/services/acquire.js');
  applyPendingLikes(app.db, 777, song);
  assert.ok((await app.inject({ method: 'GET', url: '/api/me/likes/ids', headers: h })).json().track.includes(song));

  // found by a line of its lyrics
  app.db.prepare('UPDATE tracks SET lyrics_plain = ? WHERE id = ?').run('Первая строка\nМы идём по ночному городу\nКонец', song);
  const byLine = (await app.inject({ method: 'GET', url: `/api/search?q=${encodeURIComponent('ночному городу')}&type=lyrics`, headers: h })).json();
  assert.equal(byLine.lyrics[0].track.id, song);
  assert.equal(byLine.lyrics[0].line, 'Мы идём по ночному городу');

  // lists to move: plain lines and a CSV export
  const { parseList } = await import('../src/services/transfer.js');
  assert.deepEqual(parseList('1. Daft Punk — One More Time\nMuse - Uprising').map((t) => t.title), ['One More Time', 'Uprising']);
  const csv = parseList('"Track Name","Artist Name(s)","ISRC","Duration (ms)"\n"Get Lucky","Daft Punk, Pharrell Williams","USQX91300108","369626"');
  assert.equal(csv[0].artist, 'Daft Punk');
  assert.equal(csv[0].isrc, 'USQX91300108');
  assert.equal(csv[0].durationSec, 370);

  // a library the app read from Yandex Music becomes one transfer job
  const empty = await app.inject({ method: 'POST', url: '/api/transfer/import', headers: h, payload: { source: 'yandex' } });
  assert.equal(empty.statusCode, 400);
  const moved = await app.inject({ method: 'POST', url: '/api/transfer/import', headers: h, payload: {
    source: 'yandex', liked: [{ title: 'Uprising', artist: 'Muse', durationSec: 304 }],
    playlists: [{ title: 'В дорогу', tracks: [{ title: 'One More Time', artist: 'Daft Punk' }] }, { title: 'Пустой', tracks: [] }],
    artists: ['Muse'], albums: [{ title: 'Discovery', artist: 'Daft Punk' }],
  } });
  assert.equal(moved.statusCode, 200, moved.body);
  assert.deepEqual({ ...moved.json(), jobId: undefined }, { jobId: undefined, liked: 1, playlists: 1, artists: 1, albums: 1 });
});

test('downloads spread over the exits; a silent exit hands its download over', async () => {
  const { config } = await import('../src/config.js');
  const { downloadSlots, withAccount } = await import('../src/services/youtubeAccounts.js');
  const before = config.downloadProxies;
  config.downloadProxies = ['http://127.0.0.1:9#Польша'];
  try {
    const base = downloadSlots();
    assert.ok(base >= 4, `two exits double the slots (${base})`);
    // both exits get used when several downloads run at once
    const seen: Array<string | null> = [];
    await Promise.all([1, 2, 3, 4].map(() => withAccount(async (a) => { seen.push(a.proxy); await new Promise((r) => setTimeout(r, 30)); })));
    assert.ok(seen.includes(null) && seen.includes('http://127.0.0.1:9'), JSON.stringify(seen));
    // the other server is down: the download goes through this one, the exit rests
    const log: string[] = [];
    const got = await Promise.all([1, 2, 3].map(() => withAccount(async (a) => {
      await new Promise((r) => setTimeout(r, 10));
      if (a.proxy) throw new Error('yt-dlp: Unable to connect to proxy');
      return 'ok';
    }, { log: (s) => log.push(s) })));
    assert.deepEqual(got, ['ok', 'ok', 'ok']);
    assert.ok(log.some((l) => l.includes('«Польша» не отвечает')), log.join('\n'));
    const later: Array<string | null> = [];
    await Promise.all([1, 2].map(() => withAccount(async (a) => { later.push(a.proxy); })));
    assert.ok(later.every((p) => p === null), 'a resting exit is skipped');
    assert.equal(downloadSlots(), base / 2);
  } finally {
    config.downloadProxies = before;
  }
});

test('daily mixes, smart playlists, the week chart, the digest and the home sections', async () => {
  const h = { authorization: `Bearer ${access}` };
  const ids = [await uploadSong('Avalanche'), await uploadSong('Breakwater Song'), await uploadSong('Cinder'), await uploadSong('Daylight Pop Tune')];
  const me = (await app.inject({ method: 'GET', url: '/api/auth/me', headers: h })).json().id;
  app.db.prepare("UPDATE tracks SET genre = 'Rock' WHERE id IN (?,?,?)").run(ids[0], ids[1], ids[2]);
  app.db.prepare("UPDATE tracks SET genre = 'Pop' WHERE id = ?").run(ids[3]);
  const play = app.db.prepare('INSERT INTO plays (user_id, track_id, ms_played) VALUES (?,?,60000)');
  for (let i = 0; i < 6; i++) play.run(me, ids[i < 4 ? 0 : 1]);

  // a daily mix for the genre played most, with what was played in it
  const mixes = (await app.inject({ method: 'GET', url: '/api/me/mixes?fresh=1', headers: h })).json();
  const rock = mixes.find((m: any) => m.title.includes('Rock'));
  assert.ok(rock, JSON.stringify(mixes.map((m: any) => m.title)));
  assert.equal(rock.autoKind, 'mix');
  const inMix = (await app.inject({ method: 'GET', url: `/api/playlists/${rock.id}`, headers: h })).json().tracks.map((t: any) => t.id);
  assert.ok(inMix.includes(ids[0]) && inMix.includes(ids[2]), 'favourites and an unheard one');
  // mixes stay off the library list
  const mine = (await app.inject({ method: 'GET', url: '/api/playlists', headers: h })).json();
  assert.ok(!mine.some((p: any) => p.autoKind === 'mix'));

  // a smart playlist follows its rules
  const smart = (await app.inject({ method: 'POST', url: '/api/playlists/smart', headers: h, payload: { title: 'Рок', rules: { genres: ['Rock'], sort: 'recent', limit: 10 } } })).json();
  assert.equal(smart.autoKind, 'smart');
  assert.deepEqual(smart.autoRules.genres, ['Rock']);
  assert.deepEqual(new Set(smart.tracks.map((t: any) => t.id)), new Set([ids[0], ids[1], ids[2]]));
  const never = (await app.inject({ method: 'PUT', url: `/api/playlists/${smart.id}/rules`, headers: h, payload: { rules: { genres: ['Rock'], minPlays: 4 } } })).json();
  assert.deepEqual(never.tracks.map((t: any) => t.id), [ids[0]]);

  // the company's week and the home screen
  const chart = (await app.inject({ method: 'GET', url: '/api/charts/week', headers: h })).json();
  assert.equal(chart.tracks[0].track.id, ids[0]);
  assert.equal(chart.people[0].user.id, me);
  const { homeFeed } = await import('../src/services/home.js');
  const home = homeFeed(app.db, me); // the route caches the feed for a while
  assert.ok(home.sections.some((s: any) => s.id === 'mixes'), home.sections.map((s: any) => s.id).join(','));

  // the Sunday digest lands in the inbox with the songs resolved
  const { sendDigest } = await import('../src/services/digest.js');
  assert.ok(sendDigest(app.db, '2026-10-11') >= 1);
  const inbox = (await app.inject({ method: 'GET', url: '/api/shares', headers: h })).json();
  const digest = inbox.find((s: any) => s.kind === 'digest');
  assert.equal(digest.from, null);
  assert.equal(digest.message, 'digest');
  assert.equal(digest.item.myTop.id, ids[0]);
  assert.ok(digest.item.minutes >= 4);
});
