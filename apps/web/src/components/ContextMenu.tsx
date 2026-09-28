import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUI } from '@/stores/ui';
import { usePlayer } from '@/stores/player';
import { useLikes } from '@/stores/likes';
import { useAuth } from '@/stores/auth';
import { useT } from '@/lib/i18n';
import { api, albumZipUrl, downloadUrl, playlistZipUrl } from '@/lib/api';
import { isOffline, removeOffline, saveOffline } from '@/lib/offline';
import { useQueryClient } from '@tanstack/react-query';
import type { Track } from '@avrmusic/shared';
import { Disc3, Download, Heart, ListEnd, ListPlus, ListStart, Mic2, Radio, Share2, Trash2, User, WifiOff, Pencil, HardDriveDownload } from 'lucide-react';

interface Item { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }

export function ContextMenu() {
  const menu = useUI((s) => s.menu);
  const close = useUI((s) => s.closeMenu);
  const toast = useUI((s) => s.toast);
  const setAddToPlaylist = useUI((s) => s.setAddToPlaylist);
  const setPlaylistEditor = useUI((s) => s.setPlaylistEditor);
  const user = useAuth((s) => s.user);
  const t = useT();
  const nav = useNavigate();
  const qc = useQueryClient();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent | TouchEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('touchstart', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('touchstart', onDown); window.removeEventListener('keydown', onKey); window.removeEventListener('scroll', close, true); };
  }, [menu, close]);

  useEffect(() => {
    if (menu?.target.kind === 'track') isOffline(menu.target.track.id).then(setOffline);
  }, [menu]);

  useLayoutEffect(() => {
    if (!menu || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const x = Math.min(menu.x, window.innerWidth - r.width - 8);
    const y = Math.min(menu.y, window.innerHeight - r.height - 8);
    setPos({ x: Math.max(8, x), y: Math.max(8, y) });
  }, [menu]);

  if (!menu) return null;
  const items: Item[] = [];
  const player = usePlayer.getState();
  const likes = useLikes.getState();
  const share = (path: string) => {
    const url = `${location.origin}${path}`;
    if (navigator.share) navigator.share({ url }).catch(() => {});
    else navigator.clipboard?.writeText(url).then(() => toast(t('linkCopied'), 'success'));
  };

  if (menu.target.kind === 'track') {
    const { track, playlistId, canRemove } = menu.target;
    items.push({ icon: <ListStart size={16} />, label: t('playNext'), onClick: () => player.playNext([track]) });
    items.push({ icon: <ListEnd size={16} />, label: t('addToQueue'), onClick: () => player.addToQueue([track]) });
    if (user) {
      items.push({ icon: <Heart size={16} />, label: likes.has('track', track.id) ? t('unlike') : t('like'), onClick: () => { likes.toggle('track', track.id); } });
      items.push({ icon: <ListPlus size={16} />, label: t('addToPlaylist'), onClick: () => setAddToPlaylist({ trackIds: [track.id] }) });
      if (playlistId && canRemove) items.push({ icon: <Trash2 size={16} />, label: t('removeFromPlaylist'), danger: true, onClick: async () => { await api.del(`/api/playlists/${playlistId}/tracks/${track.id}`); qc.invalidateQueries({ queryKey: ['playlist', playlistId] }); qc.invalidateQueries({ queryKey: ['playlists'] }); toast(t('removed')); } });
    }
    items.push({ icon: <Radio size={16} />, label: t('startRadio'), onClick: async () => { const r = await api.get<Track[]>(`/api/tracks/${track.id}/radio`); player.playTracks([track, ...r], 0, `radio:${track.id}`); } });
    if (track.album) items.push({ icon: <Disc3 size={16} />, label: t('goToAlbum'), onClick: () => nav(`/album/${track.album!.id}`) });
    items.push({ icon: <User size={16} />, label: t('goToArtist'), onClick: () => nav(`/artist/${track.artist.id}`) });
    if (track.hasLyrics) items.push({ icon: <Mic2 size={16} />, label: t('lyrics'), onClick: () => { if (player.current()?.id !== track.id) player.playTrack(track); useUI.getState().setNowPlayingOpen(true); } });
    if (user) {
      items.push({ icon: <Download size={16} />, label: t('download'), onClick: () => { const a = document.createElement('a'); a.href = downloadUrl(track.id); a.download = ''; a.click(); } });
      items.push({ icon: offline ? <WifiOff size={16} /> : <HardDriveDownload size={16} />, label: offline ? t('removeOffline') : t('saveOffline'), onClick: async () => {
        if (offline) { await removeOffline(track.id); toast(t('removed')); }
        else { toast(`${t('saveOffline')}…`); try { await saveOffline(track); toast(t('savedOffline'), 'success'); } catch { toast(t('error'), 'error'); } }
      } });
      if (user.role === 'admin') items.push({ icon: <Pencil size={16} />, label: t('editTrack'), onClick: () => nav(`/admin/track/${track.id}`) });
    }
    items.push({ icon: <Share2 size={16} />, label: t('share'), onClick: () => share(track.album ? `/album/${track.album.id}?track=${track.id}` : `/artist/${track.artist.id}`) });
  } else if (menu.target.kind === 'album') {
    const { album } = menu.target;
    const load = () => api.get<{ tracks: Track[] }>(`/api/albums/${album.id}`).then((a) => a.tracks);
    items.push({ icon: <ListStart size={16} />, label: t('playNext'), onClick: async () => player.playNext(await load()) });
    items.push({ icon: <ListEnd size={16} />, label: t('addToQueue'), onClick: async () => player.addToQueue(await load()) });
    if (user) {
      items.push({ icon: <Heart size={16} />, label: likes.has('album', album.id) ? t('unlike') : t('like'), onClick: () => { likes.toggle('album', album.id); } });
      items.push({ icon: <ListPlus size={16} />, label: t('addToPlaylist'), onClick: async () => setAddToPlaylist({ trackIds: (await load()).map((x) => x.id) }) });
      items.push({ icon: <Download size={16} />, label: t('downloadAll'), onClick: () => { location.href = albumZipUrl(album.id); } });
    }
    items.push({ icon: <User size={16} />, label: t('goToArtist'), onClick: () => nav(`/artist/${album.artist.id}`) });
    items.push({ icon: <Share2 size={16} />, label: t('share'), onClick: () => share(`/album/${album.id}`) });
  } else {
    const { playlist } = menu.target;
    const load = () => api.get<{ tracks: Track[] }>(`/api/playlists/${playlist.id}`).then((a) => a.tracks);
    items.push({ icon: <ListStart size={16} />, label: t('playNext'), onClick: async () => player.playNext(await load()) });
    items.push({ icon: <ListEnd size={16} />, label: t('addToQueue'), onClick: async () => player.addToQueue(await load()) });
    if (user) {
      if (playlist.owner.id !== user.id) items.push({ icon: <Heart size={16} />, label: likes.has('playlist', playlist.id) ? t('unlike') : t('like'), onClick: () => { likes.toggle('playlist', playlist.id); qc.invalidateQueries({ queryKey: ['playlists'] }); } });
      if (playlist.owner.id === user.id || user.role === 'admin') {
        items.push({ icon: <Pencil size={16} />, label: t('editPlaylist'), onClick: () => setPlaylistEditor({ id: playlist.id, initial: { title: playlist.title, description: playlist.description, isPublic: playlist.isPublic } }) });
        items.push({ icon: <Trash2 size={16} />, label: t('deletePlaylist'), danger: true, onClick: async () => { if (!confirm(t('confirmDelete'))) return; await api.del(`/api/playlists/${playlist.id}`); qc.invalidateQueries({ queryKey: ['playlists'] }); toast(t('removed')); if (location.pathname.includes(playlist.id)) nav('/library'); } });
      }
      items.push({ icon: <Download size={16} />, label: t('downloadAll'), onClick: () => { location.href = playlistZipUrl(playlist.id); } });
    }
    items.push({ icon: <Share2 size={16} />, label: t('share'), onClick: () => share(`/playlist/${playlist.id}`) });
  }

  return (
    <div ref={ref} className="fixed z-[90] min-w-[220px] glass border border-line rounded-xl shadow-2xl py-1.5 fade-in" style={{ left: pos.x, top: pos.y }} role="menu">
      {items.map((it, i) => (
        <button key={i} role="menuitem" className={`w-full flex items-center gap-3 px-3.5 py-2 text-sm text-left hover:bg-surface-2 ${it.danger ? 'text-red-400' : ''}`} onClick={() => { close(); it.onClick(); }}>
          <span className="text-muted">{it.icon}</span>{it.label}
        </button>
      ))}
    </div>
  );
}
