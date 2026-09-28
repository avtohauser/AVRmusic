// Internet Archive — netlabels, Live Music Archive, public-domain and CC audio; lossless (FLAC) is common.
import { config } from '../../config.js';
import { downloadFile, getJson } from './http.js';
import type { Source, SourceCandidate, Want } from './types.js';

const AUDIO_FORMATS: Record<string, { lossless: boolean; bitrate?: number; rank: number }> = {
  'Flac': { lossless: true, rank: 4 }, 'Apple Lossless Audio': { lossless: true, rank: 3 }, 'WAVE': { lossless: true, rank: 3 },
  'VBR MP3': { lossless: false, bitrate: 220, rank: 2 }, 'MP3': { lossless: false, bitrate: 192, rank: 2 }, '128Kbps MP3': { lossless: false, bitrate: 128, rank: 1 },
  'Ogg Vorbis': { lossless: false, bitrate: 160, rank: 2 }, '64Kbps MP3': { lossless: false, bitrate: 64, rank: 0 },
};
const esc = (s: string) => s.replace(/["\\()\[\]{}^~*?:!]/g, ' ').replace(/\s+/g, ' ').trim();
const parseLen = (v: unknown): number | null => {
  if (v == null) return null;
  const s = String(v);
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  const parts = s.split(':').map(Number);
  if (parts.some(Number.isNaN)) return null;
  return parts.reduce((a, b) => a * 60 + b, 0);
};

export const archiveSource: Source = {
  name: 'archive',
  label: 'Internet Archive',
  async available() { return { ok: true }; },
  async search(w: Want) {
    const title = esc(w.title), artist = esc(w.artist);
    if (!title) return [];
    const q = encodeURIComponent(`title:(${title}) AND (creator:(${artist}) OR title:(${artist}) OR description:(${artist})) AND mediatype:audio`);
    const r = await getJson<{ response: { docs: any[] } }>(`${config.archiveApi}/advancedsearch.php?q=${q}&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=downloads&rows=6&sort[]=downloads+desc&output=json`);
    const docs = r.response?.docs ?? [];
    const out: SourceCandidate[] = [];
    await Promise.all(docs.map(async (d) => {
      try {
        const meta = await getJson<{ result?: any[]; files?: any[] }>(`${config.archiveApi}/metadata/${encodeURIComponent(d.identifier)}/files`);
        const files: any[] = meta.result ?? meta.files ?? [];
        for (const f of files) {
          const fmt = AUDIO_FORMATS[f.format];
          if (!fmt) continue;
          const name = String(f.name ?? '');
          const fileTitle = String(f.title ?? name.replace(/\.[^.]+$/, '').replace(/^\d+[\s._-]+/, ''));
          out.push({
            source: 'archive', id: `${d.identifier}/${name}`, title: fileTitle, artist: f.artist ?? f.creator ?? (Array.isArray(d.creator) ? d.creator[0] : d.creator) ?? null,
            channel: Array.isArray(d.creator) ? d.creator[0] : d.creator ?? null, duration: parseLen(f.length),
            url: `https://archive.org/details/${d.identifier}`, downloadUrl: `${config.archiveApi}/download/${encodeURIComponent(d.identifier)}/${encodeURIComponent(name)}`,
            quality: { format: f.format, lossless: fmt.lossless, bitrate: fmt.bitrate }, extra: { album: f.album ?? d.title, rank: fmt.rank, size: Number(f.size ?? 0) },
          });
        }
      } catch { /* skip item */ }
    }));
    return out;
  },
  async download(c, dir, log, cancel) {
    return downloadFile(c.downloadUrl!, dir, `ia-${c.id.replace(/[^a-z0-9]+/gi, '_').slice(0, 60)}`, cancel, log);
  },
};
