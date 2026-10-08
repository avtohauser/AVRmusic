import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { M3eAppBar, M3eButton, M3eIconButton, M3eSearchBar } from '@/md';
import { useAuth } from '@/stores/auth';
import { useUI } from '@/stores/ui';
import { usePlayer } from '@/stores/player';
import { useT } from '@/lib/i18n';
import { useMyPlaylists } from '@/lib/queries';
import { useMediaQuery } from '@/lib/hooks';
import { shapeMask } from '@/lib/shapes';
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
import { NewsBanner } from './NewsBanner';
import { Wordmark } from './Brand';
import { FollowBar, FriendPickerModal, JamBar, ReportModal } from './Social';
import { InviteBanner } from './InviteBanner';

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
  const [navHidden, setNavHidden] = useState(false);
  const nav = useNavigate();
  useEffect(() => {
    setNavHidden(false);
    if (isDesktop) return;
    const main = document.querySelector('main');
    if (!main) return;
    let last = main.scrollTop;
    const onScroll = () => {
      const y = main.scrollTop, dy = y - last;
      if (y < 48) setNavHidden(false);
      else if (dy > 10) setNavHidden(true);
      else if (dy < -10) setNavHidden(false);
      if (Math.abs(dy) > 10) last = y;
    };
    main.addEventListener('scroll', onScroll, { passive: true });
    return () => main.removeEventListener('scroll', onScroll);
  }, [isDesktop, loc.pathname]);
  // Private library: guests never see the shell, they get the sign-in screen (a cached user renders at once).
  if (!user && !ready) return null;
  if (!user && info && !info.publicLibrary) return <Navigate to={loc.pathname === '/' ? '/welcome' : '/login'} replace state={{ from: loc.pathname }} />;

  // phones, as in the app: the island slides away while the page scrolls down, the mini player drops into its place
  const tab = TABS.some(([path, , , end]) => (end ? loc.pathname === path : loc.pathname === path));
  return (
    <div className="h-full flex flex-col bg-background text-on-background" data-np-covered={covered || undefined} style={{ ['--player-h' as any]: hasTrack ? (isDesktop ? '96px' : '84px') : '0px', ['--nav-h' as any]: isDesktop ? '0px' : navHidden ? '4px' : '76px', paddingLeft: 'var(--safe-l)', paddingRight: 'var(--safe-r)' }}>
      <div className="app-body flex-1 flex min-h-0">
        {isDesktop && <Rail />}
        <main className="flex-1 min-w-0 overflow-y-auto relative" style={{ paddingBottom: 'calc(var(--player-h) + 76px + var(--safe-b) + 16px)', paddingTop: !isDesktop && !tab ? 'calc(var(--safe-t) + 56px)' : !isDesktop ? 'var(--safe-t)' : undefined }}>
          {!online && (
            <div className="sticky top-0 z-30 bg-tertiary-container text-on-tertiary-container md-label-lg px-4 py-2 flex items-center gap-2" style={{ paddingTop: 'calc(var(--safe-t) + 8px)' }}><m3e-icon variant="rounded" name="wifi_off" />{t('offlineMode')} <Link to="/downloads" className="underline ml-auto">{t('downloads')}</Link></div>
          )}
          {isDesktop && <TopBar />}
          <NewsBanner />
          <Outlet />
        </main>
        {queueOpen && isDesktop && (
          <aside className="hidden lg:block w-[340px] shrink-0 p-3 pl-0" style={{ paddingBottom: 'calc(var(--player-h) + 12px)' }}>
            <div className="h-full surface-low rounded-[28px] overflow-hidden"><QueuePanel onClose={() => setQueueOpen(false)} /></div>
          </aside>
        )}
      </div>
      {!isDesktop && !tab && <button className="back-fab press" aria-label={t('back')} onClick={() => nav(-1)}><m3e-icon variant="rounded" name="arrow_back" /></button>}
      <PlayerBar />
      {!isDesktop && <NavIsland hidden={navHidden} />}
      <NowPlaying />
      <ContextMenu />
      <AddToPlaylistModal />
      <PlaylistEditorModal />
      {user && <><JamBar /><FollowBar /><FriendPickerModal /><ReportModal /><InviteBanner /></>}
    </div>
  );
}

/** The four destinations of the app, in its order. */
const TABS: Array<[string, string, 'home' | 'search' | 'library' | 'profile', boolean]> = [
  ['/', 'home', 'home', true], ['/search', 'search', 'search', false], ['/library', 'library_music', 'library', false], ['/profile', 'person', 'profile', false],
];

