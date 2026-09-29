import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { M3eAppBar, M3eAvatar, M3eButton, M3eFab, M3eIconButton, M3eNavBar, M3eNavItem, M3eNavRail, M3eSearchBar } from '@/md';
import { useAuth } from '@/stores/auth';
import { useUI } from '@/stores/ui';
import { usePlayer } from '@/stores/player';
import { useT } from '@/lib/i18n';
import { useMyPlaylists } from '@/lib/queries';
import { useMediaQuery } from '@/lib/hooks';
import { Mascot } from './Mascot';
import { PlayerBar } from './PlayerBar';
import { NowPlaying } from './NowPlaying';
import { ContextMenu } from './ContextMenu';
import { AddToPlaylistModal, PlaylistEditorModal } from './PlaylistModals';
import { QueuePanel } from './QueuePanel';
import { Cover } from './Cover';
import { TopBarQueueIndicator } from './Catalog';
import { lastSearchUrl } from '@/lib/nav';
import { FlowText } from '@/components/FlowText';

export function Layout() {
  const user = useAuth((s) => s.user);
  const ready = useAuth((s) => s.ready);
  const info = useAuth((s) => s.info);
  const online = useUI((s) => s.online);
  const queueOpen = useUI((s) => s.queueOpen);
  const setQueueOpen = useUI((s) => s.setQueueOpen);
  const hasTrack = usePlayer((s) => s.index >= 0);
  const t = useT();
  const loc = useLocation();
  const isDesktop = useMediaQuery('(min-width: 768px)');
  useEffect(() => { document.querySelector('main')?.scrollTo({ top: 0 }); }, [loc.pathname]);
  // Once the full-screen player has slid in, the page under it is hidden and its animations stop:
  // nothing invisible keeps costing frame time.
  const npOpen = useUI((s) => s.nowPlayingOpen);
  const [covered, setCovered] = useState(false);
  useEffect(() => {
    if (!npOpen || !hasTrack) { setCovered(false); return; }
    const id = setTimeout(() => setCovered(true), 450);
    return () => clearTimeout(id);
  }, [npOpen, hasTrack]);
  // Private library: guests never see the shell, they get the sign-in screen (a cached user renders at once).
  if (!user && !ready) return null;
  if (!user && info && !info.publicLibrary) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;

  return (
    <div className="h-full flex flex-col bg-background text-on-background" data-np-covered={covered || undefined} style={{ ['--player-h' as any]: hasTrack ? '96px' : '0px', ['--nav-h' as any]: isDesktop ? '0px' : '92px', paddingLeft: 'var(--safe-l)', paddingRight: 'var(--safe-r)' }}>
      <div className="app-body flex-1 flex min-h-0">
        {isDesktop && <Rail />}
        <main className="flex-1 min-w-0 overflow-y-auto relative" style={{ paddingBottom: 'calc(var(--player-h) + var(--nav-h) + var(--safe-b) + 16px)' }}>
          {!online && (
            <div className="sticky top-0 z-30 bg-tertiary-container text-on-tertiary-container md-label-lg px-4 py-2 flex items-center gap-2" style={{ paddingTop: 'calc(var(--safe-t) + 8px)' }}><m3e-icon variant="rounded" name="wifi_off" />{t('offlineMode')} <Link to="/downloads" className="underline ml-auto">{t('downloads')}</Link></div>
          )}
          <TopBar />
          <Outlet />
        </main>
        {queueOpen && isDesktop && (
          <aside className="hidden lg:block w-[340px] shrink-0 p-3 pl-0" style={{ paddingBottom: 'calc(var(--player-h) + 12px)' }}>
            <div className="h-full surface-low rounded-[28px] overflow-hidden"><QueuePanel onClose={() => setQueueOpen(false)} /></div>
          </aside>
        )}
      </div>
      <PlayerBar />
      {!isDesktop && <BottomNav user={!!user} />}
      <NowPlaying />
      <ContextMenu />
      <AddToPlaylistModal />
      <PlaylistEditorModal />
    </div>
  );
}

