import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { M3eButton, M3eIconButton } from '@/md';
import { useAlbum, useArtist } from '@/lib/queries';
import { usePlayer } from '@/stores/player';
import { useAuth } from '@/stores/auth';
import { useUI } from '@/stores/ui';
import { useI18n, useT } from '@/lib/i18n';
import { fmtDurationLong, tracksWord } from '@/lib/format';
import { albumZipUrl, api } from '@/lib/api';
import { useTr } from '@/lib/social';
import { Hero } from '@/components/Hero';
import { TrackList } from '@/components/TrackList';
import { PlayButton } from '@/components/PlayButton';
import { LikeButton } from '@/components/LikeButton';
import { OfflineToggle } from '@/components/OfflineToggle';
import { Shelf } from '@/components/Shelf';
import { AlbumCard } from '@/components/Cards';
import { TrackListSkeleton } from '@/components/Skeleton';

export default function Album() {
  const { id } = useParams();
  const { data: album, isLoading } = useAlbum(id);
  const { data: artist } = useArtist(album?.artist.id);
  const [params] = useSearchParams();
  const t = useT();
  const lang = useI18n((s) => s.lang);
  const user = useAuth((s) => s.user);
  const openMenu = useUI((s) => s.openMenu);
  const current = usePlayer((s) => s.queue[s.index]);
  const playing = usePlayer((s) => s.playing);
  const context = usePlayer((s) => s.context);
  const p = usePlayer.getState();
  const isThis = context === `album:${id}` && !!current;

  useEffect(() => {
    const tr = params.get('track');
    if (tr && album) { const i = album.tracks.findIndex((x) => x.id === tr); if (i >= 0) document.querySelectorAll('.track-row')[i]?.scrollIntoView({ block: 'center' }); }
  }, [album, params]);

  if (isLoading || !album) return <div className="page pt-8"><TrackListSkeleton /></div>;
  const kind = album.type === 'single' ? t('single') : album.type === 'ep' ? t('ep') : album.type === 'compilation' ? t('compilation') : t('album');
  const others = (artist?.albums ?? []).filter((a) => a.id !== album.id);

  return (
    <div>
      <Hero kind={kind} title={album.title} cover={album.coverUrl} description={album.description}
        meta={<>
          <Link to={`/artist/${album.artist.id}`} className="md-title-sm hover:underline">{album.artist.name}</Link>
          {album.year && <span>· {album.year}</span>}
          <span>· {tracksWord(album.trackCount, lang)}, {fmtDurationLong(album.durationMs, lang)}</span>
        </>}>
        <PlayButton size="lg" playing={isThis && playing} onClick={() => (isThis ? p.toggle() : p.playTracks(album.tracks, 0, `album:${album.id}`))} />
        <M3eButton variant="tonal" onClick={() => { if (!p.shuffle) p.toggleShuffle(); p.playTracks(album.tracks, Math.floor(Math.random() * album.tracks.length), `album:${album.id}`); }}><m3e-icon variant="rounded" slot="icon" name="shuffle" />{t('shuffle')}</M3eButton>
        <LikeButton type="album" id={album.id} alwaysVisible buttonSize="medium" />
        {user && <M3eIconButton variant="outlined" size="medium" href={albumZipUrl(album.id)} title={t('downloadAll')}><m3e-icon variant="rounded" name="download" /></M3eIconButton>}
        <OfflineToggle tracks={album.tracks} />
        <M3eIconButton size="medium" aria-label="menu" onClick={(e: any) => openMenu(e.clientX, e.clientY, { kind: 'album', album })}><m3e-icon variant="rounded" name="more_vert" /></M3eIconButton>
      </Hero>
      <div className="page">
        {user && <AlbumCheck id={album.id} />}
        <TrackList tracks={album.tracks} context={`album:${album.id}`} showAlbum={false} showCover={false} />
        {album.label && <p className="md-body-sm muted mt-6">© {album.label}</p>}
        {others.length > 0 && <div className="mt-10"><Shelf title={`${t('more')} · ${album.artist.name}`} to={`/artist/${album.artist.id}`}>{others.map((a) => <AlbumCard key={a.id} album={a} />)}</Shelf></div>}
      </div>
    </div>
  );
}

interface Completeness { checkable: boolean; total: number; have: number; missing: Array<{ id: number; title: string }>; deezerId: number | null }

/** Is every song of the release on the server? If not — which ones are missing, and a button to fetch them. */
function AlbumCheck({ id }: { id: string }) {
  const tr = useTr();
  const qc = useQueryClient();
  const toast = useUI((s) => s.toast);
  const [busy, setBusy] = useState(false);
  const { data: c, isFetching, refetch } = useQuery({ queryKey: ['album-check', id], staleTime: 60_000, retry: false, queryFn: () => api.get<Completeness>(`/api/albums/${id}/completeness`) });
  if (!c?.checkable) return null;
  const fetchMissing = async () => {
    setBusy(true);
    try {
      await api.post('/api/catalog/acquire', { kind: 'album', id: c.deezerId });
      toast(tr('Докачиваю недостающие треки — они появятся здесь сами', 'Fetching the missing tracks — they will show up here'), 'success');
      qc.invalidateQueries({ queryKey: ['acquire-jobs'] });
    } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  if (!c.missing.length) {
    return (
      <div className="flex items-center gap-2 mb-2 md-body-sm muted">
        <m3e-icon variant="rounded" name="verified" style={{ color: 'var(--md-sys-color-tertiary)' }} />
        {tr(`Альбом целый: все ${c.total} на месте`, `Complete: all ${c.total} tracks are here`)}
        <M3eButton variant="text" disabled={isFetching || undefined} onClick={() => void refetch()}>{tr('Проверить целостность', 'Check completeness')}</M3eButton>
      </div>
    );
  }
  return (
    <section className="rounded-[24px] p-4 mb-4 bg-error-container text-on-error-container">
      <div className="md-title-md emph">{tr(`На сервере ${c.have} из ${c.total} треков`, `${c.have} of ${c.total} tracks are on the server`)}</div>
      <p className="md-body-sm opacity-90 mt-1 line-2">{tr('Не хватает', 'Missing')}: {c.missing.map((m) => m.title).join(', ')}</p>
      <div className="flex flex-wrap gap-2 mt-3">
        <M3eButton variant="filled" disabled={busy || undefined} onClick={() => void fetchMissing()}><m3e-icon variant="rounded" slot="icon" name="download" />{tr('Докачать альбом', 'Fetch the rest')}</M3eButton>
        <M3eButton variant="text" disabled={isFetching || undefined} onClick={() => void refetch()}>{tr('Проверить ещё раз', 'Check again')}</M3eButton>
      </div>
    </section>
  );
}