/** Phones: the app's navigation island — a floating, fully rounded bar with four tabs; the profile wears the photo. */
function NavIsland({ hidden }: { hidden: boolean }) {
  const t = useT();
  const nav = useNavigate();
  const loc = useLocation();
  const user = useAuth((s) => s.user);
  const active = (path: string, end: boolean) => (end ? loc.pathname === path : loc.pathname.startsWith(path));
  return (
    <nav className="nav-island" data-hidden={hidden || undefined}>
      {TABS.map(([path, icon, key, end]) => {
        const on = active(path, end);
        return (
          <button key={path} className="nav-tab press" data-on={on || undefined} onClick={() => nav(path === '/search' ? lastSearchUrl() : path === '/profile' && !user ? '/login' : path)}>
            <span className="pill">
              {key === 'profile' && user?.avatarUrl
                ? <img src={user.avatarUrl} alt="" className="ava" style={shapeMask('cookie12')} />
                : <m3e-icon variant="rounded" name={icon} filled={on || undefined} />}
            </span>
            <span className="lbl">{t(key)}</span>
          </button>
        );
      })}
    </nav>
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
  if (user) items.push(['/friends', 'group', t('friends'), false], ['/downloads', 'download', t('downloads'), false], ['/profile', 'person', t('profile'), false]);
  if (user?.role === 'admin') items.push(['/admin', 'shield', t('admin'), false]);
  const active = (path: string, end: boolean) => (end ? loc.pathname === path : loc.pathname.startsWith(path));

  return (
    <aside className="side-island shrink-0" data-compact={!expanded || undefined} style={{ marginBottom: 'calc(var(--player-h) + 12px)' }}>
      <div className="flex items-center gap-1 px-3 pt-4 pb-2">
        <Link to="/" className={`flex items-center gap-2 px-2 py-1 min-w-0 ${expanded ? '' : 'mx-auto'}`} onClick={() => setPoke((n) => n + 1)}>
          <Mascot mood={playing ? 'dance' : 'idle'} burst={poke} waves className="w-[46px] h-8 shrink-0" />
          {expanded && <Wordmark className="text-[24px]" />}
        </Link>
        {expanded && <M3eIconButton size="small" className="ml-auto" aria-label="menu" onClick={() => setExpanded(false)}><m3e-icon variant="rounded" name="menu_open" /></M3eIconButton>}
      </div>
      {!expanded && <M3eIconButton className="mx-auto" aria-label="menu" onClick={() => setExpanded(true)}><m3e-icon variant="rounded" name="menu" /></M3eIconButton>}
      <nav className="flex flex-col gap-1 px-3 mt-2">
        {items.map(([path, icon, label, end]) => {
          const on = active(path, end);
          return (
            <button key={path} className="side-link press" data-on={on || undefined} title={label} onClick={() => nav(path === '/search' ? lastSearchUrl() : path)}>
              <m3e-icon variant="rounded" name={icon} filled={on || undefined} />{expanded && <span className="line-1">{label}</span>}
            </button>
          );
        })}
      </nav>
      {user && (
        <div className="px-3 mt-4">
          <button className={`side-link press w-full !text-on-tertiary-container bg-tertiary-container ${expanded ? '' : 'justify-center'}`} title={t('createPlaylist')} onClick={() => setEditor({ initial: { title: '', description: '', isPublic: true } })}>
            <m3e-icon variant="rounded" name="add" />{expanded && <span>{t('createPlaylist')}</span>}
          </button>
        </div>
      )}
      {user && (
        <div className="mt-4 px-3 pb-3 flex-1 min-h-0 overflow-y-auto no-scrollbar">
          {expanded && <div className="md-label-md muted px-3 pb-1">{t('playlists')}</div>}
          <div className="space-y-0.5">
            <NavLink to="/liked" className={({ isActive }) => `flex items-center gap-3 px-2 py-1.5 rounded-[18px] state-layer ${isActive ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface-variant'} ${expanded ? '' : 'justify-center'}`} title={t('likedSongs')}>
              <span className="w-10 h-10 rounded-[12px] bg-primary text-on-primary flex items-center justify-center shrink-0"><m3e-icon variant="rounded" name="favorite" filled style={{ ['--m3e-icon-size' as any]: '20px' }} /></span>
              {expanded && <span className="md-label-lg line-1">{t('likedSongs')}</span>}
            </NavLink>
            {(playlists ?? []).map((p) => (
              <NavLink key={p.id} to={`/playlist/${p.id}`} title={p.title} className={({ isActive }) => `flex items-center gap-3 px-2 py-1.5 rounded-[18px] state-layer ${isActive ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface-variant'} ${expanded ? '' : 'justify-center'}`}>
                <Cover src={p.coverUrl} mosaic={(p as any).mosaic} className="w-10 h-10 !rounded-[12px]" />
                {expanded && <span className="min-w-0"><span className="block md-label-lg line-1 text-on-surface">{p.title}</span><span className="block md-label-sm muted line-1">{p.owner.displayName}</span></span>}
              </NavLink>
            ))}
          </div>
        </div>
      )}
    </aside>
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
    <M3eAppBar size="small" className="topbar sticky top-0 z-20" data-hidden={hidden || undefined} style={{ paddingTop: 'var(--safe-t-bar)' }}>
      <div slot="leading" className="flex items-center gap-1">
        <span className="hidden md:flex gap-0.5">
          <M3eIconButton aria-label="back" onClick={() => nav(-1)}><m3e-icon variant="rounded" name="arrow_back" /></M3eIconButton>
          <M3eIconButton aria-label="forward" onClick={() => nav(1)}><m3e-icon variant="rounded" name="arrow_forward" /></M3eIconButton>
        </span>
        <Link to="/" className="md:hidden flex items-center gap-2 pl-2" onClick={() => setPoke((n) => n + 1)}><Mascot mood={playing ? 'dance' : 'idle'} burst={poke} waves className="w-10 h-7" /><Wordmark className="text-[22px]" /></Link>
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
              {user.avatarUrl
                ? <img src={user.avatarUrl} alt="" className="w-10 h-10 object-cover" style={shapeMask('cookie12')} />
                : <span className="w-10 h-10 grid place-items-center bg-primary-container text-on-primary-container md-label-lg" style={shapeMask('cookie12')}>{user.displayName.slice(0, 2).toUpperCase()}</span>}
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
