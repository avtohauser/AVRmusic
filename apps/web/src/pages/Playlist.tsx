import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Download, Globe, Lock, MoreHorizontal, Pencil, Shuffle, Search, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { usePlaylist, useSearch } from '@/lib/queries';
import { usePlayer } from '@/stores/player';
import { useAuth } from '@/stores/auth';
import { useUI } from '@/stores/ui';
import { useI18n, useT } from '@/lib/i18n';
import { fmtDurationLong, tracksWord } from '@/lib/format';
import { api, playlistZipUrl } from '@/lib/api';
import { useDebounced } from '@/lib/hooks';
import { Hero } from '@/components/Hero';
import { TrackList } from '@/components/TrackList';
import { PlayButton } from '@/components/PlayButton';
import { LikeButton } from '@/components/LikeButton';
import { EmptyState } from '@/components/EmptyState';
import { TrackListSkeleton } from '@/components/Skeleton';
import { Cover } from '@/components/Cover';

export default function Playlist() {
  const { id } = useParams();
  const { data: pl, isLoading, error } = usePlaylist(id);
  const t = useT();
  const lang = useI18n((s) => s.lang);
  const user = useAuth((s) => s.user);
  const openMenu = useUI((s) => s.openMenu);
  const setEditor = useUI((s) => s.setPlaylistEditor);
  const toast = useUI((s) => s.toast);
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const current = usePlayer((s) => s.queue[s.index]);
  const playing = usePlayer((s) => s.playing);
  const context = usePlayer((s) => s.context);
  const p = usePlayer.getState();
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 250);
  const { data: found } = useSearch(dq, 'track');

  if (error) return <div className="page pt-10"><EmptyState title={(error as any).message} /></div>;
  if (isLoading || !pl) return <div className="page pt-8"><TrackListSkeleton /></div>;
  const isThis = context === `playlist:${id}` && !!current;
  const isOwner = !!user && (pl.owner.id === user.id || user.role === 'admin');
  const uploadCover = async (f: File) => {
    const fd = new FormData(); fd.append('file', f);
    await api.upload(`/api/playlists/${pl.id}/cover`, fd);
    qc.invalidateQueries({ queryKey: ['playlist', pl.id] }); qc.invalidateQueries({ queryKey: ['playlists'] });
    toast(t('saved'), 'success');
  };
  const addTrack = async (trackId: string) => {
    const r = await api.post<{ added: number }>(`/api/playlists/${pl.id}/tracks`, { trackIds: [trackId] });
    qc.invalidateQueries({ queryKey: ['playlist', pl.id] }); qc.invalidateQueries({ queryKey: ['playlists'] });
    toast(r.added ? t('added') : t('added'), 'success');
  };
  const inList = new Set(pl.tracks.map((x) => x.id));

  return (
    <div>
      <Hero kind={t('playlist')} title={pl.title} cover={pl.coverUrl} mosaic={pl.mosaic} description={pl.description}
        meta={<>
          <span className="font-semibold">{pl.owner.displayName}</span>
          <span>· {tracksWord(pl.trackCount, lang)}{pl.durationMs ? `, ${fmtDurationLong(pl.durationMs, lang)}` : ''}</span>
          <span className="inline-flex items-center gap-1 text-muted">· {pl.isPublic ? <Globe size={13} /> : <Lock size={13} />}</span>
        </>}>
        {pl.tracks.length > 0 && <PlayButton size="lg" playing={isThis && playing} onClick={() => (isThis ? p.toggle() : p.playTracks(pl.tracks, 0, `playlist:${pl.id}`))} />}
        {pl.tracks.length > 0 && <button className="icon-btn" title={t('shuffle')} onClick={() => { if (!p.shuffle) p.toggleShuffle(); p.playTracks(pl.tracks, Math.floor(Math.random() * pl.tracks.length), `playlist:${pl.id}`); }}><Shuffle size={22} /></button>}
        {user && !isOwner && <LikeButton type="playlist" id={pl.id} size={24} alwaysVisible />}
        {isOwner && <button className="icon-btn" title={t('editPlaylist')} onClick={() => setEditor({ id: pl.id, initial: { title: pl.title, description: pl.description, isPublic: pl.isPublic } })}><Pencil size={20} /></button>}
        {isOwner && <><button className="btn btn-ghost !h-9" onClick={() => fileRef.current?.click()}>{t('uploadCover')}</button><input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && uploadCover(e.target.files[0])} /></>}
        {user && pl.tracks.length > 0 && <a className="icon-btn" href={playlistZipUrl(pl.id)} title={t('downloadAll')}><Download size={22} /></a>}
        <button className="icon-btn" onClick={(e) => openMenu(e.clientX, e.clientY, { kind: 'playlist', playlist: pl })}><MoreHorizontal size={22} /></button>
      </Hero>
      <div className="page">
        {pl.tracks.length ? <TrackList tracks={pl.tracks} context={`playlist:${pl.id}`} showAddedAt playlistId={pl.id} canRemove={isOwner} /> : <EmptyState title={t('emptyPlaylist')} hint={t('emptyPlaylistHint')} />}
        {isOwner && (
          <section className="mt-10 max-w-3xl">
            <h2 className="text-xl font-bold mb-3">{t('addToPlaylist')}</h2>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input className="input !pl-9 !rounded-full" placeholder={t('searchPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} />
              {q && <button className="icon-btn absolute right-1 top-1/2 -translate-y-1/2" onClick={() => setQ('')}><X size={14} /></button>}
            </div>
            <div className="mt-2 space-y-0.5">
              {(found?.tracks ?? []).filter((x) => !inList.has(x.id)).slice(0, 10).map((x) => (
                <div key={x.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-surface">
                  <Cover src={x.coverUrl} className="w-10 h-10" />
                  <div className="min-w-0 flex-1"><div className="font-medium line-clamp-1">{x.title}</div><div className="text-sm text-muted line-clamp-1">{x.artist.name}{x.album ? ` · ${x.album.title}` : ''}</div></div>
                  <button className="btn btn-outline !h-8" onClick={() => addTrack(x.id)}>{t('added').replace(/о$/, 'ить').replace('Added', 'Add')}</button>
                </div>
              ))}
            </div>
          </section>
        )}
        <div className="hidden">{String(Link)}</div>
      </div>
    </div>
  );
}
