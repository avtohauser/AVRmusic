// Is an upload exactly the recording a catalogue track stands for?
//
// The catalogue knows every artist credited on a recording (main + featured). YouTube Music's own
// uploads ("Provided to YouTube by …") carry the same credits in their description:
//
//   Take Me to the Beach (feat. Ado) · Imagine Dragons · Ado
//   Take Me to the Beach (feat. Ado)            ← album / single
//
// so "Take Me to the Beach" by Imagine Dragons and "Take Me to the Beach (feat. Ado)" can be told apart
// exactly: the credited artists must be the same set — nobody missing (the solo version for the feat.
// one) and nobody extra (the feat. version, or another guest's version, for the solo one) — and the
// title must be the same song without words naming another version (live, remix, sped up …).
// Plain uploads (official videos, lyric videos) are judged by the artists their title names.
import { nameKey } from '../lib/util.js';
import { parseFeaturing } from './catalog.js';
import type { SourceCandidate, Want } from './sources/types.js';

export const norm = (s: string) => nameKey(s).replace(/\s+/g, ' ').trim();

/** Artist name for comparisons: no case, accents, punctuation, spaces, leading "the", "and"/"&". */
const artistKey = (s: string) => norm(s).replace(/^the /, '').replace(/ (and|и) /g, ' ').replace(/ /g, '');
export const sameArtist = (a: string, b: string) => { const x = artistKey(a), y = artistKey(b); return !!x && x === y; };
const nonLatin = (s: string) => /[^\p{Script=Latin}\p{N}\p{P}\p{Z}\p{S}]/u.test(s);
const uniqBy = (list: string[]) => list.filter((a, i) => a.trim() && list.findIndex((b) => sameArtist(a, b)) === i);

/** Credits of an upload: title, every credited artist, album; `structured` when read from YouTube Music's own metadata. */
export interface UploadCredits { title: string; artists: string[]; album: string | null; structured: boolean }

/** Parses the "Provided to YouTube by …" block that YouTube Music puts on official audio uploads. */
export function parseProvidedCredits(description?: string | null): UploadCredits | null {
  if (!description) return null;
  const lines = description.split(/\r?\n/).map((l) => l.trim());
  const i = lines.findIndex((l) => /^provided to youtube by\b/i.test(l));
  if (i < 0) return null;
  const rest = lines.slice(i + 1).filter(Boolean);
  const head = rest[0];
  if (!head || !head.includes(' · ')) return null;
  const [title, ...artists] = head.split(' · ').map((s) => s.trim()).filter(Boolean);
  if (!title || !artists.length) return null;
  const next = rest[1];
  const album = next && !/^(℗|©|\(c\)|\(p\)|released on|auto-generated|composer|producer|lyricist)/i.test(next) ? next : null;
  return { title, artists, album, structured: true };
}

/** Artists a plain upload's title names: "A x B - Song", "A & B - Song (feat. C)", "Song (feat. C)". */
export function titleCredits(title: string): UploadCredits {
  const m = /^(.+?)\s+[-–—|]\s+(.+)$/.exec(title);
  const left = m ? m[1] : '';
  const song = m ? m[2] : title;
  const artists = left ? left.split(/\s+(?:x|×|&|and|и|vs\.?|feat\.?|ft\.?|featuring|with)\s+|\s*,\s*/i).map((s) => s.trim()).filter(Boolean) : [];
  return { title: song, artists: [...artists, ...parseFeaturing(left).featuring], album: null, structured: false };
}

// words that make a title another recording of the song
const VERSION_WORDS = /\b(live|remix|rmx|mix|acoustic|unplugged|instrumental|karaoke|cover|sped|slowed|reverb|nightcore|8d|edit|extended|demo|session|sessions|reprise|orchestral|piano|acapella|cappella|mashup|bootleg|vip|rework|flip|ремикс|кавер|версия|минус|live)\b/;
// words that only describe the upload
const NOISE = /\b(official|music|video|audio|lyric|lyrics|visualizer|visualiser|hd|hq|4k|mv|clip|клип|премьера|topic|version|full|song|single)\b/g;

