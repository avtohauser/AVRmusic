import { useEffect, useState } from 'react';
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
