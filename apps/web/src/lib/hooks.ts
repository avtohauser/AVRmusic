import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
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
 * Rows that change places glide to their new place instead of jumping (FLIP), new ones rise in. Rows are
 * the elements under [ref] with data-flip="<id>"; only the ones on screen move, so a long list stays light.
 */
export function useFlip(ref: RefObject<HTMLElement | null>, deps: unknown[]) {
  const prev = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const host = ref.current;
    if (!host) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const first = prev.current.size === 0;
    const vh = window.innerHeight;
    const next = new Map<string, number>();
    host.querySelectorAll<HTMLElement>('[data-flip]').forEach((el) => {
      const id = el.dataset.flip!;
      const top = el.getBoundingClientRect().top;
      next.set(id, top);
      if (first || still || top < -120 || top > vh + 120) return;
      const was = prev.current.get(id);
      if (was == null) el.animate([{ opacity: 0, transform: 'translateY(12px) scale(.98)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.2,.8,.3,1)' });
      else if (Math.abs(was - top) > 1) el.animate([{ transform: `translateY(${Math.max(-vh, Math.min(vh, was - top))}px)` }, { transform: 'none' }], { duration: 520, easing: 'cubic-bezier(.34,1.22,.64,1)' });
    });
    prev.current = next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
