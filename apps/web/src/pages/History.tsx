import { useQueryClient } from '@tanstack/react-query';
import { Clock, Trash2 } from 'lucide-react';
import { useHistory } from '@/lib/queries';
import { api } from '@/lib/api';
import { useI18n, useT } from '@/lib/i18n';
import { TrackList } from '@/components/TrackList';
import { EmptyState } from '@/components/EmptyState';
import { TrackListSkeleton } from '@/components/Skeleton';

export default function History() {
  const { data, isLoading } = useHistory();
  const qc = useQueryClient();
  const t = useT();
  const lang = useI18n((s) => s.lang);
  const groups = new Map<string, typeof data>();
  for (const h of data ?? []) {
    const d = new Date(h.playedAt).toLocaleDateString(lang === 'en' ? 'en-US' : 'ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
    if (!groups.has(d)) groups.set(d, []);
    groups.get(d)!.push(h);
  }
  return (
    <div className="page pt-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl md:text-3xl font-extrabold flex items-center gap-3"><Clock />{t('history')}</h1>
        {!!data?.length && <button className="btn btn-ghost !h-9" onClick={async () => { if (!confirm(t('confirmDelete'))) return; await api.del('/api/me/history'); qc.invalidateQueries({ queryKey: ['history'] }); qc.invalidateQueries({ queryKey: ['home'] }); }}><Trash2 size={16} />{t('clearHistory')}</button>}
      </div>
      {isLoading ? <TrackListSkeleton /> : !data?.length ? <EmptyState icon={<Clock />} title={t('nothingFound')} /> : (
        [...groups.entries()].map(([day, items]) => (
          <section key={day} className="mb-6">
            <h2 className="font-bold capitalize mb-2 text-muted">{day}</h2>
            <TrackList tracks={items!.map((h) => h.track)} context="history" numbered={false} header={false} />
          </section>
        ))
      )}
    </div>
  );
}
