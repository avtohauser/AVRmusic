// Concerts of the artists a listener loves, in their city (from KudaGo's public listings): once a week the
// city's upcoming concerts are read in one go and matched against everyone's artists there — followed,
// liked and most played. A new match lands in the inbox; the list is on the profile.
import type { DB } from '../lib/db.js';
import { newId } from '../lib/util.js';
import { getMeta, setMeta } from './meta.js';

const KUDAGO = 'https://kudago.com/public-api/v1.4';
const DAY = 24 * 3600_000;

export interface Concert {
  id: string;
  artist: string;
  title: string;
  startsAt: string;
  date: string;
  place: string | null;
  address: string | null;
  url: string | null;
  imageUrl: string | null;
}

/** KudaGo's cities (when it can't be asked: the biggest ones). */
const FALLBACK_CITIES = [
  ['msk', 'Москва'], ['spb', 'Санкт-Петербург'], ['nsk', 'Новосибирск'], ['ekb', 'Екатеринбург'], ['nnv', 'Нижний Новгород'],
  ['kzn', 'Казань'], ['smr', 'Самара'], ['krd', 'Краснодар'], ['sochi', 'Сочи'], ['ufa', 'Уфа'], ['krasnoyarsk', 'Красноярск'],
].map(([slug, name]) => ({ slug, name }));
let citiesCache: { at: number; list: Array<{ slug: string; name: string }> } | null = null;

