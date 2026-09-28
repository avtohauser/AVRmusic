import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Download, Heart, Home, Library, ListMusic, LogIn, Plus, Search, Settings, ShieldCheck, WifiOff, X, Music4 } from 'lucide-react';
import { useAuth } from '@/stores/auth';
import { useUI } from '@/stores/ui';
import { usePlayer } from '@/stores/player';
import { useT } from '@/lib/i18n';
import { useMyPlaylists } from '@/lib/queries';
import { PlayerBar } from './PlayerBar';
import { NowPlaying } from './NowPlaying';
import { ContextMenu } from './ContextMenu';
import { Toasts } from './Toasts';
import { AddToPlaylistModal, PlaylistEditorModal } from './PlaylistModals';
import { QueuePanel } from './QueuePanel';
import { Cover } from './Cover';

export function Layout() {
  const user = useAuth((s) => s.user);
  const online = useUI((s) => s.online);
  const queueOpen = useUI((s) => s.queueOpen);
  const setQueueOpen = useUI((s) => s.setQueueOpen);
  const hasTrack = usePlayer((s) => s.index >= 0);
  const t = useT();
  const loc = useLocation();
  useEffect(() => { document.querySelector('main')?.scrollTo({ top: 0 }); }, [loc.pathname]);

  return (
    <div className="h-full flex flex-col" style={{ ['--player-h' as any]: hasTrack ? '88px' : '0px' }}>
      <div className="flex-1 flex min-h-0">
        <Sidebar />
        <main className="flex-1 min-w-0 overflow-y-auto relative" style={{ paddingBottom: 'calc(var(--player-h) + var(--nav-h) + var(--safe-b) + 16px)' }}>
          {!online && (
            <div className="sticky top-0 z-30 bg-amber-500/90 text-black text-sm font-medium px-4 py-1.5 flex items-center gap-2"><WifiOff size={14} />{t('offlineMode')} <Link to="/downloads" className="underline ml-auto">{t('downloads')}</Link></div>
          )}
          <TopBar />
          <Outlet />
        </main>
        {queueOpen && (
          <aside className="hidden lg:block w-80 shrink-0" style={{ paddingBottom: 'calc(var(--player-h) + 12px)' }}>
            <QueuePanel onClose={() => setQueueOpen(false)} />
          </aside>
        )}
      </div>
      <PlayerBar />
      <MobileNav user={!!user} />
      <NowPlaying />
      <ContextMenu />
      <AddToPlaylistModal />
      <PlaylistEditorModal />
      <Toasts />
    </div>
  );
}

