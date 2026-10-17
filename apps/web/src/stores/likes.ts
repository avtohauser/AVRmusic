import { create } from 'zustand';
import { api } from '@/lib/api';

type LikeType = 'track' | 'album' | 'artist' | 'playlist';

interface LikesState {
  ids: Record<LikeType, Set<string>>;
  /** superliked tracks (liked with a star: they are in ids.track too) */
  supers: Set<string>;
  loaded: boolean;
  load: () => Promise<void>;
  clear: () => void;
  has: (type: LikeType, id: string) => boolean;
  toggle: (type: LikeType, id: string) => Promise<boolean>;
  /** Puts the star on a track (liking it too) or takes it off (the like stays). */
  toggleSuper: (id: string) => Promise<boolean>;
}

const empty = (): Record<LikeType, Set<string>> => ({ track: new Set(), album: new Set(), artist: new Set(), playlist: new Set() });

export const useLikes = create<LikesState>((set, get) => ({
  ids: empty(),
  supers: new Set(),
  loaded: false,
  async load() {
    try {
      const r = await api.get<Record<LikeType | 'super', string[]>>('/api/me/likes/ids');
      set({ ids: { track: new Set(r.track), album: new Set(r.album), artist: new Set(r.artist), playlist: new Set(r.playlist) }, supers: new Set(r.super ?? []), loaded: true });
    } catch { /* ignore */ }
  },
  clear() { set({ ids: empty(), supers: new Set(), loaded: false }); },
  has(type, id) { return get().ids[type].has(id); },
  async toggle(type, id) {
    const before = { ids: get().ids, supers: get().supers };
    const cur = before.ids[type].has(id);
    const next = new Set(before.ids[type]);
    if (cur) next.delete(id); else next.add(id);
    // no like, no star
    const supers = cur && type === 'track' && before.supers.has(id) ? new Set([...before.supers].filter((x) => x !== id)) : before.supers;
    set({ ids: { ...before.ids, [type]: next }, supers });
    try {
      if (cur) await api.del(`/api/me/likes/${type}/${id}`);
      else await api.put(`/api/me/likes/${type}/${id}`);
    } catch {
      set(before);
      throw new Error('like failed');
    }
    return !cur;
  },
  async toggleSuper(id) {
    const before = { ids: get().ids, supers: get().supers };
    const cur = before.supers.has(id);
    const supers = new Set(before.supers);
    if (cur) supers.delete(id); else supers.add(id);
    set({ supers, ids: cur ? before.ids : { ...before.ids, track: new Set(before.ids.track).add(id) } });
    try {
      if (cur) await api.del(`/api/me/superlikes/${id}`);
      else await api.put(`/api/me/superlikes/${id}`);
    } catch {
      set(before);
      throw new Error('superlike failed');
    }
    return !cur;
  },
}));

/* ---------- how likes work for this listener (kept on this device) ---------- */

export interface LikePrefs {
  /** superlikes at all: off — the heart only likes */
  superOn: boolean;
  /** what a tap on the heart does (a long press does the other) */
  tap: 'like' | 'super';
  /** which list the library shows first (and the home page's tile) */
  first: 'liked' | 'super';
  set: (p: Partial<Pick<LikePrefs, 'superOn' | 'tap' | 'first'>>) => void;
}

const PREFS = 'avr.likes.v1';
const saved = (() => { try { return JSON.parse(localStorage.getItem(PREFS) || '{}'); } catch { return {}; } })();

export const useLikePrefs = create<LikePrefs>((set, get) => ({
  superOn: saved.superOn ?? true,
  tap: saved.tap === 'super' ? 'super' : 'like',
  first: saved.first === 'super' ? 'super' : 'liked',
  set(p) {
    set(p);
    const { superOn, tap, first } = get();
    try { localStorage.setItem(PREFS, JSON.stringify({ superOn, tap, first })); } catch { /* ignore */ }
  },
}));
