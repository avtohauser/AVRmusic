import { create } from 'zustand';
import { api } from '@/lib/api';

type LikeType = 'track' | 'album' | 'artist' | 'playlist';

interface LikesState {
  ids: Record<LikeType, Set<string>>;
  loaded: boolean;
  load: () => Promise<void>;
  clear: () => void;
  has: (type: LikeType, id: string) => boolean;
  toggle: (type: LikeType, id: string) => Promise<boolean>;
}

const empty = (): Record<LikeType, Set<string>> => ({ track: new Set(), album: new Set(), artist: new Set(), playlist: new Set() });

export const useLikes = create<LikesState>((set, get) => ({
  ids: empty(),
  loaded: false,
  async load() {
    try {
      const r = await api.get<Record<LikeType, string[]>>('/api/me/likes/ids');
      set({ ids: { track: new Set(r.track), album: new Set(r.album), artist: new Set(r.artist), playlist: new Set(r.playlist) }, loaded: true });
    } catch { /* ignore */ }
  },
  clear() { set({ ids: empty(), loaded: false }); },
  has(type, id) { return get().ids[type].has(id); },
  async toggle(type, id) {
    const cur = get().ids[type].has(id);
    const next = new Set(get().ids[type]);
    if (cur) next.delete(id); else next.add(id);
    set({ ids: { ...get().ids, [type]: next } });
    try {
      if (cur) await api.del(`/api/me/likes/${type}/${id}`);
      else await api.put(`/api/me/likes/${type}/${id}`);
    } catch {
      const rollback = new Set(get().ids[type]);
      if (cur) rollback.add(id); else rollback.delete(id);
      set({ ids: { ...get().ids, [type]: rollback } });
      throw new Error('like failed');
    }
    return !cur;
  },
}));
