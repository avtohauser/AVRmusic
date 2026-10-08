// The app's Material 3 Expressive shapes on the web: the cookie artists and the play button wear, the
// 12-sided cookie of avatars, the four-leaf clover, the sunny star and the rounded square the play button
// becomes while music plays. Every shape is drawn through the same number of points at the same angles,
// so any two can morph into each other (an SVG path's `d` animates between them).
import type { CSSProperties } from 'react';

export type ShapeName = 'cookie9' | 'cookie12' | 'clover' | 'sunny' | 'square' | 'circle';

const POINTS = 144;

/** Distance from the centre at angle [a] (radians, 0 = up), in 0…1. */
function radius(shape: ShapeName, a: number): number {
  switch (shape) {
    // scallops: rounded bumps with shallow rounded dips (RoundedPolygon.star(n, inner 0.8, rounding 0.5))
    case 'cookie9': return 1 - 0.16 * (0.5 - 0.5 * Math.cos(9 * a));
    case 'cookie12': return 1 - 0.12 * (0.5 - 0.5 * Math.cos(12 * a));
    // four deep, round leaves
    case 'clover': { const c = 0.5 - 0.5 * Math.cos(4 * a); return 1 - 0.42 * Math.pow(c, 1.6); }
    // eight short, sharper rays
    case 'sunny': { const c = Math.abs(Math.cos(4 * a)); return 0.86 + 0.14 * Math.pow(c, 3); }
    // a squircle: a square with generous round corners
    case 'square': { const p = 4.2, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a)); return 0.98 / Math.pow(Math.pow(c, p) + Math.pow(s, p), 1 / p); }
    default: return 1;
  }
}

const cache = new Map<ShapeName, string>();

/** The shape as an SVG path in a 100 × 100 box. */
export function shapePath(shape: ShapeName): string {
  const hit = cache.get(shape);
  if (hit) return hit;
  let d = '';
  for (let i = 0; i < POINTS; i++) {
    const a = (i / POINTS) * Math.PI * 2;
    // the square's corners sit on the diagonals, the cookies' bumps point straight up
    const r = radius(shape, a) * 50;
    const x = 50 + r * Math.sin(a), y = 50 - r * Math.cos(a);
    d += `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  d += 'Z';
  cache.set(shape, d);
  return d;
}

const masks = new Map<ShapeName, CSSProperties>();

/** A style that cuts an element (a cover, a photo) to the shape, at any size. */
export function shapeMask(shape: ShapeName): CSSProperties {
  if (shape === 'circle') return { borderRadius: '50%' };
  const hit = masks.get(shape);
  if (hit) return hit;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><path d='${shapePath(shape)}'/></svg>`;
  const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  const style: CSSProperties = { WebkitMaskImage: url, maskImage: url, WebkitMaskSize: '100% 100%', maskSize: '100% 100%', WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat' };
  masks.set(shape, style);
  return style;
}
