import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { M3eButton, M3eIconButton } from '@/md';
import { useArtist } from '@/lib/queries';
import { usePlayer } from '@/stores/player';
import { useLikes } from '@/stores/likes';
import { useAuth } from '@/stores/auth';
import { useI18n, useT } from '@/lib/i18n';
import { fmtNumber } from '@/lib/format';
import { Hero } from '@/components/Hero';
import { TrackList } from '@/components/TrackList';
import { PlayButton } from '@/components/PlayButton';
import { Shelf } from '@/components/Shelf';
import { AlbumCard, ArtistCard } from '@/components/Cards';
import { TrackListSkeleton } from '@/components/Skeleton';

export default function Artist() {
  const { id } = useParams();
  const { data: a, isLoading } = useArtist(id);
  const t = useT();
  const lang = useI18n((s) => s.lang);
  const user = useAuth((s) => s.user);
  const info = useAuth((s) => s.info);
  const liked = useLikes((s) => (id ? s.ids.artist.has(id) : false));
  const toggle = useLikes((s) => s.toggle);
  const [showAll, setShowAll] = useState(false);
  const current = usePlayer((s) => s.queue[s.index]);
  const playing = usePlayer((s) => s.playing);
  const context = usePlayer((s) => s.context);
  const p = usePlayer.getState();
  if (isLoading || !a) return <div className="page pt-8"><TrackListSkeleton /></div>;
  const isThis = context === `artist:${id}` && !!current;
  const albums = a.albums.filter((x) => x.type === 'album' || x.type === 'compilation');
  const singles = a.albums.filter((x) => x.type === 'single' || x.type === 'ep');
  return (
    <div>
      <Hero kind={t('artist')} title={a.name} cover={a.imageUrl} round header={a.headerUrl}
        meta={<>
          {a.verified && <m3e-icon variant="rounded" name="verified" filled style={{ color: 'var(--md-sys-color-primary)', ['--m3e-icon-size' as any]: '18px' }} />}
          <span>{fmtNumber(a.monthlyListeners, lang)} {t('monthlyListeners')}</span>
          <span>· {fmtNumber(a.followers, lang)} {t('followers')}</span>
        </>}>
        <PlayButton size="lg" playing={isThis && playing} onClick={() => (isThis ? p.toggle() : p.playTracks(a.topTracks, 0, `artist:${a.id}`))} />
        <M3eIconButton variant="tonal" size="medium" title={t('shuffle')} onClick={() => { if (!p.shuffle) p.toggleShuffle(); p.playTracks(a.topTracks, 0, `artist:${a.id}`); }}><m3e-icon variant="rounded" name="shuffle" /></M3eIconButton>
        {user && <M3eButton variant={liked ? 'filled' : 'outlined'} onClick={() => toggle('artist', a.id)}><m3e-icon variant="rounded" slot="icon" name={liked ? 'check' : 'add'} />{liked ? t('following') : t('follow')}</M3eButton>}
        {info?.catalog && <M3eButton variant="text" href={a.deezerId ? `/catalog/artist/${a.deezerId}` : `/search?scope=catalog&q=${encodeURIComponent(a.name)}`}><m3e-icon variant="rounded" slot="icon" name="public" />{t('openInCatalog')}</M3eButton>}
      </Hero>
      <div className="page">
        <h2 className="md-headline-sm emph flow-soft mb-2">{t('popular')}</h2>
        <TrackList tracks={showAll ? a.topTracks : a.topTracks.slice(0, 5)} context={`artist:${a.id}`} showAlbum />
        {a.topTracks.length > 5 && <M3eButton variant="text" className="mt-2" onClick={() => setShowAll(!showAll)}>{showAll ? t('close') : t('showAll')}</M3eButton>}
        <div className="mt-8">
          {albums.length > 0 && <Shelf title={t('discography')}>{albums.map((al) => <AlbumCard key={al.id} album={al} />)}</Shelf>}
          {singles.length > 0 && <Shelf title={`${t('single')} & ${t('ep')}`}>{singles.map((al) => <AlbumCard key={al.id} album={al} />)}</Shelf>}
          {a.appearsOn.length > 0 && <Shelf title={t('appearsOn')}>{a.appearsOn.map((al) => <AlbumCard key={al.id} album={al} />)}</Shelf>}
          {a.related.length > 0 && <Shelf title={t('related')}>{a.related.map((r) => <ArtistCard key={r.id} artist={r} />)}</Shelf>}
        </div>
        {a.bio && (
          <section className="mt-4 mb-8 max-w-3xl">
            <h2 className="md-headline-sm emph flow-soft mb-3">{t('about')}</h2>
            <div className="surface-low rounded-[28px] p-5 whitespace-pre-wrap md-body-lg">{a.bio}</div>
          </section>
        )}
      </div>
    </div>
  );
}
