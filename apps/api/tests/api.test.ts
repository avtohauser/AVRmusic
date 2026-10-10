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

  // VK Music: pages saved from the browser — the full site, its newer rows, the mobile site, a plain list
  const { parseVkPage } = await import('../src/services/transfer.js');
  const full = parseVkPage('<html><head><title>Музыка | ВКонтакте</title></head><body>'
    + '<div class="audio_row" data-audio="[1,2,&quot;&quot;,&quot;Get Lucky&quot;,&quot;Daft Punk&quot;,369]"></div>'
    + '<div class="audio_row" data-audio="[3,2,&quot;&quot;,&quot;Rock &amp;amp; Roll&quot;,&quot;Led Zeppelin&quot;,220]"></div>'
    + '<div class="audio_row" data-audio="[1,2,&quot;&quot;,&quot;Get Lucky&quot;,&quot;Daft Punk&quot;,369]"></div></body></html>');
  assert.equal(full.mine, true);
  assert.deepEqual(full.tracks.map((t) => `${t.artist} — ${t.title} · ${t.durationSec}`), ['Daft Punk — Get Lucky · 369', 'Led Zeppelin — Rock & Roll · 220']);
  const rows = parseVkPage('<html><title>Дорога домой | ВКонтакте</title><div class="audio_row _audio_row"><div class="audio_row__performers"><a>Muse</a></div>'
    + '<div class="audio_row__title"><span class="audio_row__title_inner">Uprising</span></div><div class="audio_row__duration">5:04</div></div></html>');
  assert.equal(rows.mine, false);
  assert.equal(rows.title, 'Дорога домой');
  assert.deepEqual(rows.tracks[0], { artist: 'Muse', title: 'Uprising', durationSec: 304 });
  const mobile = parseVkPage('<html><title>Аудиозаписи</title><div class="ai_info"><span class="ai_title">Numb</span><span class="ai_artist">Linkin Park</span><div class="ai_dur" data-dur="185"></div></div></html>');
  assert.equal(mobile.mine, true);
  assert.equal(mobile.tracks[0].artist, 'Linkin Park');
  assert.equal(parseVkPage('Muse — Uprising', 'В машину.txt').title, 'В машину');
  assert.equal(parseVkPage('<html><title>Аудиозаписи Ивана | ВКонтакте</title><div data-audio="[1,2,&quot;&quot;,&quot;Numb&quot;,&quot;Linkin Park&quot;,185]"></div></html>').mine, true);
  assert.equal(parseVkPage('<html><title>Музыка для бега | ВКонтакте</title><div data-audio="[1,2,&quot;&quot;,&quot;Numb&quot;,&quot;Linkin Park&quot;,185]"></div></html>').mine, false);
  const vkEmpty = await app.inject({ method: 'POST', url: '/api/transfer/vk', headers: h, payload: { pages: [{ name: 'a.html', content: '<html><body><div>ничего</div></body></html>' }] } });
  assert.equal(vkEmpty.statusCode, 400);
  const vk = await app.inject({ method: 'POST', url: '/api/transfer/vk', headers: h, payload: { pages: [
    { name: 'music.html', content: '<html><title>Музыка | ВКонтакте</title><div data-audio="[1,2,&quot;&quot;,&quot;Uprising&quot;,&quot;Muse&quot;,304]"></div></html>' },
    { name: 'road.html', content: '<html><title>Дорога | ВКонтакте</title><div data-audio="[1,2,&quot;&quot;,&quot;One More Time&quot;,&quot;Daft Punk&quot;,320]"></div></html>' },
  ] } });
  assert.equal(vk.statusCode, 200, vk.body);
  assert.equal(vk.json().liked, 1);
  assert.deepEqual(vk.json().playlists, [{ title: 'Дорога', tracks: 1 }]);

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
  assert.ok(inMix.includes(ids[0]) && inMix.includes(ids[2]), 'favourites and random ones of the genre');
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

