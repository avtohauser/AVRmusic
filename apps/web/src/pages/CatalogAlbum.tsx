import { Link, useParams } from 'react-router-dom';
import { Library } from 'lucide-react';
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
  if (error) return <div className="page pt-10"><EmptyState title={(error as any).message} /></div>;
  if (isLoading || !al) return <div className="page pt-8"><TrackListSkeleton /></div>;
  const kind = al.type === 'single' ? t('single') : al.type === 'ep' ? t('ep') : al.type === 'compilation' ? t('compilation') : t('album');
  const full = al.tracks.length > 0 && al.inLibrary >= al.tracks.length;
  return (
    <div>
      <Hero kind={`${t('catalog')} · ${kind}`} title={al.title} cover={al.coverUrl}
        meta={<>
          <Link to={`/catalog/artist/${al.artist.id}`} className="font-semibold hover:underline">{al.artist.name}</Link>
          {al.year && <span>· {al.year}</span>}
          <span>· {tracksWord(al.tracks.length, lang)}{al.durationMs ? `, ${fmtDurationLong(al.durationMs, lang)}` : ''}</span>
          {al.genres.length > 0 && <span>· {al.genres.join(', ')}</span>}
          {al.inLibrary > 0 && <span className="text-emerald-400">· {t('inLibrary')}: {al.inLibrary}/{al.tracks.length}</span>}
        </>}>
        <AcquireButton kind="album" id={al.id} title={`${al.artist.name} — ${al.title} (альбом)`} done={full} label />
        {al.libraryAlbumId && <Link to={`/album/${al.libraryAlbumId}`} className="btn btn-outline !h-9"><Library size={16} />{t('openInLibrary')}</Link>}
      </Hero>
      <div className="page">
        {al.tracks.map((tr, i) => <CatalogTrackRow key={tr.id} track={tr} index={i} showAlbum={false} />)}
        {al.label && <p className="text-xs text-muted mt-6">© {al.label}</p>}
      </div>
    </div>
  );
}