async function get(url: string): Promise<any> {
  const r = await fetch(url, { headers: { 'user-agent': 'avr-music/1.0' }, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`KudaGo ответил ${r.status}`);
  return r.json();
}

export async function concertCities(): Promise<Array<{ slug: string; name: string }>> {
  if (citiesCache && Date.now() - citiesCache.at < DAY) return citiesCache.list;
  try {
    const list = ((await get(`${KUDAGO}/locations/?lang=ru&fields=slug,name`)) as any[])
      .filter((c) => c?.slug && c?.name && c.slug !== 'online' && c.slug !== 'interesting').map((c) => ({ slug: String(c.slug), name: String(c.name) }));
    if (list.length) citiesCache = { at: Date.now(), list };
  } catch { /* the fallback below */ }
  return citiesCache?.list ?? FALLBACK_CITIES;
}

/** Every upcoming concert of the city (a few hundred to a couple of thousand; paged by a hundred). */
async function cityConcerts(city: string): Promise<any[]> {
  const out: any[] = [];
  let url: string | null = `${KUDAGO}/events/?lang=ru&location=${encodeURIComponent(city)}&categories=concert&actual_since=${Math.floor(Date.now() / 1000)}`
    + '&fields=id,title,short_title,dates,place,site_url,images&expand=place&page_size=100&text_format=text';
  for (let page = 0; url && page < 40; page++) {
    const j: any = await get(url);
    out.push(...(j?.results ?? []));
    url = j?.next ?? null;
    if (url) await new Promise((r) => setTimeout(r, 300));
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/[«»"'“”„]/g, '').replace(/\s+/g, ' ').trim();

/** Does the concert's title name the artist (as a whole word, not inside another one)? */
export function namesArtist(title: string, artist: string): boolean {
  const a = norm(artist);
  if (a.length < 3) return false;
  const t = norm(title);
  const at = t.indexOf(a);
  if (at < 0) return false;
  const edge = (c: string | undefined) => !c || !/[\p{L}\p{N}]/u.test(c);
  return edge(t[at - 1]) && edge(t[at + a.length]);
}

/** The artists a listener cares about: followed, liked, most played lately. */
function artistsOf(db: DB, userId: string): string[] {
  const names = [
    ...(db.prepare('SELECT name FROM artist_follows WHERE user_id = ? AND name <> \'\'').all(userId) as any[]).map((r) => r.name),
    ...(db.prepare(`SELECT a.name FROM likes l JOIN artists a ON a.id = l.entity_id WHERE l.user_id = ? AND l.entity_type = 'artist'`).all(userId) as any[]).map((r) => r.name),
    ...(db.prepare(`SELECT a.name, COUNT(*) n FROM plays p JOIN tracks t ON t.id = p.track_id JOIN artists a ON a.id = t.artist_id
      WHERE p.user_id = ? AND p.ms_played >= 30000 AND p.played_at > datetime('now','-180 days') GROUP BY a.id HAVING n >= 3 ORDER BY n DESC LIMIT 60`).all(userId) as any[]).map((r) => r.name),
  ];
  const seen = new Set<string>();
  return names.filter((n) => { const k = norm(String(n)); if (!k || seen.has(k)) return false; seen.add(k); return true; });
}

function toConcert(e: any, artist: string): Concert | null {
  const now = Date.now() / 1000;
  const start = ((e?.dates ?? []) as any[]).map((d) => Number(d?.start)).filter((s) => s > now && s < now + 400 * 86400).sort((a, b) => a - b)[0];
  if (!start) return null;
  const startsAt = new Date(start * 1000);
  return {
    id: String(e.id), artist, title: String(e.short_title || e.title || artist),
    startsAt: startsAt.toISOString(),
    date: startsAt.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }),
    place: e.place?.title ?? null, address: e.place?.address ?? null, url: e.site_url ?? null, imageUrl: e.images?.[0]?.image ?? null,
  };
}

/** Matches the city's concerts for everyone living there; new ones go to the inbox. */
export async function checkCity(db: DB, city: string): Promise<number> {
  const users = (db.prepare('SELECT id FROM users WHERE city = ? AND disabled = 0').all(city) as any[]).map((r) => r.id as string);
  if (!users.length) return 0;
  const events = await cityConcerts(city);
  const seen = db.prepare('INSERT OR IGNORE INTO concert_seen (user_id, event_id) VALUES (?,?)');
  const share = db.prepare('INSERT INTO shares (id, from_user, to_user, kind, ref_id, message) VALUES (?,?,?,?,?,?)');
  let fresh = 0;
  for (const u of users) {
    const artists = artistsOf(db, u);
    const list: Concert[] = [];
    for (const e of events) {
      const title = `${e.title ?? ''} ${e.short_title ?? ''}`;
      const artist = artists.find((a) => namesArtist(title, a));
      const c = artist ? toConcert(e, artist) : null;
      if (c && !list.some((x) => x.id === c.id)) list.push(c);
    }
    list.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    setMeta(db, `concerts.${u}`, JSON.stringify({ at: Date.now(), city, list }));
    for (const c of list) {
      if (seen.run(u, c.id).changes) { share.run(newId(), null, u, 'concert', c.id, JSON.stringify(c)); fresh++; }
    }
  }
  return fresh;
}

/** The listener's concerts as last checked (null: not checked for this city yet). */
export function concertsOf(db: DB, userId: string): { at: string; city: string; list: Concert[] } | null {
  const city = (db.prepare('SELECT city FROM users WHERE id = ?').get(userId) as any)?.city;
  if (!city) return null;
  try {
    const c = JSON.parse(getMeta(db, `concerts.${userId}`) ?? 'null');
    if (!c || c.city !== city) return null;
    return { at: new Date(c.at).toISOString(), city, list: (c.list as Concert[]).filter((x) => Date.parse(x.startsAt) > Date.now()) };
  } catch { return null; }
}

const checking = new Set<string>();

/** A city checked now (a new listener there, or a changed city), unless it is being checked already. */
export function checkCitySoon(db: DB, city: string) {
  if (checking.has(city)) return;
  checking.add(city);
  checkCity(db, city).then(() => setMeta(db, `concerts.city.${city}`, String(Date.now()))).catch(() => {}).finally(() => checking.delete(city));
}

/** Once a week each city with listeners in it. */
export function startConcerts(db: DB) {
  const tick = () => {
    const cities = (db.prepare('SELECT DISTINCT city FROM users WHERE city IS NOT NULL AND disabled = 0').all() as any[]).map((r) => r.city as string);
    for (const city of cities) {
      const at = Number(getMeta(db, `concerts.city.${city}`) ?? 0);
      if (Date.now() - at > 7 * DAY) checkCitySoon(db, city);
    }
  };
  setTimeout(tick, 15 * 60_000).unref();
  setInterval(tick, 6 * 3600_000).unref();
}