test('listen together votes, guess the melody, and devices controlling each other', async () => {
  const h = { authorization: `Bearer ${access}` };
  const hp = { authorization: `Bearer ${(await app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'petya', password: 'secret1' } })).json().accessToken}` };
  const songs = [await uploadSong('Eclipse'), await uploadSong('Firefly Night'), await uploadSong('Glacier'), await uploadSong('Harbor Lights Song')];

  // suggestions: the one with most votes waits right after the current song
  const jam = (await app.inject({ method: 'POST', url: '/api/jam', headers: h, payload: { trackIds: [songs[0], songs[1]], index: 0 } })).json();
  await app.inject({ method: 'POST', url: `/api/jam/${jam.id}/join`, headers: hp });
  const op = async (hh: any, payload: any) => (await app.inject({ method: 'POST', url: `/api/jam/${jam.id}/op`, headers: hh, payload })).json();
  let v = await op(h, { op: 'suggest', trackIds: [songs[2]] });
  assert.equal(v.queue[1].id, songs[2]);
  assert.equal(v.suggestions[0].next, true);
  v = await op(hp, { op: 'suggest', trackIds: [songs[3]] });
  assert.equal(v.queue[1].id, songs[2], 'equal votes: the earlier one');
  v = await op(h, { op: 'vote', trackId: songs[3], up: true });
  assert.deepEqual(v.queue.map((t: any) => t.id), [songs[0], songs[3], songs[1]]);
  assert.equal(v.suggestions[0].votes, 2);
  assert.equal(v.suggestions[0].voted, true);
  v = await op(hp, { op: 'next' });
  assert.equal(v.queue[v.index].id, songs[3]);
  assert.equal(v.queue[v.index + 1].id, songs[2]);
  assert.equal(v.suggestions.length, 1);
  await app.inject({ method: 'POST', url: '/api/jam/leave', headers: h });
  await app.inject({ method: 'POST', url: '/api/jam/leave', headers: hp });

  // guess the melody: a round, answers, the reveal, the end
  app.db.prepare(`UPDATE tracks SET duration_ms = 120000 WHERE id IN (${songs.map(() => '?').join(',')})`).run(...songs);
  const { getGame } = await import('../src/services/game.js');
  let g = (await app.inject({ method: 'POST', url: '/api/games', headers: h, payload: { source: 'library', rounds: 3 } })).json();
  assert.equal(g.state, 'lobby');
  await app.inject({ method: 'POST', url: `/api/games/${g.id}/join`, headers: hp });
  assert.equal((await app.inject({ method: 'POST', url: `/api/games/${g.id}/next`, headers: hp })).statusCode, 403);
  g = (await app.inject({ method: 'POST', url: `/api/games/${g.id}/next`, headers: h })).json();
  assert.equal(g.state, 'round');
  assert.equal(g.round, 1);
  assert.equal(g.options.length, 4);
  assert.ok(!JSON.stringify(g.options).includes(getGame(g.id)!.current!.trackId), 'the song stays hidden');
  const clip = await app.inject({ method: 'GET', url: g.clipUrl, headers: hp });
  assert.equal(clip.statusCode, 200);
  const right = getGame(g.id)!.current!.correct;
  g = (await app.inject({ method: 'POST', url: `/api/games/${g.id}/answer`, headers: h, payload: { n: right } })).json();
  assert.equal(g.state, 'round');
  assert.equal(g.myChoice, right);
  g = (await app.inject({ method: 'POST', url: `/api/games/${g.id}/answer`, headers: hp, payload: { n: (right + 1) % 4 } })).json();
  assert.equal(g.state, 'reveal');
  assert.equal(g.answer.n, right);
  const top = g.players[0];
  assert.ok(top.correct && top.points >= 100 && top.score === top.points);
  assert.equal(g.players[1].points, 0);
  for (let i = 0; i < 2; i++) {
    g = (await app.inject({ method: 'POST', url: `/api/games/${g.id}/next`, headers: hp })).json();
    assert.equal(g.round, i + 2);
    await app.inject({ method: 'POST', url: `/api/games/${g.id}/answer`, headers: h, payload: { n: 0 } });
    g = (await app.inject({ method: 'POST', url: `/api/games/${g.id}/answer`, headers: hp, payload: { n: 0 } })).json();
  }
  assert.equal(g.state, 'done');
  assert.equal(g.played.length, 3);
  assert.equal(new Set(g.played.map((t: any) => t.id)).size, 3);
  await app.inject({ method: 'POST', url: `/api/games/${g.id}/leave`, headers: h });
  await app.inject({ method: 'POST', url: `/api/games/${g.id}/leave`, headers: hp });

  // devices: the site pauses the phone, then hands its music over to it
  const beat = (payload: any) => app.inject({ method: 'POST', url: '/api/me/devices/heartbeat', headers: h, payload });
  await beat({ id: 'phone-1', name: 'Pixel', kind: 'android', trackId: songs[0], positionMs: 1000, playing: true, queue: [songs[0], songs[1]], index: 0 });
  const list = (await beat({ id: 'web-1', name: 'Chrome', kind: 'web', playing: false })).json();
  assert.deepEqual(list.map((d: any) => d.id), ['phone-1', 'web-1']);
  assert.equal(list[0].track.id, songs[0]);
  assert.equal(list[1].current, true);
  const waiting = app.inject({ method: 'GET', url: '/api/me/devices/phone-1/commands?after=0', headers: h });
  await new Promise((r) => setTimeout(r, 50));
  const after = (await app.inject({ method: 'POST', url: '/api/me/devices/phone-1/command?from=web-1', headers: h, payload: { type: 'pause' } })).json();
  assert.equal(after.find((d: any) => d.id === 'phone-1').playing, false);
  const got = (await waiting).json();
  assert.equal(got.commands[0].type, 'pause');
  assert.equal(got.commands[0].from, 'web-1');
  const q = (await app.inject({ method: 'GET', url: '/api/me/devices/phone-1/queue', headers: h })).json();
  assert.deepEqual(q.tracks.map((t: any) => t.id), [songs[0], songs[1]]);
  await app.inject({ method: 'POST', url: '/api/me/devices/phone-1/command', headers: h, payload: { type: 'transfer', trackIds: [songs[2]], index: 0, positionMs: 5000 } });
  const next = (await app.inject({ method: 'GET', url: `/api/me/devices/phone-1/commands?after=${got.seq}`, headers: h })).json();
  assert.equal(next.commands.length, 1);
  assert.equal(next.commands[0].type, 'transfer');
  assert.deepEqual(next.commands[0].trackIds, [songs[2]]);
  assert.equal((await app.inject({ method: 'POST', url: '/api/me/devices/nope/command', headers: h, payload: { type: 'play' } })).statusCode, 404);
});

