import type { LyricLine } from '@avrmusic/shared';

const LRC_TIME = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

/** Parse LRC text ("[mm:ss.xx] line") into sorted timed lines. Returns null if no timestamps are present. */
export function parseLrc(text: string): LyricLine[] | null {
  const lines: LyricLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const stamps: number[] = [];
    let m: RegExpExecArray | null;
    LRC_TIME.lastIndex = 0;
    while ((m = LRC_TIME.exec(raw))) {
      const min = Number(m[1]);
      const sec = Number(m[2]);
      const fracStr = m[3] ?? '0';
      const frac = Number(fracStr.padEnd(3, '0').slice(0, 3));
      stamps.push(min * 60000 + sec * 1000 + frac);
    }
    if (!stamps.length) continue;
    const content = raw.replace(LRC_TIME, '').trim();
    for (const t of stamps) lines.push({ timeMs: t, text: content });
  }
  if (!lines.length) return null;
  lines.sort((a, b) => a.timeMs - b.timeMs);
  return lines;
}

/** Strip LRC timestamps and metadata tags to get plain text. */
export function lrcToPlain(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((l) => !/^\[(ti|ar|al|by|offset|re|ve|length):/i.test(l.trim()))
    .map((l) => l.replace(LRC_TIME, '').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function linesToLrc(lines: LyricLine[]): string {
  return lines
    .map((l) => {
      const min = Math.floor(l.timeMs / 60000);
      const sec = Math.floor((l.timeMs % 60000) / 1000);
      const cs = Math.floor((l.timeMs % 1000) / 10);
      return `[${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}]${l.text}`;
    })
    .join('\n');
}
