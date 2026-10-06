// One-off: what Yandex Music answers from the server (signing in by code, anonymous profile reads).
const get = async (u, o) => { try { const r = await fetch(u, o); return [r.status, await r.text()]; } catch (e) { return [0, String(e)]; } };
const out = [];
let [s, t] = await get('https://oauth.yandex.ru/device/code', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'client_id=23cabbbdc6cd418abb4b39c32c41195d&device_name=AVRmusic' });
out.push(`device-code ${s} ${t.replace(/"user_code":"[^"]*"/, '"user_code":"…"').replace(/"device_code":"[^"]*"/, '"device_code":"…"').slice(0, 220)}`);
[s, t] = await get('https://api.music.yandex.net/landing3/chart');
let owner = null; try { const r = JSON.parse(t).result; owner = r?.chart?.owner?.login ?? r?.chart?.owner?.uid ?? null; } catch { /* */ }
out.push(`chart ${s} owner=${owner}`);
for (const p of [`/users/${owner}/playlists/list`, `/users/${owner}/playlists/3`, '/users/music-blog/playlists/list']) {
  [s, t] = await get('https://api.music.yandex.net' + p);
  out.push(`${p} ${s} ${t.slice(0, 160)}`);
}
console.log(out.map((l) => `::notice title=yandex probe::${l.replace(/[\r\n]+/g, ' ')}`).join('\n'));
