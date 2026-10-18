import { Children, isValidElement, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { offlineIds, onOfflineChange } from './offline';
import { dominantColor } from './color';

/** Set of track ids saved for offline listening; updates live. */
export function useOfflineIds(): Set<string> {
  const [ids, setIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    let alive = true;
    const refresh = () => offlineIds().then((s) => { if (alive) setIds(s); });
    refresh();
    const off = onOfflineChange(refresh);
    return () => { alive = false; off(); };
  }, []);
  return ids;
}

export function useDominantColor(src: string | null | undefined, fallback = '#3b3b55'): string {
  const [color, setColor] = useState(fallback);
  useEffect(() => {
    let alive = true;
    dominantColor(src, fallback).then((c) => { if (alive) setColor(c); });
    return () => { alive = false; };
  }, [src, fallback]);
  return color;
}

export function useMediaQuery(q: string): boolean {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const h = () => setM(mq.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, [q]);
  return m;
}

export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => { const id = setTimeout(() => setV(value), ms); return () => clearTimeout(id); }, [value, ms]);
  return v;
}

/**
 * Rows and cards that change places glide to their new place instead of jumping (FLIP), new ones rise in.
 * They are the elements under [ref] with data-flip="<id>"; places are taken inside [ref] (scrolling the page
 * or a shelf moves nothing), and only the ones on screen move, so a long list stays light.
 */
export function useFlip(ref: RefObject<HTMLElement | null>, deps: unknown[]) {
  const prev = useRef(new Map<string, { x: number; y: number }>());
  useLayoutEffect(() => {
    const host = ref.current;
    if (!host) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const first = prev.current.size === 0;
    const vw = window.innerWidth, vh = window.innerHeight;
    const box = host.getBoundingClientRect();
    const next = new Map<string, { x: number; y: number }>();
    host.querySelectorAll<HTMLElement>('[data-flip]').forEach((el) => {
      const id = el.dataset.flip!;
      const r = el.getBoundingClientRect();
      const at = { x: r.left - box.left + host.scrollLeft, y: r.top - box.top + host.scrollTop };
      next.set(id, at);
      if (first || still || r.bottom < -120 || r.top > vh + 120 || r.right < 0 || r.left > vw) return;
      const was = prev.current.get(id);
      const clamp = (v: number, m: number) => Math.max(-m, Math.min(m, v));
      const dx = was ? clamp(was.x - at.x, vw) : 0, dy = was ? clamp(was.y - at.y, vh) : 0;
      if (!was) el.animate([{ opacity: 0, transform: 'translateY(12px) scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 340, easing: 'cubic-bezier(.2,.8,.3,1)' });
      else if (Math.abs(dx) > 1 || Math.abs(dy) > 1) el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 520, easing: 'cubic-bezier(.34,1.22,.64,1)' });
    });
    prev.current = next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** What a list of children is, by their keys: for useFlip, so it runs when the cards change, not on every render. */
export function keysOf(children: ReactNode): string {
  return Children.toArray(children).map((c) => (isValidElement(c) ? String(c.key) : '')).join(',');
}
