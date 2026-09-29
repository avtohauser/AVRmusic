import { useParams } from 'react-router-dom';
import { M3eButton } from '@/md';
import { useCatalogArtist } from '@/lib/queries';
import { useI18n, useT } from '@/lib/i18n';
import { fmtNumber } from '@/lib/format';
import { Hero } from '@/components/Hero';
import { Shelf } from '@/components/Shelf';
import { TrackListSkeleton } from '@/components/Skeleton';
import { AcquireButton, CatalogAlbumCard, CatalogArtistCard, CatalogTrackRow } from '@/components/Catalog';
import { EmptyState } from '@/components/EmptyState';

export default function CatalogArtist() {
  const { id } = useParams();
  const { data, isLoading, error } = useCatalogArtist(id ? Number(id) : undefined);
  const t = useT();
  const lang = useI18n((s) => s.lang);
  if (error) return <div className="page pt-10"><EmptyState icon="error" title={(error as any).message} /></div>;
  if (isLoading || !data) return <div className="page pt-8"><TrackListSkeleton /></div>;
  const a = data.artist;
  return (
    <div>
      <Hero kind={`${t('catalog')} · ${t('artist')}`} title={a.name} cover={a.imageUrl} round
        meta={<><m3e-icon variant="rounded" name="verified" filled style={{ color: 'var(--md-sys-color-primary)', ['--m3e-icon-size' as any]: '18px' }} /><span>{fmtNumber(a.fans, lang)} {t('fans')}</span><span>· {a.albumCount} {t('releases')}</span></>}>
        <AcquireButton kind="artist" id={a.id} title={`${a.name} — дискография`} label />
        {a.libraryArtistId && <M3eButton variant="tonal" href={`/artist/${a.libraryArtistId}`}><m3e-icon variant="rounded" slot="icon" name="library_music" />{t('openInLibrary')}</M3eButton>}
      </Hero>
      <div className="page">
        {data.topTracks.length > 0 && <><h2 className="md-headline-sm emph flow-soft mb-2">{t('popular')}</h2><div className="mb-8">{data.topTracks.map((tr, i) => <CatalogTrackRow key={tr.id} track={tr} index={i} />)}</div></>}
        {data.albums.length > 0 && <Shelf title={t('discography')}>{data.albums.map((al) => <CatalogAlbumCard key={al.id} album={al} />)}</Shelf>}
        {data.singles.length > 0 && <Shelf title={`${t('single')} & ${t('ep')}`}>{data.singles.map((al) => <CatalogAlbumCard key={al.id} album={al} />)}</Shelf>}
        {data.compilations.length > 0 && <Shelf title={t('compilation')}>{data.compilations.map((al) => <CatalogAlbumCard key={al.id} album={al} />)}</Shelf>}
        {data.appearsOn.length > 0 && <><h2 className="md-headline-sm emph flow-soft mb-2">{t('appearsOn')}</h2><div className="mb-8">{data.appearsOn.map((tr) => <CatalogTrackRow key={tr.id} track={tr} />)}</div></>}
        {data.related.length > 0 && <Shelf title={t('related')}>{data.related.map((r) => <CatalogArtistCard key={r.id} artist={r} />)}</Shelf>}
      </div>
    </div>
  );
}
