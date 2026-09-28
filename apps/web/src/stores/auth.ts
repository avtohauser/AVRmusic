import { create } from 'zustand';
import type { AuthTokens, ServerInfo, User } from '@avrmusic/shared';
import { api, loadStoredAuth, onAuthUpdate, setTokens, storeAuth } from '@/lib/api';

interface AuthState {
  user: User | null;
  ready: boolean;
  info: ServerInfo | null;
  login: (login: string, password: string) => Promise<void>;
  register: (data: { email: string; username: string; password: string; displayName?: string }) => Promise<void>;
  logout: () => Promise<void>;
  init: () => Promise<void>;
  setUser: (u: User) => void;
}

function apply(t: AuthTokens | null) {
  if (t) {
    setTokens({ accessToken: t.accessToken, refreshToken: t.refreshToken, mediaToken: t.mediaToken });
    storeAuth({ accessToken: t.accessToken, refreshToken: t.refreshToken, mediaToken: t.mediaToken, user: t.user });
  } else {
    setTokens(null);
    storeAuth(null);
  }
}

export const useAuth = create<AuthState>((set, get) => ({
  user: loadStoredAuth()?.user ?? null,
  ready: false,
  info: null,
  async init() {
    onAuthUpdate((t) => {
      if (t) { apply({ ...t, user: t.user ?? get().user! }); set({ user: t.user ?? get().user }); }
      else { apply(null); set({ user: null }); }
    });
    try {
      const info = await api.get<ServerInfo>('/api/info');
      set({ info });
    } catch { /* offline: keep going with cached user */ }
    const stored = loadStoredAuth();
    if (stored) {
      try {
        const me = await api.get<User>('/api/auth/me');
        storeAuth({ ...stored, user: me });
        set({ user: me });
      } catch (e: any) {
        if (e?.status === 401) { apply(null); set({ user: null }); }
      }
    }
    set({ ready: true });
  },
  async login(login, password) {
    const t = await api.post<AuthTokens>('/api/auth/login', { login, password });
    apply(t);
    set({ user: t.user });
  },
  async register(data) {
    const t = await api.post<AuthTokens>('/api/auth/register', data);
    apply(t);
    set({ user: t.user, info: get().info ? { ...get().info!, needsSetup: false } : null });
  },
  async logout() {
    const stored = loadStoredAuth();
    try { await api.post('/api/auth/logout', { refreshToken: stored?.refreshToken }); } catch { /* ignore */ }
    apply(null);
    set({ user: null });
  },
  setUser(u) {
    const stored = loadStoredAuth();
    if (stored) storeAuth({ ...stored, user: u });
    set({ user: u });
  },
}));
