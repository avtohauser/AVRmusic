export function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60) % 60;
  const h = Math.floor(sec / 3600);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
export function fmtMs(ms: number): string {
  return fmtTime(ms / 1000);
}
export function fmtDurationLong(ms: number, lang = 'ru'): string {
  const total = Math.round(ms / 60000);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (lang === 'en') return h ? `${h} h ${m} min` : `${m} min`;
  return h ? `${h} ч ${m} мин` : `${m} мин`;
}
export function fmtBytes(b: number): string {
  if (b < 1024) return `${b} Б`;
  const u = ['КБ', 'МБ', 'ГБ', 'ТБ'];
  let i = -1;
  do { b /= 1024; i++; } while (b >= 1024 && i < u.length - 1);
  return `${b.toFixed(b < 10 ? 1 : 0)} ${u[i]}`;
}
export function fmtNumber(n: number, lang = 'ru'): string {
  return new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'ru-RU').format(n);
}
export function fmtDate(iso: string, lang = 'ru'): string {
  const d = new Date(iso);
  return d.toLocaleDateString(lang === 'en' ? 'en-US' : 'ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}
export function plural(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}
export function tracksWord(n: number, lang = 'ru'): string {
  if (lang === 'en') return `${n} ${n === 1 ? 'track' : 'tracks'}`;
  return `${n} ${plural(n, ['трек', 'трека', 'треков'])}`;
}
export function fmtCompact(n: number, lang = 'ru'): string {
  return new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'ru-RU', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}