/** Material 3 navigation rail (desktop). Expanded on wide screens, compact otherwise. */
function Rail() {
  const user = useAuth((s) => s.user);
  const setEditor = useUI((s) => s.setPlaylistEditor);
  const { data: playlists } = useMyPlaylists();
  const t = useT();
  const nav = useNavigate();
  const loc = useLocation();
  // Expanded rail from 1024px (covers 1366×768 laptops at 125% scaling); compact with icons + short labels below that.
  const wide = useMediaQuery('(min-width: 1024px)');
  const playing = usePlayer((s) => s.playing);
  const [poke, setPoke] = useState(0);
  const [expanded, setExpanded] = useState(wide);
  useEffect(() => setExpanded(wide), [wide]);
  const items: Array<[string, string, string, boolean]> = [
    ['/', 'home', t('home'), true],
    ['/search', 'search', t('search'), false],
    ['/library', 'library_music', t('library'), false],
  ];
  if (user) items.push(['/downloads', 'download', t('downloads'), false]);
  if (user?.role === 'admin') items.push(['/admin', 'shield', t('admin'), false]);
  const active = (path: string, end: boolean) => (end ? loc.pathname === path : loc.pathname.startsWith(path));

  return (
    <M3eNavRail mode={expanded ? 'expanded' : 'compact'} className="shrink-0 h-full overflow-y-auto overflow-x-hidden no-scrollbar" style={{ paddingBottom: 'var(--player-h)', width: expanded ? 248 : undefined }}>
      <div className="flex flex-col gap-2 px-2 pt-2">
        <M3eIconButton aria-label="menu" onClick={() => setExpanded(!expanded)} className="self-start"><m3e-icon variant="rounded" name={expanded ? 'menu_open' : 'menu'} /></M3eIconButton>
        <Link to="/" className="flex items-center gap-2 px-2 py-1" onClick={() => setPoke((n) => n + 1)}>
          <Mascot mood={playing ? 'dance' : 'idle'} burst={poke} className="w-9 h-9" />
          {expanded && <FlowText text="AVRmusic" className="md-title-lg emph text-primary" intro={false} />}
        </Link>
        {user && (
          <M3eFab size={expanded ? 'medium' : 'small'} variant="tertiary-container" extended={expanded || undefined} aria-label={t('createPlaylist')} onClick={() => setEditor({ initial: { title: '', description: '', isPublic: true } })} className={`mt-1 max-w-full ${expanded ? 'self-start' : 'self-center'}`}>
            <m3e-icon variant="rounded" name="add" />{expanded && <span slot="label" className="line-1">{t('playlist')}</span>}
          </M3eFab>
        )}
      </div>
      {items.map(([path, icon, label, end]) => (
        <M3eNavItem key={path} selected={active(path, end) || undefined} onClick={() => nav(path === '/search' ? lastSearchUrl() : path)}>
          <m3e-icon variant="rounded" slot="icon" name={icon} />
          <m3e-icon variant="rounded" slot="selected-icon" name={icon} filled />
          {label}
        </M3eNavItem>
      ))}
      {user && (
        <div className="mt-3 px-2">
          {expanded && <div className="md-label-md muted px-3 pb-1 uppercase tracking-wider">{t('playlists')}</div>}
          <div className="space-y-0.5">
            <NavLink to="/liked" className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded-full state-layer ${isActive ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface-variant'}`} title={t('likedSongs')}>
              <span className="w-8 h-8 rounded-[10px] bg-primary text-on-primary flex items-center justify-center shrink-0"><m3e-icon variant="rounded" name="favorite" filled style={{ ['--m3e-icon-size' as any]: '18px' }} /></span>
              {expanded && <span className="md-label-lg line-1">{t('likedSongs')}</span>}
            </NavLink>
            {(playlists ?? []).map((p) => (
              <NavLink key={p.id} to={`/playlist/${p.id}`} title={p.title} className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded-full state-layer ${isActive ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface-variant'}`}>
                <Cover src={p.coverUrl} mosaic={(p as any).mosaic} className="w-8 h-8 !rounded-[10px]" />
                {expanded && <span className="min-w-0"><span className="block md-label-lg line-1">{p.title}</span><span className="block md-label-sm muted line-1">{p.owner.displayName}</span></span>}
              </NavLink>
            ))}
          </div>
        </div>
      )}
    </M3eNavRail>
  );
}

/** Material 3 top app bar: navigation, search bar, install + queue actions, avatar. */
function TopBar() {
  const user = useAuth((s) => s.user);
  const nav = useNavigate();
  const loc = useLocation();
  const t = useT();
  const [q, setQ] = useState('');
  const installPrompt = useUI((s) => s.installPrompt);
  const setInstallPrompt = useUI((s) => s.setInstallPrompt);
  const toast = useUI((s) => s.toast);
  const onSearch = loc.pathname.startsWith('/search');
  const inputRef = useRef<HTMLInputElement>(null);
  const playing = usePlayer((s) => s.playing);
  const [poke, setPoke] = useState(0);
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [hidden, setHidden] = useState(false);
  useEffect(() => { if (!onSearch) setQ(''); }, [onSearch]);
  // Phones: the bar slides away while scrolling down and comes back on the way up
  useEffect(() => {
    setHidden(false);
    if (isDesktop) return;
    const main = document.querySelector('main');
    if (!main) return;
    let last = main.scrollTop;
    const onScroll = () => {
      const y = main.scrollTop, dy = y - last;
      if (y < 48) setHidden(false);
      else if (dy > 8) setHidden(true);
      else if (dy < -8) setHidden(false);
      if (Math.abs(dy) > 8) last = y;
    };
    main.addEventListener('scroll', onScroll, { passive: true });
    return () => main.removeEventListener('scroll', onScroll);
  }, [isDesktop, loc.pathname]);
  return (
    <M3eAppBar size="small" className="topbar sticky top-0 z-20 glass" data-hidden={hidden || undefined} style={{ paddingTop: 'var(--safe-t-bar)' }}>
      <div slot="leading" className="flex items-center gap-1">
        <span className="hidden md:flex gap-0.5">
          <M3eIconButton aria-label="back" onClick={() => nav(-1)}><m3e-icon variant="rounded" name="arrow_back" /></M3eIconButton>
          <M3eIconButton aria-label="forward" onClick={() => nav(1)}><m3e-icon variant="rounded" name="arrow_forward" /></M3eIconButton>
        </span>
        <Link to="/" className="md:hidden flex items-center gap-2 pl-2" onClick={() => setPoke((n) => n + 1)}><Mascot mood={playing ? 'dance' : 'idle'} burst={poke} className="w-7 h-7" /><FlowText text="AVRmusic" className="md-title-md emph text-primary" intro={false} /></Link>
      </div>
      {!onSearch && (
        <div slot="title" className="hidden sm:block w-full max-w-[560px]">
          <M3eSearchBar clearable onClear={() => setQ('')} onClick={() => { if (!onSearch) nav(lastSearchUrl()); }}>
            <m3e-icon variant="rounded" slot="leading" name="search" />
            <input ref={inputRef} slot="input" className="md-input md-body-lg" placeholder={t('searchPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => { if (!onSearch) nav(lastSearchUrl()); }} onKeyDown={(e) => { if (e.key === 'Enter' && q.trim()) nav(`/search?q=${encodeURIComponent(q.trim())}`); }} />
          </M3eSearchBar>
        </div>
      )}
      <div slot="trailing" className="flex items-center gap-1">
        <TopBarQueueIndicator />
        {user?.role === 'admin' && !isDesktop && (
          <M3eIconButton aria-label={t('admin')} title={t('admin')} onClick={() => nav('/admin')}><m3e-icon variant="rounded" name="shield" /></M3eIconButton>
        )}
        {installPrompt && (
          <M3eButton variant="tonal" className="hidden sm:inline-flex" onClick={async () => { installPrompt.prompt(); const r = await installPrompt.userChoice; if (r?.outcome === 'accepted') toast(t('installed'), 'success'); setInstallPrompt(null); }}><m3e-icon variant="rounded" slot="icon" name="download_for_offline" />{t('installApp')}</M3eButton>
        )}
        {user ? (
          <>
            <Link to="/profile" id="avatar-link" className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full state-layer">
              <M3eAvatar>{user.avatarUrl ? <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" /> : user.displayName.slice(0, 2).toUpperCase()}</M3eAvatar>
              <span className="md-label-lg hidden sm:inline">{user.displayName}</span>
            </Link>
            <m3e-tooltip for="avatar-link">{t('profile')}</m3e-tooltip>
          </>
        ) : (
          <M3eButton variant="filled" onClick={() => nav('/login')}><m3e-icon variant="rounded" slot="icon" name="login" />{t('login')}</M3eButton>
        )}
      </div>
    </M3eAppBar>
  );
}

/** Material 3 navigation bar (phones). */
function BottomNav({ user }: { user: boolean }) {
  const t = useT();
  const nav = useNavigate();
  const loc = useLocation();
  const items: Array<[string, string, string, boolean]> = [
    ['/', 'home', t('home'), true], ['/search', 'search', t('search'), false], ['/library', 'library_music', t('library'), false],
    user ? ['/downloads', 'download', t('downloads'), false] : ['/login', 'login', t('login'), false], ['/profile', 'person', t('profile'), false],
  ];
  const active = (path: string, end: boolean) => (end ? loc.pathname === path : loc.pathname.startsWith(path));
  // Floating "island" navigation bar (Material 3 Expressive): inset from the edges, pill-shaped, elevated.
  return (
    <div className="floating-nav z-[65]">
      <M3eNavBar>
        {items.map(([path, icon, label, end]) => (
          <M3eNavItem key={path} selected={active(path, end) || undefined} onClick={() => nav(path === '/search' ? lastSearchUrl() : path)}>
            <m3e-icon variant="rounded" slot="icon" name={icon} />
            <m3e-icon variant="rounded" slot="selected-icon" name={icon} filled />
            {label}
          </M3eNavItem>
        ))}
      </M3eNavBar>
    </div>
  );
}
