import { useEffect, useId, useRef, useState } from 'react';

/**
 * The avr music star as a living mascot (with its two sound waves when asked). One shape, several moods:
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

/** The brand's star (avr music): the same four curves the morphs blend between. */
export const BRAND_STAR = 'M50 2C53 30 70 47 98 50C70 53 53 70 50 98C47 70 30 53 2 50C30 47 47 30 50 2Z';

export function Mascot({ mood = 'idle', burst = 0, className = '', title = 'avr music', slot, waves = false }: { mood?: MascotMood; burst?: number; className?: string; title?: string; slot?: string; waves?: boolean }) {
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
    <span className={`mascot ${className}`} data-mood={mood} data-waves={waves || undefined} data-burst={bursts.length ? true : undefined} slot={slot}>
      <svg viewBox={waves ? '0 0 140 100' : '0 0 100 100'} className="mascot-body" role="img" aria-label={title}>
        <defs>
          <linearGradient id={gid} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#F2A5C3" />
            <stop offset="1" stopColor="#5A4FC8" />
          </linearGradient>
        </defs>
        <g className="mascot-star"><path className="mascot-shape" fill={`url(#${gid})`} d={BRAND_STAR} /></g>
        {waves && <>
          <path className="mascot-wave mascot-wave1" d="M108 30A28 28 0 0 1 108 70" fill="none" stroke="#F2A5C3" strokeWidth="6" strokeLinecap="round" />
          <path className="mascot-wave mascot-wave2" d="M122 18A44 44 0 0 1 122 82" fill="none" stroke="#5A4FC8" strokeWidth="6" strokeLinecap="round" />
        </>}
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
