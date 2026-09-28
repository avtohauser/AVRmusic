// Audius — open, decentralised music platform with a public API (independent artists, remixes, DJ sets).
import { config } from '../../config.js';
import { downloadFile, getJson } from './http.js';
import type { Source, SourceCandidate, Want } from './types.js';

let hostCache: { at: number; host: string } | null = null;
async function host(): Promise<string> {
  if (config.audiusApi) return config.audiusApi;
  if (hostCache && Date.now() - hostCache.at < 3600_000) return hostCache.host;
  const r = await getJson<{ data: string[] }>('https://api.audius.co');
  const h = r.data?.[0];
  if (!h) throw new Error('Audius: нет доступных узлов');
  hostCache = { at: Date.now(), host: h.replace(/\/$/, '') };
  return hostCache.host;
}

export const audiusSource: Source = {
  name: 'audius',
  label: 'Audius',
  async available() { return { ok: true }; },
  async search(w: Want) {
    const h = await host();
    const q = encodeURIComponent(`${w.artist} ${w.title}`);
    const r = await getJson<{ data: any[] }>(`${h}/v1/tracks/search?query=${q}&limit=10&app_name=${encodeURIComponent(config.audiusAppName)}`);
    return (r.data ?? []).map((t): SourceCandidate => ({
      source: 'audius', id: String(t.id), title: t.title ?? '', artist: t.user?.name ?? null, channel: t.user?.name ?? null, duration: t.duration ?? null,
      url: t.permalink ? `https://audius.co${t.permalink}` : undefined,
      downloadUrl: t.is_downloadable ? `${h}/v1/tracks/${t.id}/download?app_name=${encodeURIComponent(config.audiusAppName)}` : `${h}/v1/tracks/${t.id}/stream?app_name=${encodeURIComponent(config.audiusAppName)}`,
      quality: t.is_downloadable ? { format: 'original', lossless: /flac|wav|aiff/i.test(t.orig_filename ?? '') } : { codec: 'mp3', bitrate: 320 },
      extra: { genre: t.genre, mood: t.mood, artwork: t.artwork?.['1000x1000'] ?? t.artwork?.['480x480'] ?? null },
    }));
  },
  async download(c, dir, log, cancel) {
    return downloadFile(c.downloadUrl!, dir, `audius-${c.id}`, cancel, log);
  },
};
