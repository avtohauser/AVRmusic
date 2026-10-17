// The newest apps, from the GitHub releases every build lands in (asked at most every ten minutes).
// Android compares the latest one with its own version and offers (or downloads) the update. iPhones
// get theirs through AltStore / SideStore: they read the source this server publishes
// (/api/app/altstore.json), show a new build as an update and install it with one tap, and keep
// re-signing the app every few days, so it is never installed by hand again.
const REPO = process.env.APP_REPO || 'avtohauser/AVRmusic';
let cache: { at: number; list: any[] } | null = null;

export interface AppRelease { version: string; url: string; size: number; notes: string; publishedAt: string }

/** The repository's recent releases (Android ones come often: enough of them to reach the iPhone ones). */
async function releases(): Promise<any[]> {
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache.list;
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=60`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'avr-music' }, signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) throw new Error(String(r.status));
    const list = (await r.json()) as any[];
    cache = { at: Date.now(), list: Array.isArray(list) ? list : [] };
    return cache.list;
  } catch {
    // GitHub out of reach: the last answer (or nothing) for a minute
    cache = { at: Date.now() - 9 * 60_000, list: cache?.list ?? [] };
    return cache.list;
  }
}

export async function latestApp(): Promise<AppRelease | null> {
  const list = await releases();
  const rel = list.find((x) => !x.draft && String(x.tag_name ?? '').startsWith('android-v') && (x.assets ?? []).some((a: any) => String(a.name).endsWith('.apk')));
  const apk = rel?.assets.find((a: any) => String(a.name).endsWith('.apk'));
  return rel && apk ? {
    version: String(rel.tag_name).replace(/^android-v/, ''), url: apk.browser_download_url as string, size: Number(apk.size) || 0,
    notes: String(rel.body ?? '').slice(0, 2000), publishedAt: String(rel.published_at ?? ''),
  } : null;
}

/* ---------- iPhone: an AltStore / SideStore source ---------- */

/** One iPhone build: the IPA carries the marketing version (0.1.0) and the build number (43) apart. */
export interface IosBuild { version: string; build: string; url: string; size: number; date: string }

/** The iPhone builds among the releases (tag ios-v0.1.0.43 with an .ipa), the newest first. */
export function iosBuilds(list: any[]): IosBuild[] {
  const out: IosBuild[] = [];
  for (const rel of list) {
    const m = /^ios-v(\d+\.\d+\.\d+)\.(\d+)$/.exec(String(rel?.tag_name ?? ''));
    const ipa = (rel?.assets ?? []).find((a: any) => String(a.name).endsWith('.ipa'));
    if (!m || !ipa || rel.draft) continue;
    out.push({ version: m[1], build: m[2], url: String(ipa.browser_download_url), size: Number(ipa.size) || 0, date: String(rel.published_at ?? '') });
  }
  return out.sort((a, b) => Number(b.build) - Number(a.build));
}

/**
 * What the app asks permission for, as in its Info.plist (android/iosApp/project.yml; a test keeps the two
 * in step): AltStore refuses an app that asks for more than its source says.
 */
export const IOS_PRIVACY: Record<string, string> = {
  NSMicrophoneUsageDescription: 'AVRmusic слушает несколько секунд, чтобы узнать, какая песня играет рядом.',
  NSPhotoLibraryUsageDescription: 'AVRmusic берёт фото для аватара и обложек',
};

const BUNDLE = 'space.avthsr.music';
const TINT = '#5A4FC8';

/** The source AltStore and SideStore read (their format, version 2, with the older fields for older builds). */
export function altstoreSource(builds: IosBuild[], base: string) {
  const icon = `${base}/icons/icon-512.png`;
  const versions = builds.map((b) => ({
    version: b.version,
    buildVersion: b.build,
    date: b.date,
    localizedDescription: `avr music ${b.version}, сборка ${b.build}.`,
    downloadURL: b.url,
    size: b.size,
    minOSVersion: '16.0',
  }));
  const top = versions[0];
  return {
    name: 'avr music',
    identifier: `${BUNDLE}.source`,
    subtitle: 'Частный музыкальный сервис для своих',
    description: 'Приложение avr music для iPhone и iPad. Новые версии появляются здесь сами, AltStore ставит их одной кнопкой и сам продлевает подпись.',
    iconURL: icon,
    website: base,
    tintColor: TINT,
    featuredApps: [BUNDLE],
    apps: [{
      name: 'avr music',
      bundleIdentifier: BUNDLE,
      developerName: 'avr',
      subtitle: 'Своя библиотека, Моя волна, слушать вместе',
      localizedDescription: 'Тот же avr music, что на Android и на сайте: библиотека и каталог, «Моя волна», тексты караоке, офлайн, слушать вместе с друзьями. Вход — по приглашению.',
      iconURL: icon,
      tintColor: TINT,
      category: 'entertainment',
      screenshots: [],
      versions,
      appPermissions: { entitlements: [], privacy: IOS_PRIVACY },
      // older AltStore and SideStore builds read the newest version from here
      ...(top ? { version: top.version, versionDate: top.date, versionDescription: top.localizedDescription, downloadURL: top.downloadURL, size: top.size } : {}),
    }],
    news: [],
  };
}

export async function iosSource(base: string) {
  return altstoreSource(iosBuilds(await releases()), base);
}
