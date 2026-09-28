import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from '@/components/Layout';
import { useAuth } from '@/stores/auth';
import { useLikes } from '@/stores/likes';
import { useUI } from '@/stores/ui';
import { usePlayer } from '@/stores/player';
import { initAudioEngine } from '@/lib/audio';
import { useI18n } from '@/lib/i18n';
import { getColorFromImage } from '@/md';
import { useSeedColor, useTheme } from '@/stores/theme';
import Home from '@/pages/Home';
import Search from '@/pages/Search';
import Library from '@/pages/Library';
import Album from '@/pages/Album';
import Artist from '@/pages/Artist';
import Playlist from '@/pages/Playlist';
import Liked from '@/pages/Liked';
import Genre from '@/pages/Genre';
import Downloads from '@/pages/Downloads';
import History from '@/pages/History';
import Profile from '@/pages/Profile';
import Auth from '@/pages/Auth';
import NotFound from '@/pages/NotFound';
const Admin = lazy(() => import('@/pages/Admin'));
const AdminTrack = lazy(() => import('@/pages/AdminTrack'));
const CatalogArtist = lazy(() => import('@/pages/CatalogArtist'));
const CatalogAlbum = lazy(() => import('@/pages/CatalogAlbum'));

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 } } });

function RequireAuth({ children, admin = false }: { children: React.ReactNode; admin?: boolean }) {
  const user = useAuth((s) => s.user);
  const ready = useAuth((s) => s.ready);
  const loc = useLocation();
  if (!ready) return null;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (admin && user.role !== 'admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}

function Boot() {
  const init = useAuth((s) => s.init);
  const user = useAuth((s) => s.user);
  const setOnline = useUI((s) => s.setOnline);
  const setInstallPrompt = useUI((s) => s.setInstallPrompt);
  const lang = useI18n((s) => s.lang);
  useEffect(() => {
    initAudioEngine();
    init();
    document.documentElement.lang = lang;
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    const bip = (e: Event) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener('beforeinstallprompt', bip);
    const key = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable) return;
      const p = usePlayer.getState();
      if (e.code === 'Space') { e.preventDefault(); p.toggle(); }
      else if (e.key === 'ArrowRight' && e.shiftKey) p.next();
      else if (e.key === 'ArrowLeft' && e.shiftKey) p.prev();
      else if (e.key === 'ArrowRight') p.seek(Math.min(p.duration, p.position + 5));
      else if (e.key === 'ArrowLeft') p.seek(Math.max(0, p.position - 5));
      else if (e.key === 'ArrowUp') { e.preventDefault(); p.setVolume(p.volume + 0.05); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); p.setVolume(p.volume - 0.05); }
      else if (e.key.toLowerCase() === 'm') p.toggleMute();
      else if (e.key.toLowerCase() === 'f') useUI.getState().setNowPlayingOpen(!useUI.getState().nowPlayingOpen);
      else if (e.key.toLowerCase() === 's') p.toggleShuffle();
      else if (e.key.toLowerCase() === 'r') p.cycleRepeat();
      else if (e.key === '/' ) { e.preventDefault(); location.assign('/search'); }
    };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); window.removeEventListener('beforeinstallprompt', bip); window.removeEventListener('keydown', key); };
  }, []);
  useEffect(() => { if (user) useLikes.getState().load(); else useLikes.getState().clear(); }, [user?.id]);
  return null;
}

/** Dynamic colour: derive the theme seed from the playing track's cover when enabled. */
function CoverColorSync() {
  const fromCover = useTheme((s) => s.fromCover);
  const setCoverColor = useTheme((s) => s.setCoverColor);
  const cover = usePlayer((s) => s.queue[s.index]?.coverUrl ?? null);
  useEffect(() => {
    if (!fromCover || !cover) { setCoverColor(null); return; }
    let alive = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { getColorFromImage(img).then((c) => { if (alive) setCoverColor(c); }).catch(() => {}); };
    img.src = cover;
    return () => { alive = false; };
  }, [fromCover, cover, setCoverColor]);
  return null;
}

function ThemeRoot({ children }: { children: React.ReactNode }) {
  const color = useSeedColor();
  const variant = useTheme((s) => s.variant);
  const scheme = useTheme((s) => s.scheme);
  const contrast = useTheme((s) => s.contrast);
  useEffect(() => {
    const el = document.getElementById('root') as any;
    if (!el) return;
    el.color = color; el.variant = variant; el.scheme = scheme; el.contrast = contrast; el.motion = 'expressive'; el.strongFocus = true;
    const sync = () => {
      const meta = document.querySelector('meta[name=theme-color]');
      const bg = getComputedStyle(el).getPropertyValue('--md-sys-color-surface').trim();
      if (meta && bg) meta.setAttribute('content', bg);
    };
    const id = setTimeout(sync, 50);
    el.addEventListener('change', sync);
    return () => { clearTimeout(id); el.removeEventListener('change', sync); };
  }, [color, variant, scheme, contrast]);
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <CoverColorSync />
        <Boot />
        <ThemeRoot>
        <Suspense fallback={<div className="page pt-10 muted">…</div>}>
          <Routes>
            {/* Sign-in screens live outside the app shell: no rail, top bar or player */}
            <Route path="/login" element={<Auth mode="login" />} />
            <Route path="/register" element={<Auth mode="register" />} />
            <Route element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="/search" element={<Search />} />
              <Route path="/library" element={<Library />} />
              <Route path="/album/:id" element={<Album />} />
              <Route path="/artist/:id" element={<Artist />} />
              <Route path="/playlist/:id" element={<Playlist />} />
              <Route path="/genre/:slug" element={<Genre />} />
              <Route path="/catalog/artist/:id" element={<CatalogArtist />} />
              <Route path="/catalog/album/:id" element={<CatalogAlbum />} />
              <Route path="/liked" element={<RequireAuth><Liked /></RequireAuth>} />
              <Route path="/downloads" element={<RequireAuth><Downloads /></RequireAuth>} />
              <Route path="/history" element={<RequireAuth><History /></RequireAuth>} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/admin" element={<RequireAuth admin><Admin /></RequireAuth>} />
              <Route path="/admin/track/:id" element={<RequireAuth admin><AdminTrack /></RequireAuth>} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </Suspense>
        </ThemeRoot>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
