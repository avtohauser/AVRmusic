import { create } from 'zustand';
import type { ThemeVariant, ColorScheme } from '@/md';

export interface ThemeState {
  /** Seed colour for the dynamic palette (hex). */
  color: string;
  variant: ThemeVariant;
  scheme: ColorScheme;
  /** Take the seed colour from the currently playing track's cover art. */
  fromCover: boolean;
  /** Seed derived from the cover (kept separately so switching fromCover off restores the chosen colour). */
  coverColor: string | null;
  contrast: 'standard' | 'medium' | 'high';
  /** avr music's own colours (teal, pink, violet) instead of a generated palette. */
  brand: boolean;
  set: (p: Partial<Pick<ThemeState, 'color' | 'variant' | 'scheme' | 'fromCover' | 'contrast' | 'brand'>>) => void;
  setCoverColor: (c: string | null) => void;
}

export const PRESET_COLORS = ['#6750A4', '#8B5CF6', '#0E7C86', '#00658F', '#B3261E', '#7D5260', '#386A20', '#9A4500', '#1B6B50', '#4F5B92', '#7C4DFF', '#C2185B'];

const KEY = 'avr.theme.v2';
const load = (): Partial<ThemeState> => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
const saved = load();

export const useTheme = create<ThemeState>((set, get) => ({
  color: saved.color ?? '#6750A4',
  variant: saved.variant ?? 'expressive',
  scheme: saved.scheme ?? 'dark',
  fromCover: saved.fromCover ?? true,
  coverColor: null,
  contrast: saved.contrast ?? 'standard',
  // came with the new sign: on for everyone until switched off
  brand: saved.brand ?? true,
  set(p) {
    set(p);
    const { color, variant, scheme, fromCover, contrast, brand } = { ...get(), ...p };
    try { localStorage.setItem(KEY, JSON.stringify({ color, variant, scheme, fromCover, contrast, brand })); } catch { /* ignore */ }
  },
  setCoverColor: (coverColor) => set({ coverColor }),
}));

/** Effective seed colour for <m3e-theme>. */
export function useSeedColor(): string {
  return useTheme((s) => (s.fromCover && s.coverColor ? s.coverColor : s.color));
}