/** 'exact' same title, 'close' same song (upload noise aside), 'no' another song or another version of it. */
export function titleMatch(upload: string, want: string): 'exact' | 'close' | 'no' {
  const u = norm(parseFeaturing(upload).title);
  const w = norm(parseFeaturing(want).title);
  if (!u || !w) return 'no';
  if (u === w) return 'exact';
  const strip = (s: string) => s.replace(NOISE, ' ').replace(/\s+/g, ' ').trim();
  const us = strip(u), ws = strip(w);
  if (us && us === ws) return 'close';
  const [short, long] = us.length <= ws.length ? [us, ws] : [ws, us];
  if (short && ` ${long} `.includes(` ${short} `)) {
    const extra = ` ${long} `.replace(` ${short} `, ' ');
    if (!VERSION_WORDS.test(extra)) return 'close';
  }
  return 'no';
}

export interface Verdict { ok: boolean; exact: boolean; why: string }

/** Everyone credited on the wanted recording besides the main artist. */
export const wantedGuests = (w: Want) => uniqBy([...(w.featuring ?? []), ...(w.credits ?? [])]).filter((g) => !sameArtist(g, w.artist));

/** Is the whole name present as words in the text ("Ado" in "… · Ado", not in "Tornado")? */
const namedIn = (name: string, text: string) => { const n = norm(name); return !!n && ` ${norm(text)} `.includes(` ${n} `); };

/** The upload's credits for judging: YouTube Music metadata when known, the title otherwise. */
export function uploadCredits(c: Pick<SourceCandidate, 'title' | 'credits'>): UploadCredits {
  return c.credits ?? titleCredits(c.title);
}

export function judgeUpload(c: Pick<SourceCandidate, 'title' | 'channel' | 'uploader' | 'artist' | 'description' | 'credits'>, w: Want): Verdict {
  let cr = uploadCredits(c);
  let tm = titleMatch(cr.title, w.title);
  if (tm === 'no' && !cr.structured) {
    // "Song - Artist" instead of "Artist - Song"
    const m = /^(.+?)\s+[-–—|]\s+(.+)$/.exec(c.title);
    if (m && titleMatch(m[1], w.title) !== 'no') { cr = titleCredits(`${m[2]} - ${m[1]}`); tm = titleMatch(cr.title, w.title); }
  }
  if (tm === 'no') return { ok: false, exact: false, why: `другая песня или версия: «${cr.title}»` };
  const guests = wantedGuests(w);
  const credited = uniqBy([...cr.artists, ...parseFeaturing(cr.title).featuring]);
  let hasMain = credited.some((a) => sameArtist(a, w.artist));
  let missing = guests.filter((g) => !credited.some((a) => sameArtist(a, g)));
  let extras = credited.filter((a) => !sameArtist(a, w.artist) && !guests.some((g) => sameArtist(a, g)));
  // the same people written in another script (米津玄師 / Kenshi Yonezu) pair up one to one
  const unmatched = [...(hasMain ? [] : [w.artist]), ...missing];
  if (unmatched.length && unmatched.length === extras.length && [...unmatched, ...extras].some(nonLatin)) { hasMain = true; missing = []; extras = []; }

  if (cr.structured) {
    // YouTube Music lists every artist of the recording: the sets must be equal
    if (!hasMain) return { ok: false, exact: false, why: `другой исполнитель: ${credited.join(', ')}` };
    if (missing.length) return { ok: false, exact: false, why: `без ${missing.join(', ')} — это другая версия` };
    if (extras.length) return { ok: false, exact: false, why: `с ${extras.join(', ')} — это другая версия` };
    return { ok: true, exact: tm === 'exact', why: 'YouTube Music: то же название и те же исполнители' };
  }
  // a plain upload: a guest may be named in the channel or description instead of the title
  const hay = `${c.title} ${c.channel ?? ''} ${c.uploader ?? ''} ${c.artist ?? ''} ${c.description ?? ''}`;
  missing = missing.filter((g) => !namedIn(g, hay));
  if (missing.length) return { ok: false, exact: false, why: `без ${missing.join(', ')} — это другая версия` };
  if (extras.length) return { ok: false, exact: false, why: `с ${extras.join(', ')} — это другая версия` };
  return { ok: true, exact: false, why: 'название и исполнители в заголовке совпадают' };
}
