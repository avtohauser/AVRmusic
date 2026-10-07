// The newest Android app: the latest release on GitHub (where every build lands), asked at most every ten
// minutes. The app compares it with its own version and offers (or downloads) the update.
const REPO = process.env.APP_REPO || 'avtohauser/AVRmusic';
let cache: { at: number; value: AppRelease | null } | null = null;

export interface AppRelease { version: string; url: string; size: number; notes: string; publishedAt: string }

export async function latestApp(): Promise<AppRelease | null> {
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache.value;
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=10`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'avr-music' }, signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) throw new Error(String(r.status));
    const list = (await r.json()) as any[];
    const rel = list.find((x) => !x.draft && String(x.tag_name ?? '').startsWith('android-v') && (x.assets ?? []).some((a: any) => String(a.name).endsWith('.apk')));
    const apk = rel?.assets.find((a: any) => String(a.name).endsWith('.apk'));
    const value = rel && apk ? {
      version: String(rel.tag_name).replace(/^android-v/, ''), url: apk.browser_download_url as string, size: Number(apk.size) || 0,
      notes: String(rel.body ?? '').slice(0, 2000), publishedAt: String(rel.published_at ?? ''),
    } : null;
    cache = { at: Date.now(), value };
    return value;
  } catch {
    // GitHub out of reach: the last answer (or nothing) for a minute
    cache = { at: Date.now() - 9 * 60_000, value: cache?.value ?? null };
    return cache.value;
  }
}
