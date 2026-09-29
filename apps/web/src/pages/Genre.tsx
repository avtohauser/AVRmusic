import { useParams } from 'react-router-dom';
import { M3eIconButton } from '@/md';
import { useGenre } from '@/lib/queries';
import { usePlayer } from '@/stores/player';
import { useI18n, useT } from '@/lib/i18n';
import { tracksWord } from '@/lib/format';
import { TrackList } from '@/components/TrackList';
import { PlayButton } from '@/components/PlayButton';
import { Shelf } from '@/components/Shelf';
import { AlbumCard, ArtistCard } from '@/components/Cards';
import { TrackListSkeleton } from '@/components/Skeleton';
import { FlowText } from '@/components/FlowText';

export default function Genre() {
  const { slug } = useParams();
  const { data, isLoading } = useGenre(slug);
  const t = useT();
  const lang = useI18n((s) => s.lang);
  const p = usePlayer.getState();
  if (isLoading || !data) return <div className="page pt-8"><TrackListSkeleton /></div>;
  const { genre, tracks, albums, artists } = data;
  return (
    <div>
      <div className="relative -mt-16 pt-16 mb-6">
        <div className="hero-bg" style={{ ['--hero' as any]: genre.color }} />
        <div className="page pt-10 md:pt-16">
          <div className="md-label-lg uppercase tracking-wider muted">{t('genre')}</div>
          <FlowText as="h1" text={genre.name} className="md-display-md emph mt-1" />
          <div className="md-body-md mt-2">{tracksWord(genre.trackCount, lang)}</div>
          <div className="flex items-center gap-3 mt-6">
            <PlayButton size="lg" onClick={() => p.playTracks(tracks, 0, `genre:${genre.slug}`)} />
            <M3eIconButton variant="tonal" size="medium" title={t('shuffle')} onClick={() => { if (!p.shuffle) p.toggleShuffle(); p.playTracks(tracks, Math.floor(Math.random() * tracks.length), `genre:${genre.slug}`); }}><m3e-icon variant="rounded" name="shuffle" /></M3eIconButton>
          </div>
        </div>
      </div>
      <div className="page">
        {artists.length > 0 && <Shelf title={t('artists')}>{artists.map((a) => <ArtistCard key={a.id} artist={a} />)}</Shelf>}
        {albums.length > 0 && <Shelf title={t('albums')}>{albums.map((a) => <AlbumCard key={a.id} album={a} />)}</Shelf>}
        <h2 className="md-headline-sm emph flow-soft mb-2">{t('popular')}</h2>
        <TrackList tracks={tracks} context={`genre:${genre.slug}`} />
      </div>
    </div>
  );
}
