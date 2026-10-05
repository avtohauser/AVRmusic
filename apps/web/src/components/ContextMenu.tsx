import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { Track } from '@avrmusic/shared';
import { M3eActionList, M3eBottomSheet, M3eListAction, M3eMenu, M3eMenuItem } from '@/md';
import { useUI } from '@/stores/ui';
import { usePlayer } from '@/stores/player';
import { useLikes } from '@/stores/likes';
import { useAuth } from '@/stores/auth';
import { useT } from '@/lib/i18n';
import { api, albumZipUrl, downloadUrl, playlistZipUrl } from '@/lib/api';
import { isOffline, removeOffline, saveOffline } from '@/lib/offline';
import { useMediaQuery } from '@/lib/hooks';
import { useState } from 'react';
import { askReport, sendToFriends, trNow } from '@/lib/social';

interface Item { icon: string; label: string; onClick: () => void; danger?: boolean }

/** Contextual actions: a Material menu anchored at the pointer on desktop, a bottom sheet on phones. */
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
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const anchorRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<any>(null);
  const sheetRef = useRef<any>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => { if (menu?.target.kind === 'track') isOffline(menu.target.track.id).then(setOffline); }, [menu]);

  // Show / hide the native surfaces when the store changes
  useEffect(() => {
    if (!menu) return;
    if (isDesktop) {
      const a = anchorRef.current, m = menuRef.current;
      if (!a || !m) return;
      a.style.left = `${menu.x}px`; a.style.top = `${menu.y}px`;
      m.show?.(a);
      const onToggle = (e: any) => { if (e.newState === 'closed') close(); };
      m.addEventListener('toggle', onToggle);
      return () => { m.removeEventListener('toggle', onToggle); m.hide?.(); };
    }
    const s = sheetRef.current;
    if (!s) return;
    s.show?.();
    const onClosed = () => close();
    s.addEventListener('closed', onClosed);
    return () => { s.removeEventListener('closed', onClosed); s.hide?.(); };
  }, [menu, isDesktop, close]);

  const items: Item[] = [];
  const player = usePlayer.getState();
  const likes = useLikes.getState();
  const share = (path: string) => {
    const url = `${location.origin}${path}`;
    if (navigator.share) navigator.share({ url }).catch(() => {});
    else navigator.clipboard?.writeText(url).then(() => toast(t('linkCopied'), 'success'));
  };

  if (menu?.target.kind === 'track') {
    const { track, playlistId, canRemove } = menu.target;
    items.push({ icon: 'playlist_play', label: t('playNext'), onClick: () => player.playNext([track]) });
    items.push({ icon: 'queue_music', label: t('addToQueue'), onClick: () => player.addToQueue([track]) });
    if (user) {
      items.push({ icon: 'favorite', label: likes.has('track', track.id) ? t('unlike') : t('like'), onClick: () => { likes.toggle('track', track.id); } });
      items.push({ icon: 'playlist_add', label: t('addToPlaylist'), onClick: () => setAddToPlaylist({ trackIds: [track.id] }) });
      if (playlistId && canRemove) items.push({ icon: 'playlist_remove', label: t('removeFromPlaylist'), danger: true, onClick: async () => { await api.del(`/api/playlists/${playlistId}/tracks/${track.id}`); qc.invalidateQueries({ queryKey: ['playlist', playlistId] }); qc.invalidateQueries({ queryKey: ['playlists'] }); toast(t('removed')); } });
    }
    items.push({ icon: 'radio', label: t('startRadio'), onClick: async () => { const r = await api.get<Track[]>(`/api/tracks/${track.id}/radio`); player.playTracks([track, ...r], 0, `radio:${track.id}`); } });
    if (track.album) items.push({ icon: 'album', label: t('goToAlbum'), onClick: () => nav(`/album/${track.album!.id}`) });
    items.push({ icon: 'artist', label: t('goToArtist'), onClick: () => nav(`/artist/${track.artist.id}`) });
    if (track.hasLyrics) items.push({ icon: 'lyrics', label: t('lyrics'), onClick: () => { if (player.current()?.id !== track.id) player.playTrack(track); useUI.getState().setNowPlayingOpen(true); } });
    if (user) {
      items.push({ icon: 'download', label: t('download'), onClick: () => { const a = document.createElement('a'); a.href = downloadUrl(track.id); a.download = ''; a.click(); } });
      items.push({ icon: offline ? 'cloud_off' : 'offline_pin', label: offline ? t('removeOffline') : t('saveOffline'), onClick: async () => {
        if (offline) { await removeOffline(track.id); toast(t('removed')); }
        else { toast(`${t('saveOffline')}…`); try { await saveOffline(track); toast(t('savedOffline'), 'success'); } catch { toast(t('error'), 'error'); } }
      } });
      const info = useAuth.getState().info;
      if (!track.hasCanvas && info && info.acquire !== 'off' && (info.acquire === 'user' || user.role === 'admin')) {
        items.push({ icon: 'movie', label: t('findCanvas'), onClick: async () => { try { await api.post(`/api/tracks/${track.id}/canvas/fetch`, {}); toast(t('canvasQueued'), 'success'); } catch (e: any) { toast(e.message, 'error'); } } });
      }
      if (user.role === 'admin') {
        items.push({ icon: 'edit', label: t('editTrack'), onClick: () => nav(`/admin/track/${track.id}`) });
      }
    }
    const lib = !track.id.startsWith('dz:');
    if (user && lib) items.push({ icon: 'send', label: trNow('Отправить другу', 'Send to a friend'), onClick: () => sendToFriends('track', track.id, track.title) });
    items.push({ icon: 'share', label: t('share'), onClick: () => share(track.album ? `/album/${track.album.id}?track=${track.id}` : `/artist/${track.artist.id}`) });
    if (user && lib) items.push({ icon: 'flag', label: trNow('Пожаловаться на трек', 'Report the track'), onClick: () => askReport(track) });
    // a catalogue song still on its way to the server: only what works before it lands
    if (!lib) items.splice(0, items.length, ...items.filter((it) => ['playlist_play', 'queue_music', 'favorite'].includes(it.icon)));
  } else if (menu?.target.kind === 'album') {
    const { album } = menu.target;
    const load = () => api.get<{ tracks: Track[] }>(`/api/albums/${album.id}`).then((a) => a.tracks);
    items.push({ icon: 'playlist_play', label: t('playNext'), onClick: async () => player.playNext(await load()) });
    items.push({ icon: 'queue_music', label: t('addToQueue'), onClick: async () => player.addToQueue(await load()) });
    if (user) {
      items.push({ icon: 'favorite', label: likes.has('album', album.id) ? t('unlike') : t('like'), onClick: () => { likes.toggle('album', album.id); } });
      items.push({ icon: 'playlist_add', label: t('addToPlaylist'), onClick: async () => setAddToPlaylist({ trackIds: (await load()).map((x) => x.id) }) });
      items.push({ icon: 'download', label: t('downloadAll'), onClick: () => { location.href = albumZipUrl(album.id); } });
    }
    items.push({ icon: 'artist', label: t('goToArtist'), onClick: () => nav(`/artist/${album.artist.id}`) });
    if (user) items.push({ icon: 'send', label: trNow('Отправить другу', 'Send to a friend'), onClick: () => sendToFriends('album', album.id, album.title) });
    items.push({ icon: 'share', label: t('share'), onClick: () => share(`/album/${album.id}`) });
  } else if (menu?.target.kind === 'playlist') {
    const { playlist } = menu.target;
    const load = () => api.get<{ tracks: Track[] }>(`/api/playlists/${playlist.id}`).then((a) => a.tracks);
    items.push({ icon: 'playlist_play', label: t('playNext'), onClick: async () => player.playNext(await load()) });
    items.push({ icon: 'queue_music', label: t('addToQueue'), onClick: async () => player.addToQueue(await load()) });
    if (user) {
      const owner = playlist.canEdit ?? playlist.owner.id === user.id;
      const creator = playlist.isCreator ?? playlist.owner.id === user.id;
      if (!owner) items.push({ icon: 'favorite', label: likes.has('playlist', playlist.id) ? t('unlike') : t('like'), onClick: () => { likes.toggle('playlist', playlist.id); qc.invalidateQueries({ queryKey: ['playlists'] }); } });
      if (owner || user.role === 'admin') items.push({ icon: 'edit', label: t('editPlaylist'), onClick: () => setPlaylistEditor({ id: playlist.id, initial: { title: playlist.title, description: playlist.description, isPublic: playlist.isPublic } }) });
      if (owner && !creator) items.push({ icon: 'person_remove', label: trNow('Выйти из владельцев', 'Stop owning it'), danger: true, onClick: async () => { await api.del(`/api/playlists/${playlist.id}/members/${user.id}`); qc.invalidateQueries({ queryKey: ['playlists'] }); qc.invalidateQueries({ queryKey: ['playlist', playlist.id] }); toast(trNow('Вы больше не владелец', 'You no longer own it')); } });
      if (creator || user.role === 'admin') items.push({ icon: 'delete', label: t('deletePlaylist'), danger: true, onClick: async () => { if (!confirm(t('confirmDelete'))) return; await api.del(`/api/playlists/${playlist.id}`); qc.invalidateQueries({ queryKey: ['playlists'] }); toast(t('removed')); if (location.pathname.includes(playlist.id)) nav('/library'); } });
      items.push({ icon: 'send', label: trNow('Отправить другу', 'Send to a friend'), onClick: () => sendToFriends('playlist', playlist.id, playlist.title) });
      items.push({ icon: 'download', label: t('downloadAll'), onClick: () => { location.href = playlistZipUrl(playlist.id); } });
    }
    items.push({ icon: 'share', label: t('share'), onClick: () => share(`/playlist/${playlist.id}`) });
  }

  const run = (it: Item) => { close(); it.onClick(); };
  const title = menu?.target.kind === 'track' ? menu.target.track.title : menu?.target.kind === 'album' ? menu.target.album.title : menu?.target.kind === 'playlist' ? menu.target.playlist.title : '';

  return (
    <>
      <div ref={anchorRef} className="fixed w-px h-px pointer-events-none" style={{ left: 0, top: 0 }} aria-hidden />
      {isDesktop ? (
        <M3eMenu ref={menuRef}>
          {items.map((it, i) => (
            <M3eMenuItem key={i} onClick={() => run(it)} style={it.danger ? { color: 'var(--md-sys-color-error)' } : undefined}>
              <m3e-icon variant="rounded" slot="icon" name={it.icon} />{it.label}
            </M3eMenuItem>
          ))}
        </M3eMenu>
      ) : (
        <M3eBottomSheet ref={sheetRef} modal handle hideable detents={['fit']}>
          {title && <span slot="header" className="md-title-md emph px-4 line-1">{title}</span>}
          <M3eActionList>
            {items.map((it, i) => (
              <M3eListAction key={i} onClick={() => run(it)} style={it.danger ? { color: 'var(--md-sys-color-error)' } : undefined}>
                <m3e-icon variant="rounded" slot="leading" name={it.icon} />{it.label}
              </M3eListAction>
            ))}
          </M3eActionList>
        </M3eBottomSheet>
      )}
    </>
  );
}
