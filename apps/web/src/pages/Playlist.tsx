import { useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { M3eButton, M3eIconButton, M3eSearchBar } from '@/md';
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
import { OfflineToggle } from '@/components/OfflineToggle';
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
    await api.post<{ added: number }>(`/api/playlists/${pl.id}/tracks`, { trackIds: [trackId] });
    qc.invalidateQueries({ queryKey: ['playlist', pl.id] }); qc.invalidateQueries({ queryKey: ['playlists'] });
    toast(t('added'), 'success');
  };
  const inList = new Set(pl.tracks.map((x) => x.id));

  return (
    <div>
      <Hero kind={t('playlist')} title={pl.title} cover={pl.coverUrl} mosaic={pl.mosaic} description={pl.description}
        meta={<>
          <span className="md-title-sm">{pl.owner.displayName}</span>
          <span>· {tracksWord(pl.trackCount, lang)}{pl.durationMs ? `, ${fmtDurationLong(pl.durationMs, lang)}` : ''}</span>
          <m3e-icon variant="rounded" name={pl.isPublic ? 'public' : 'lock'} className="muted" style={{ ['--m3e-icon-size' as any]: '16px' }} />
        </>}>
        {pl.tracks.length > 0 && <PlayButton size="lg" playing={isThis && playing} onClick={() => (isThis ? p.toggle() : p.playTracks(pl.tracks, 0, `playlist:${pl.id}`))} />}
        {pl.tracks.length > 0 && <M3eIconButton variant="tonal" size="medium" title={t('shuffle')} onClick={() => { if (!p.shuffle) p.toggleShuffle(); p.playTracks(pl.tracks, Math.floor(Math.random() * pl.tracks.length), `playlist:${pl.id}`); }}><m3e-icon variant="rounded" name="shuffle" /></M3eIconButton>}
        {user && !isOwner && <LikeButton type="playlist" id={pl.id} alwaysVisible buttonSize="medium" />}
        {isOwner && <M3eIconButton size="medium" title={t('editPlaylist')} onClick={() => setEditor({ id: pl.id, initial: { title: pl.title, description: pl.description, isPublic: pl.isPublic } })}><m3e-icon variant="rounded" name="edit" /></M3eIconButton>}
        {isOwner && <><M3eButton variant="tonal" onClick={() => fileRef.current?.click()}><m3e-icon variant="rounded" slot="icon" name="image" />{t('uploadCover')}</M3eButton><input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && uploadCover(e.target.files[0])} /></>}
        {user && pl.tracks.length > 0 && <M3eIconButton variant="outlined" size="medium" href={playlistZipUrl(pl.id)} title={t('downloadAll')}><m3e-icon variant="rounded" name="download" /></M3eIconButton>}
        <OfflineToggle tracks={pl.tracks} />
        <M3eIconButton size="medium" aria-label="menu" onClick={(e: any) => openMenu(e.clientX, e.clientY, { kind: 'playlist', playlist: pl })}><m3e-icon variant="rounded" name="more_vert" /></M3eIconButton>
      </Hero>
      <div className="page">
        {pl.tracks.length ? <TrackList tracks={pl.tracks} context={`playlist:${pl.id}`} showAddedAt playlistId={pl.id} canRemove={isOwner} /> : <EmptyState icon="queue_music" title={t('emptyPlaylist')} hint={t('emptyPlaylistHint')} />}
        {isOwner && (
          <section className="mt-10 max-w-3xl">
            <h2 className="md-headline-sm emph mb-3">{t('addToPlaylist')}</h2>
            <M3eSearchBar clearable className="!max-w-none" onClear={() => setQ('')}>
              <m3e-icon variant="rounded" slot="leading" name="search" />
              <input slot="input" className="md-input md-body-lg" placeholder={t('searchPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} />
            </M3eSearchBar>
            <div className="mt-2 space-y-0.5">
              {(found?.tracks ?? []).filter((x) => !inList.has(x.id)).slice(0, 10).map((x) => (
                <div key={x.id} className="flex items-center gap-3 p-2 rounded-[20px] state-layer">
                  <Cover src={x.coverUrl} className="w-11 h-11 !rounded-[12px]" />
                  <div className="min-w-0 flex-1"><div className="md-title-sm line-1">{x.title}</div><div className="md-body-sm muted line-1">{x.artist.name}{x.album ? ` · ${x.album.title}` : ''}</div></div>
                  <M3eButton variant="tonal" onClick={() => addTrack(x.id)}><m3e-icon variant="rounded" slot="icon" name="add" />{t('add')}</M3eButton>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