function Sidebar() {
  const user = useAuth((s) => s.user);
  const collapsed = useUI((s) => s.sidebarCollapsed);
  const toggle = useUI((s) => s.toggleSidebar);
  const setEditor = useUI((s) => s.setPlaylistEditor);
  const { data: playlists } = useMyPlaylists();
  const t = useT();
  const item = 'flex items-center gap-3 px-3 py-2 rounded-xl text-muted hover:text-fg hover:bg-surface transition-colors font-medium';
  const active = ({ isActive }: { isActive: boolean }) => `${item} ${isActive ? '!text-fg bg-surface' : ''}`;
  return (
    <aside className={`hidden md:flex flex-col shrink-0 border-r border-line transition-[width] duration-200 ${collapsed ? 'w-[72px]' : 'w-64'}`} style={{ paddingBottom: 'calc(var(--player-h) + 12px)' }}>
      <div className="p-3 flex items-center gap-2">
        <Link to="/" className="flex items-center gap-2 px-2 py-1.5 font-extrabold text-lg">
          <span className="w-8 h-8 rounded-lg accent-gradient flex items-center justify-center text-white shrink-0"><Music4 size={18} /></span>
          {!collapsed && <span className="text-gradient">AVRmusic</span>}
        </Link>
        <button className="icon-btn ml-auto" onClick={toggle} aria-label="toggle">{collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}</button>
      </div>
      <nav className="px-3 space-y-0.5">
        <NavLink to="/" end className={active}><Home size={20} />{!collapsed && t('home')}</NavLink>
        <NavLink to="/search" className={active}><Search size={20} />{!collapsed && t('search')}</NavLink>
        <NavLink to="/library" className={active}><Library size={20} />{!collapsed && t('library')}</NavLink>
        {user && <NavLink to="/downloads" className={active}><Download size={20} />{!collapsed && t('downloads')}</NavLink>}
        {user?.role === 'admin' && <NavLink to="/admin" className={active}><ShieldCheck size={20} />{!collapsed && t('admin')}</NavLink>}
      </nav>
      {user && (
        <div className="mt-4 px-3 flex-1 min-h-0 flex flex-col">
          <div className="flex items-center justify-between px-3 mb-1">
            {!collapsed && <span className="text-xs uppercase tracking-wider text-muted">{t('playlists')}</span>}
            <button className="icon-btn" onClick={() => setEditor({ initial: { title: '', description: '', isPublic: true } })} title={t('createPlaylist')}><Plus size={16} /></button>
          </div>
          <div className="overflow-y-auto no-scrollbar space-y-0.5">
            <NavLink to="/liked" className={active}>
              <span className="w-8 h-8 rounded-md accent-gradient flex items-center justify-center text-white shrink-0"><Heart size={14} fill="currentColor" /></span>
              {!collapsed && <span className="line-clamp-1">{t('likedSongs')}</span>}
            </NavLink>
            {(playlists ?? []).map((p) => (
              <NavLink key={p.id} to={`/playlist/${p.id}`} className={active} title={p.title}>
                <Cover src={p.coverUrl} mosaic={(p as any).mosaic} className="w-8 h-8 !rounded-md" />
                {!collapsed && <span className="min-w-0"><span className="block line-clamp-1 text-sm">{p.title}</span><span className="block text-xs text-muted line-clamp-1">{p.owner.displayName}</span></span>}
              </NavLink>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}

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
  useEffect(() => { if (!onSearch) setQ(''); }, [onSearch]);
  return (
    <header className="sticky top-0 z-20 glass flex items-center gap-2 px-4 md:px-6 h-16" style={{ paddingTop: 'var(--safe-t)' }}>
      <div className="hidden md:flex gap-1">
        <button className="icon-btn" onClick={() => nav(-1)} aria-label="back"><ChevronLeft size={20} /></button>
        <button className="icon-btn" onClick={() => nav(1)} aria-label="forward"><ChevronRight size={20} /></button>
      </div>
      <Link to="/" className="md:hidden flex items-center gap-2 font-extrabold"><span className="w-8 h-8 rounded-lg accent-gradient flex items-center justify-center text-white"><Music4 size={16} /></span><span className="text-gradient">AVRmusic</span></Link>
      {!onSearch && (
        <form className="hidden sm:flex flex-1 max-w-md ml-2" onSubmit={(e) => { e.preventDefault(); if (q.trim()) nav(`/search?q=${encodeURIComponent(q.trim())}`); }}>
          <div className="relative w-full">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input className="input !h-10 !pl-9 !rounded-full" placeholder={t('searchPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => nav('/search')} />
          </div>
        </form>
      )}
      <div className="ml-auto flex items-center gap-2">
        {installPrompt && (
          <button className="btn btn-outline !h-9 hidden sm:inline-flex" onClick={async () => { installPrompt.prompt(); const r = await installPrompt.userChoice; if (r?.outcome === 'accepted') toast(t('installed'), 'success'); setInstallPrompt(null); }}><Download size={16} />{t('installApp')}</button>
        )}
        {user ? (
          <Link to="/profile" className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full hover:bg-surface">
            <Cover src={user.avatarUrl} round kind="artist" className="w-8 h-8" />
            <span className="text-sm font-medium hidden sm:inline">{user.displayName}</span>
          </Link>
        ) : (
          <Link to="/login" className="btn btn-primary !h-9"><LogIn size={16} />{t('login')}</Link>
        )}
      </div>
    </header>
  );
}

function MobileNav({ user }: { user: boolean }) {
  const t = useT();
  const cls = ({ isActive }: { isActive: boolean }) => `flex flex-col items-center justify-center gap-0.5 flex-1 text-[11px] font-medium ${isActive ? 'text-fg' : 'text-muted'}`;
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-[65] glass border-t border-line flex" style={{ height: 'calc(var(--nav-h) + var(--safe-b))', paddingBottom: 'var(--safe-b)' }}>
      <NavLink to="/" end className={cls}><Home size={22} />{t('home')}</NavLink>
      <NavLink to="/search" className={cls}><Search size={22} />{t('search')}</NavLink>
      <NavLink to="/library" className={cls}><Library size={22} />{t('library')}</NavLink>
      {user ? <NavLink to="/downloads" className={cls}><Download size={22} />{t('downloads')}</NavLink> : <NavLink to="/login" className={cls}><LogIn size={22} />{t('login')}</NavLink>}
      <NavLink to="/profile" className={cls}><Settings size={22} />{t('profile')}</NavLink>
    </nav>
  );
}

export function ListMusicIcon() { return <ListMusic />; }
export function CloseIcon() { return <X />; }
