// "Предложка": new music picked for you from the catalogue — fresh releases of the artists you listen
// to and tracks of related artists. Not in the library yet: preview it, then add it with one tap.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Suggestions } from '@avrmusic/shared';
import { api } from '@/lib/api';
import { M3eButton } from '@/md';
import { CatalogAlbumCard, CatalogTrackRow } from '@/components/Catalog';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/Skeleton';
import { FlowText } from '@/components/FlowText';

export default function Discover() {
  const qc = useQueryClient();
  const { data, isLoading, isFetching } = useQuery({ queryKey: ['suggestions'], queryFn: () => api.get<Suggestions>('/api/suggestions'), staleTime: 30 * 60_000 });
  const refresh = async () => qc.setQueryData(['suggestions'], await api.get<Suggestions>('/api/suggestions?fresh=1'));
  return (
    <div className="page pt-4">
      <div className="flex items-center gap-3 mb-1">
        <FlowText as="h1" text="Предложка" className="md-headline-lg emph flex-1" />
        <M3eButton variant="tonal" disabled={isFetching || undefined} onClick={() => void refresh()}><m3e-icon variant="rounded" slot="icon" name="refresh" />Обновить</M3eButton>
      </div>
      <p className="md-body-md muted mb-6">Новое по вашему вкусу из каталога: послушайте превью и добавьте на сервер в одно касание.</p>
      {isLoading && <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>}
      {data && !data.releases.length && !data.tracks.length && <EmptyState icon="explore" title="Пока нечего предложить" hint="Послушайте и полайкайте что-нибудь — предложка учится на вашем вкусе" />}
      {data && data.releases.length > 0 && (
        <section className="mb-8">
          <h2 className="md-headline-sm emph flow-soft mb-3">Новые релизы ваших исполнителей</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
            {data.releases.map((a) => <div key={a.id}><CatalogAlbumCard album={a} /><div className="md-body-sm muted line-1 mt-1 px-1">{a.reason}</div></div>)}
          </div>
        </section>
      )}
      {data && data.tracks.length > 0 && (
        <section>
          <h2 className="md-headline-sm emph flow-soft mb-3">Похоже на то, что вы слушаете</h2>
          {data.tracks.map((t, i) => (
            <div key={t.id}>
              {(i === 0 || data.tracks[i - 1].reason !== t.reason) && <div className="md-label-lg muted mt-3 mb-1 px-2">{t.reason}</div>}
              <CatalogTrackRow track={t} />
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
