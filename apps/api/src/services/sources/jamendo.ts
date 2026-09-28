// Jamendo — Creative-Commons catalogue with an official API (free client_id required).
import { config } from '../../config.js';
import { downloadFile, getJson } from './http.js';
import type { Source, SourceCandidate, Want } from './types.js';

export const jamendoSource: Source = {
  name: 'jamendo',
  label: 'Jamendo',
  async available() { return config.jamendoClientId ? { ok: true } : { ok: false, reason: 'JAMENDO_CLIENT_ID не задан' }; },
  async search(w: Want) {
    if (!config.jamendoClientId) return [];
    const q = encodeURIComponent(`${w.artist} ${w.title}`);
    const url = `${config.jamendoApi}/v3.0/tracks/?client_id=${encodeURIComponent(config.jamendoClientId)}&format=json&limit=10&search=${q}&audioformat=mp32&include=musicinfo`;
    const r = await getJson<{ results: any[] }>(url);
    return (r.results ?? []).map((t): SourceCandidate => ({
      source: 'jamendo', id: String(t.id), title: t.name ?? '', artist: t.artist_name ?? null, channel: t.artist_name ?? null, duration: t.duration ?? null,
      url: t.shareurl, downloadUrl: (t.audiodownload_allowed && t.audiodownload) || t.audio,
      quality: { codec: 'mp3', bitrate: 320 },
      extra: { album: t.album_name, image: t.album_image || t.image, year: t.releasedate ? Number(String(t.releasedate).slice(0, 4)) : undefined, genre: t.musicinfo?.tags?.genres?.[0] },
    }));
  },
  async download(c, dir, log, cancel) {
    return downloadFile(c.downloadUrl!, dir, `jamendo-${c.id}`, cancel, log);
  },
};
