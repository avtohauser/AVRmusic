import { Link, useParams } from 'react-router-dom';
import { M3eButton } from '@/md';
import { useCatalogAlbum } from '@/lib/queries';
import { useI18n, useT } from '@/lib/i18n';
import { fmtDurationLong, tracksWord } from '@/lib/format';
import { Hero } from '@/components/Hero';
import { TrackListSkeleton } from '@/components/Skeleton';
import { AcquireButton, CatalogTrackRow } from '@/components/Catalog';
import { EmptyState } from '@/components/EmptyState';

export default function CatalogAlbum() {
  const { id } = useParams();
  const { data: al, isLoading, error } = useCatalogAlbum(id ? Number(id) : undefined);
  const t = useT();
  const lang = useI18n((s) => s.lang);
  if (error) return <div className="page pt-10"><EmptyState icon="error" title={(error as any).message} /></div>;
  if (isLoading || !al) return <div className="page pt-8"><TrackListSkeleton /></div>;
  const kind = al.type === 'single' ? t('single') : al.type === 'ep' ? t('ep') : al.type === 'compilation' ? t('compilation') : t('album');
  const full = al.tracks.length > 0 && al.inLibrary >= al.tracks.length;
  return (
    <div>
      <Hero kind={`${t('catalog')} · ${kind}`} title={al.title} cover={al.coverUrl}
        meta={<>
          <Link to={`/catalog/artist/${al.artist.id}`} className="md-title-sm hover:underline">{al.artist.name}</Link>
          {al.year && <span>· {al.year}</span>}
          <span>· {tracksWord(al.tracks.length, lang)}{al.durationMs ? `, ${fmtDurationLong(al.durationMs, lang)}` : ''}</span>
          {al.genres.length > 0 && <span>· {al.genres.join(', ')}</span>}
          {al.inLibrary > 0 && <span className="text-tertiary">· {t('inLibrary')}: {al.inLibrary}/{al.tracks.length}</span>}
        </>}>
        <AcquireButton kind="album" id={al.id} title={`${al.artist.name} — ${al.title} (альбом)`} done={full} label />
        {al.libraryAlbumId && <M3eButton variant="tonal" href={`/album/${al.libraryAlbumId}`}><m3e-icon variant="rounded" slot="icon" name="library_music" />{t('openInLibrary')}</M3eButton>}
      </Hero>
      <div className="page">
        {al.tracks.map((tr, i) => <CatalogTrackRow key={tr.id} track={tr} index={i} showAlbum={false} />)}
        {al.label && <p className="md-body-sm muted mt-6">© {al.label}</p>}
      </div>
    </div>
  );
}
