import { useEffect, useId, useRef, useState } from 'react';

/**
 * The AVRmusic star as a living mascot. One shape, several moods:
 *  idle  – breathes and sways, the points soften and sharpen
 *  dance – bounces and tilts while music is playing
 *  sleep – dozes (tilted, dimmer, little "z"s) while paused
 *  think – spins and morphs while something loads
 *  hello – pops in with a twirl (app start)
 * Changing `burst` fires a one-shot twirl with a ring of sparkles (likes, track changes, taps).
 */
export type MascotMood = 'idle' | 'dance' | 'sleep' | 'think' | 'hello';

/** Four-point star; `c` moves the curve handles: 3 = diamond, 21 = the logo, 40 = thin cross. */
export const starPath = (c: number) => {
  const d = 100 - c;
  return `M50 3C50 ${c} ${c} 50 3 50C${c} 50 50 ${d} 50 97C50 ${d} ${d} 50 97 50C${d} 50 50 ${c} 50 3Z`;
};

export function Mascot({ mood = 'idle', burst = 0, className = '', title = 'AVRmusic', slot }: { mood?: MascotMood; burst?: number; className?: string; title?: string; slot?: string }) {
  const gid = `m${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [bursts, setBursts] = useState<number[]>([]);
  const prev = useRef(burst);
  useEffect(() => {
    if (burst === prev.current) return;
    prev.current = burst;
    const key = Date.now() + Math.random();
    setBursts((b) => [...b, key]);
    const id = setTimeout(() => setBursts((b) => b.filter((x) => x !== key)), 950);
    return () => clearTimeout(id);
  }, [burst]);
  return (
    <span className={`mascot ${className}`} data-mood={mood} data-burst={bursts.length ? true : undefined} slot={slot}>
      <svg viewBox="0 0 100 100" className="mascot-body" role="img" aria-label={title}>
        <defs>
          <linearGradient id={gid} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#CF8FC9" />
            <stop offset="1" stopColor="#655BD3" />
          </linearGradient>
        </defs>
        <path className="mascot-shape" fill={`url(#${gid})`} d={starPath(21)} />
      </svg>
      {mood === 'sleep' && <span className="mascot-z" aria-hidden="true"><i>z</i><i>z</i></span>}
      {bursts.map((k) => (
        <span key={k} className="mascot-burst" aria-hidden="true">
          {Array.from({ length: 8 }).map((_, i) => <i key={i} style={{ ['--a' as any]: `${i * 45 + 22}deg`, ['--d' as any]: `${(i % 2) * 60}ms` }} />)}
        </span>
      ))}
    </span>
  );
}
