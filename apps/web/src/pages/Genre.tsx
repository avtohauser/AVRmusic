import { useParams } from 'react-router-dom';
import { Shuffle } from 'lucide-react';
import { useGenre } from '@/lib/queries';
import { usePlayer } from '@/stores/player';
import { useI18n, useT } from '@/lib/i18n';
import { tracksWord } from '@/lib/format';
import { TrackList } from '@/components/TrackList';
import { PlayButton } from '@/components/PlayButton';
import { Shelf } from '@/components/Shelf';
import { AlbumCard, ArtistCard } from '@/components/Cards';
import { TrackListSkeleton } from '@/components/Skeleton';

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
          <div className="text-xs uppercase tracking-wider font-semibold">{t('genre')}</div>
          <h1 className="text-4xl md:text-6xl font-extrabold mt-1">{genre.name}</h1>
          <div className="text-sm mt-2 text-fg/80">{tracksWord(genre.trackCount, lang)}</div>
          <div className="flex items-center gap-3 mt-6">
            <PlayButton size="lg" onClick={() => p.playTracks(tracks, 0, `genre:${genre.slug}`)} />
            <button className="icon-btn" onClick={() => { if (!p.shuffle) p.toggleShuffle(); p.playTracks(tracks, Math.floor(Math.random() * tracks.length), `genre:${genre.slug}`); }}><Shuffle size={22} /></button>
          </div>
        </div>
      </div>
      <div className="page">
        {artists.length > 0 && <Shelf title={t('artists')}>{artists.map((a) => <ArtistCard key={a.id} artist={a} />)}</Shelf>}
        {albums.length > 0 && <Shelf title={t('albums')}>{albums.map((a) => <AlbumCard key={a.id} album={a} />)}</Shelf>}
        <h2 className="text-xl font-bold mb-2">{t('popular')}</h2>
        <TrackList tracks={tracks} context={`genre:${genre.slug}`} />
      </div>
    </div>
  );
}
