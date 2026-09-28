import { create } from 'zustand';
import type { AlbumSummary, PlaylistSummary, Track } from '@avrmusic/shared';
import { M3eSnackbar } from '@/md';

export type Theme = 'dark' | 'light';
export interface Toast { id: number; text: string; kind?: 'info' | 'error' | 'success' }
export type MenuTarget =
  | { kind: 'track'; track: Track; playlistId?: string; canRemove?: boolean }
  | { kind: 'album'; album: AlbumSummary }
  | { kind: 'playlist'; playlist: PlaylistSummary };

interface UIState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  nowPlayingOpen: boolean;
  setNowPlayingOpen: (v: boolean) => void;
  queueOpen: boolean;
  setQueueOpen: (v: boolean) => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  menu: { x: number; y: number; target: MenuTarget } | null;
  openMenu: (x: number, y: number, target: MenuTarget) => void;
  closeMenu: () => void;
  toasts: Toast[];
  toast: (text: string, kind?: Toast['kind']) => void;
  dismissToast: (id: number) => void;
  addToPlaylist: { trackIds: string[] } | null;
  setAddToPlaylist: (v: { trackIds: string[] } | null) => void;
  playlistEditor: { id?: string; initial?: { title: string; description: string | null; isPublic: boolean } } | null;
  setPlaylistEditor: (v: UIState['playlistEditor']) => void;
  online: boolean;
  setOnline: (v: boolean) => void;
  installPrompt: any | null;
  setInstallPrompt: (p: any | null) => void;
}

const initialTheme: Theme = 'dark';

let toastId = 0;
export const useUI = create<UIState>((set, get) => ({
  theme: initialTheme,
  setTheme(theme) { set({ theme }); },
  nowPlayingOpen: false,
  setNowPlayingOpen: (v) => set({ nowPlayingOpen: v }),
  queueOpen: false,
  setQueueOpen: (v) => set({ queueOpen: v }),
  sidebarCollapsed: false,
  toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
  menu: null,
  openMenu: (x, y, target) => set({ menu: { x, y, target } }),
  closeMenu: () => set({ menu: null }),
  toasts: [],
  toast(text, kind = 'info') {
    const id = ++toastId;
    set({ toasts: [...get().toasts, { id, text, kind }] });
    try { M3eSnackbar.open((kind === 'error' ? '⚠ ' : '') + text, { duration: kind === 'error' ? 5000 : 3200 }); } catch { /* snackbar host not ready */ }
    setTimeout(() => get().dismissToast(id), 3200);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  addToPlaylist: null,
  setAddToPlaylist: (v) => set({ addToPlaylist: v }),
  playlistEditor: null,
  setPlaylistEditor: (v) => set({ playlistEditor: v }),
  online: navigator.onLine,
  setOnline: (v) => set({ online: v }),
  installPrompt: null,
  setInstallPrompt: (p) => set({ installPrompt: p }),
}));
