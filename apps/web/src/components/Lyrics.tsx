import { useEffect, useMemo, useRef } from 'react';
import type { Lyrics as LyricsT } from '@avrmusic/shared';
import { usePlayer } from '@/stores/player';
import { useT } from '@/lib/i18n';
import { Mascot } from './Mascot';

/** Karaoke-style synced lyrics with auto-scroll and click-to-seek; falls back to plain text. */
export function Lyrics({ lyrics, loading, className = '', big = false }: { lyrics: LyricsT | undefined; loading?: boolean; className?: string; big?: boolean }) {
  const position = usePlayer((s) => s.position);
  const seek = usePlayer((s) => s.seek);
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const lines = lyrics?.synced ?? null;
  const active = useMemo(() => {
    if (!lines) return -1;
    const ms = position * 1000 + 150;
    let idx = -1;
    for (let i = 0; i < lines.length; i++) { if (lines[i].timeMs <= ms) idx = i; else break; }
    return idx;
  }, [lines, position]);

  useEffect(() => {
    if (!ref.current || active < 0) return;
    const el = ref.current.querySelector<HTMLElement>(`[data-i="${active}"]`);
    if (!el) return;
    ref.current.scrollTo({ top: el.offsetTop - ref.current.clientHeight * 0.38, behavior: 'smooth' });
  }, [active]);

  if (loading) return <div className={`flex items-center justify-center h-full ${className}`}><Mascot mood="think" className="w-12 h-12" /></div>;
  if (!lyrics || (!lyrics.synced && !lyrics.plain)) {
    return (
      <div className={`flex flex-col items-center justify-center text-center muted h-full ${className}`}>
        <Mascot mood="sleep" className="w-14 h-14" />
        <p className="md-body-lg mt-4">{t('noLyrics')}</p>
      </div>
    );
  }
  const size = big ? 'md-headline-md md:md-headline-lg emph' : 'md-title-lg';
  if (lines) {
    return (
      <div ref={ref} className={`overflow-y-auto no-scrollbar h-full py-[35%] px-1 ${className}`} style={big ? { maskImage: 'linear-gradient(transparent, #000 12%, #000 88%, transparent)', WebkitMaskImage: 'linear-gradient(transparent, #000 12%, #000 88%, transparent)' } : undefined}>
        {lines.map((l, i) => (
          <p key={i} data-i={i} data-active={i === active} data-past={i < active} className={`lyric-line mb-4 md:mb-6 ${size}`} onClick={() => seek(l.timeMs / 1000)}>
            {l.text || '♪'}
          </p>
        ))}
      </div>
    );
  }
  return (
    <div className={`overflow-y-auto no-scrollbar h-full py-6 px-1 whitespace-pre-wrap ${size} ${className}`}>
      <p className="md-label-md muted uppercase tracking-wider mb-4">{t('lyricsNotSynced')}</p>
      {lyrics.plain}
    </div>
  );
}