test('integrations: Telegram and Last.fm settings, concerts matching, scrobble rule, backups', async () => {
  const h = { authorization: `Bearer ${access}` };
  const integ = (await app.inject({ method: 'GET', url: '/api/me/integrations', headers: h })).json();
  assert.deepEqual(integ, { telegram: { available: false, bot: null, linked: null }, lastfm: { available: false, linked: null }, tgProfile: { available: false, linked: null }, city: null });
  // what plays, in the Telegram profile: needs the admin's API app first; the session is kept encrypted
  assert.equal((await app.inject({ method: 'POST', url: '/api/me/tg-profile/start', headers: h, payload: { phone: '+79001234567' } })).statusCode, 400);
  assert.equal((await app.inject({ method: 'PUT', url: '/api/admin/tg-app', headers: h, payload: { apiId: 123 } })).statusCode, 400);
  assert.equal((await app.inject({ method: 'PUT', url: '/api/admin/tg-app', headers: h, payload: { apiId: 123, apiHash: 'c'.repeat(32) } })).statusCode, 200);
  assert.deepEqual((await app.inject({ method: 'GET', url: '/api/admin/tg-app', headers: h })).json(), { apiId: 123, hasHash: true });
  assert.equal((await app.inject({ method: 'GET', url: '/api/me/integrations', headers: h })).json().tgProfile.available, true);
  const { aboutLine, seal, unseal } = await import('../src/services/tgProfile.js');
  assert.equal(aboutLine('Kai Angel', 'Shh!'), '🎧 Kai Angel — Shh!');
  assert.ok(aboutLine('A'.repeat(50), 'B'.repeat(50)).length <= 70);
  assert.ok(aboutLine('A'.repeat(50), 'B'.repeat(50)).endsWith('…'));
  const sealed = seal('session-string');
  assert.ok(!sealed.includes('session-string'));
  assert.equal(unseal(sealed), 'session-string');
  assert.equal((await app.inject({ method: 'PUT', url: '/api/admin/telegram', headers: h, payload: { token: 'not a token' } })).statusCode, 400);
  assert.equal((await app.inject({ method: 'POST', url: '/api/me/telegram/link', headers: h })).statusCode, 400);

  // the Last.fm app: the secret never comes back
  const key = 'a'.repeat(32), secret = 'b'.repeat(32);
  assert.equal((await app.inject({ method: 'PUT', url: '/api/admin/lastfm', headers: h, payload: { key } })).statusCode, 400);
  assert.equal((await app.inject({ method: 'PUT', url: '/api/admin/lastfm', headers: h, payload: { key, secret } })).statusCode, 200);
  const lf = (await app.inject({ method: 'GET', url: '/api/admin/lastfm', headers: h })).json();
  assert.deepEqual(lf, { key, hasSecret: true });
  const start = (await app.inject({ method: 'GET', url: '/api/me/lastfm/start', headers: h })).json();
  assert.ok(start.url.startsWith(`https://www.last.fm/api/auth/?api_key=${key}&cb=`));
  const { lastfmSign, scrobbleWorthy } = await import('../src/services/lastfm.js');
  // md5("api_keyxxmethodauth.getSessiontokenyy" + "secret")
  assert.equal(lastfmSign({ method: 'auth.getSession', api_key: 'xx', token: 'yy', format: 'json' }, 'secret'), '081c07c21ad2eb3a8d8ad31252a5fa8e');
  assert.equal(scrobbleWorthy(200_000, 100_000), true);
  assert.equal(scrobbleWorthy(200_000, 60_000), false);
  assert.equal(scrobbleWorthy(600_000, 240_000), true);
  assert.equal(scrobbleWorthy(20_000, 20_000), false);

  // concerts: the artist named as a whole word
  const { namesArtist } = await import('../src/services/concerts.js');
  assert.equal(namesArtist('Земфира. Большой концерт', 'Земфира'), true);
  assert.equal(namesArtist('«Би-2» в «Крокусе»', 'Би-2'), true);
  assert.equal(namesArtist('Кинотеатр под открытым небом', 'Кино'), false);
  assert.equal(namesArtist('Oxxxymiron', 'Ox'), false);
  assert.equal((await app.inject({ method: 'PUT', url: '/api/me/city', headers: h, payload: { city: 'Moscow!' } })).statusCode, 400);
  assert.deepEqual((await app.inject({ method: 'GET', url: '/api/me/concerts', headers: h })).json(), { city: null, checkedAt: null, concerts: [] });

  // a copy of the database next to the music
  const b = await app.inject({ method: 'POST', url: '/api/admin/backups', headers: h });
  assert.equal(b.statusCode, 200, b.body);
  assert.match(b.json().name, /^avrmusic-\d{4}-\d{2}-\d{2}\.sqlite\.gz$/);
  assert.ok(b.json().size > 100);
  const list = (await app.inject({ method: 'GET', url: '/api/admin/backups', headers: h })).json();
  assert.equal(list.files[0].name, b.json().name);
  assert.ok(list.last);
});

test('badges, the servers panel, spare YouTube accounts from friends, loved artists fetched by themselves', async () => {
  const h = { authorization: `Bearer ${access}` };
  const hp = { authorization: `Bearer ${(await app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'petya', password: 'secret1' } })).json().accessToken}` };
  const petya = (await app.inject({ method: 'GET', url: '/api/auth/me', headers: hp })).json().id;

  // a badge made and given by the admin: on the profile, in the inbox; only the admin can make them
  assert.equal((await app.inject({ method: 'POST', url: '/api/admin/badges', headers: hp, payload: { title: 'x', emoji: '🐞' } })).statusCode, 403);
  const b = (await app.inject({ method: 'POST', url: '/api/admin/badges', headers: h, payload: { title: 'Баг-хантер', emoji: '🐞', color: '#22aa66', description: 'Нашёл баг' } })).json();
  assert.equal(b.title, 'Баг-хантер');
  assert.deepEqual((await app.inject({ method: 'POST', url: `/api/admin/badges/${b.id}/give`, headers: h, payload: { userIds: [petya] } })).json(), { given: 1 });
  assert.deepEqual((await app.inject({ method: 'POST', url: `/api/admin/badges/${b.id}/give`, headers: h, payload: { userIds: [petya] } })).json(), { given: 0 });
  const page = (await app.inject({ method: 'GET', url: `/api/users/${petya}`, headers: h })).json();
  assert.equal(page.badges[0].emoji, '🐞');
  const inbox = (await app.inject({ method: 'GET', url: '/api/shares', headers: hp })).json();
  assert.equal(inbox.find((s: any) => s.kind === 'badge').item.title, 'Баг-хантер');
  assert.equal((await app.inject({ method: 'GET', url: '/api/badges', headers: hp })).json()[0].holders, 1);
  await app.inject({ method: 'DELETE', url: `/api/admin/badges/${b.id}/give/${petya}`, headers: h });
  assert.deepEqual((await app.inject({ method: 'GET', url: '/api/me/badges', headers: hp })).json(), []);

  // the servers panel
  const s = (await app.inject({ method: 'GET', url: '/api/admin/server', headers: h })).json();
  assert.ok(s.disks.length >= 1 && s.disks[0].total > 0);
  assert.ok(s.cpu.cores >= 1 && s.memory.total > 0);
  assert.equal(typeof s.people.online, 'number');
  assert.equal((await app.inject({ method: 'GET', url: '/api/admin/server', headers: hp })).statusCode, 403);

  // a friend gives a spare YouTube account: theirs to see and take back, the admin sees who gave it
  const cookies = '# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t1999999999\tSAPISID\tabc\n.youtube.com\tTRUE\t/\tTRUE\t1999999999\tLOGIN_INFO\tdef\n';
  const boundary = '----avrck';
  const body = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="cookies.txt"\r\nContent-Type: text/plain\r\n\r\n${cookies}\r\n--${boundary}--\r\n`);
  const mine = (await app.inject({ method: 'POST', url: '/api/me/youtube-accounts', headers: { ...hp, 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: body })).json();
  assert.equal(mine.accounts.length, 1);
  assert.equal(mine.accounts[0].loggedIn, true);
  const all = (await app.inject({ method: 'GET', url: '/api/admin/youtube-accounts', headers: h })).json();
  assert.equal(all.find((a: any) => a.id === mine.accounts[0].id).ownerName, 'petya');
  assert.deepEqual((await app.inject({ method: 'GET', url: '/api/me/youtube-accounts', headers: h })).json().accounts, []);
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/me/youtube-accounts/${mine.accounts[0].id}`, headers: h })).statusCode, 404);
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/me/youtube-accounts/${mine.accounts[0].id}`, headers: hp })).json().accounts.length, 0);

  // loved artists: liked ones (with a catalogue id) come first; the switch turns it off
  const someArtist = app.db.prepare('SELECT id, name FROM artists LIMIT 1').get() as any;
  app.db.prepare('UPDATE artists SET deezer_id = 4242 WHERE id = ?').run(someArtist.id);
  app.db.prepare("INSERT OR IGNORE INTO likes (user_id, entity_type, entity_id) VALUES (?, 'artist', ?)").run(petya, someArtist.id);
  const { lovedArtists } = await import('../src/services/autofetch.js');
  assert.equal(lovedArtists(app.db)[0].deezerId, 4242);
  assert.equal((await app.inject({ method: 'GET', url: '/api/admin/autofetch', headers: h })).json().next[0], someArtist.name);
  assert.equal((await app.inject({ method: 'PUT', url: '/api/admin/autofetch', headers: h, payload: { on: false } })).json().on, false);
});

test('listening along with a friend, album completeness, originals over edited versions', async () => {
  const h = { authorization: `Bearer ${access}` };
  const hp = { authorization: `Bearer ${(await app.inject({ method: 'POST', url: '/api/auth/login', payload: { login: 'petya', password: 'secret1' } })).json().accessToken}` };
  const petya = (await app.inject({ method: 'GET', url: '/api/auth/me', headers: hp })).json().id;
  const [a, b] = (app.db.prepare('SELECT id FROM tracks LIMIT 2').all() as any[]).map((r) => r.id);

  // the friend plays a song; a long poll answers as soon as they switch to another one
  await app.inject({ method: 'POST', url: '/api/me/now', headers: hp, payload: { trackId: a, positionMs: 1000, playing: true } });
  const first = (await app.inject({ method: 'GET', url: `/api/users/${petya}/now`, headers: h })).json();
  assert.equal(first.now.track.id, a);
  const waiting = app.inject({ method: 'GET', url: `/api/users/${petya}/now?v=${first.version}`, headers: h });
  await new Promise((r) => setTimeout(r, 50));
  // the same song a few seconds on is no change; another song is
  await app.inject({ method: 'POST', url: '/api/me/now', headers: hp, payload: { trackId: a, positionMs: 1050, playing: true } });
  await app.inject({ method: 'POST', url: '/api/me/now', headers: hp, payload: { trackId: b, positionMs: 0, playing: true } });
  const next = (await waiting).json();
  assert.equal(next.now.track.id, b);
  assert.ok(next.version > first.version);

  // an album without a catalogue link can't be checked; one with it lists what is missing
  const artistId = (app.db.prepare('SELECT id FROM artists LIMIT 1').get() as any).id;
  app.db.prepare("INSERT INTO albums (id, artist_id, title, title_key) VALUES ('alb-check', ?, 'Check', 'check-album')").run(artistId);
  const album = { id: 'alb-check' };
  assert.equal((await app.inject({ method: 'GET', url: `/api/albums/${album.id}/completeness`, headers: h })).json().checkable, false);

  // edited versions: the original wins when both are there
  const { preferOriginal } = await import('../src/services/catalog.js');
  const list = [
    { title: 'Опиум для никого', explicit: false, type: 'single', releaseDate: '2026-03-10', artist: { name: 'Агата Кристи' } },
    { title: 'Опиум для никого', explicit: true, type: 'single', releaseDate: '1995-01-01', artist: { name: 'Агата Кристи' } },
    { title: 'Intro', explicit: false, type: 'single', releaseDate: '2020-01-01', artist: { name: 'X' } },
    { title: 'Intro', explicit: false, type: 'single', releaseDate: '2021-01-01', artist: { name: 'X' } },
  ];
  const kept = preferOriginal(list);
  assert.equal(kept.filter((x) => x.title === 'Опиум для никого').length, 1);
  assert.equal(kept.find((x) => x.title === 'Опиум для никого')!.explicit, true);
  assert.equal(kept.filter((x) => x.title === 'Intro').length, 2, 'two real releases of one name both stay');
  const { scoreCandidate } = await import('../src/services/acquire.js');
  const want = { title: 'Song', artist: 'Band', durationSec: 200, year: 2019 };
  const orig = scoreCandidate({ title: 'Band - Song', duration: 200, channel: 'Band - Topic', source: 'youtube' }, want);
  const clean = scoreCandidate({ title: 'Band - Song (Clean)', duration: 200, channel: 'Band - Topic', source: 'youtube' }, want);
  const rereleased = scoreCandidate({ title: 'Band - Song', duration: 200, channel: 'Band - Topic', source: 'youtube', description: 'Provided to YouTube by X\n\nSong · Band\n\nSong\n\nReleased on: 2026-04-01' }, want);
  assert.ok(orig > clean, `${orig} > ${clean}`);
  assert.ok(orig > rereleased, `${orig} > ${rereleased}`);
});
