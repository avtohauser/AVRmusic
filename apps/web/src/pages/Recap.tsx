// The listener's month or year in numbers: minutes, favourites, the hour of the day music plays most.
import { useState } from 'react';
import { M3eButtonSegment, M3eIconButton, M3eSegmentedButton } from '@/md';
import { useI18n } from '@/lib/i18n';
import { fmtNumber } from '@/lib/format';
import { usePlayer } from '@/stores/player';
import { useRecap, useTr } from '@/lib/social';
import { ArtistCard } from '@/components/Cards';
import { Shelf } from '@/components/Shelf';
import { Cover } from '@/components/Cover';
import { EmptyState } from '@/components/EmptyState';
import { TrackListSkeleton } from '@/components/Skeleton';

const PERSONALITY: Record<string, [string, string, string, string]> = {
  explorer: ['Первооткрыватель', 'Explorer', 'Больше половины исполнителей — новые для вас', 'Most of your artists were new to you'],
  fan: ['Преданный фанат', 'Devoted fan', 'Один исполнитель занял огромную часть времени', 'One artist took a huge share of your time'],
  repeat: ['Повтор — мать учения', 'On repeat', 'Любимые треки звучали снова и снова', 'Your favourites played again and again'],
  night: ['Ночная птица', 'Night owl', 'Много музыки после полуночи', 'Lots of music after midnight'],
  chameleon: ['Хамелеон', 'Chameleon', 'Жанры на любой вкус', 'Genres of every kind'],
  connoisseur: ['Ценитель', 'Connoisseur', 'Свой проверенный вкус', 'A taste of your own'],
};

export default function Recap() {
  const [period, setPeriod] = useState<'month' | 'year'>('month');
  const [offset, setOffset] = useState(0);
  const { data: r, isLoading, error } = useRecap(period, offset);
  const tr = useTr();
  const lang = useI18n((s) => s.lang);
  const play = usePlayer.getState().playTracks;
  const p = r ? PERSONALITY[r.personality] : null;
  const maxHour = r ? Math.max(1, ...r.hours) : 1;
  const delta = r && r.previousMinutes ? Math.round(((r.minutes - r.previousMinutes) / r.previousMinutes) * 100) : null;
  return (
    <div className="page pt-4">
      <div className="flex items-center gap-3 flex-wrap mb-6">
        <h1 className="md-headline-lg emph mr-auto">{tr('Итоги', 'Recap')}</h1>
        <M3eSegmentedButton onChange={(e: Event) => { const v = (e.target as any)?.value; if (v) { setPeriod(v); setOffset(0); } }}>
          <M3eButtonSegment value="month" checked={period === 'month' || undefined}>{tr('Месяц', 'Month')}</M3eButtonSegment>
          <M3eButtonSegment value="year" checked={period === 'year' || undefined}>{tr('Год', 'Year')}</M3eButtonSegment>
        </M3eSegmentedButton>
        <div className="flex items-center">
          <M3eIconButton aria-label="prev" onClick={() => setOffset(offset + 1)}><m3e-icon variant="rounded" name="chevron_left" /></M3eIconButton>
          <span className="md-title-md min-w-28 text-center">{r?.label ?? '…'}</span>
          <M3eIconButton aria-label="next" disabled={offset === 0 || undefined} onClick={() => setOffset(Math.max(0, offset - 1))}><m3e-icon variant="rounded" name="chevron_right" /></M3eIconButton>
        </div>
      </div>
      {error && <EmptyState icon="error" title={(error as any).message} />}
      {isLoading && <TrackListSkeleton />}
      {r && !r.plays && <EmptyState icon="leaderboard" title={tr('За это время ничего не слушали', 'Nothing played in this period')} />}
      {r && r.plays > 0 && (
        <div className="fade-in">
          <section className="rounded-[36px] p-6 md:p-8 mb-6 bg-primary-container text-on-primary-container">
            <div className="md-label-lg uppercase opacity-80">{tr('Вы слушали', 'You listened for')}</div>
            <div className="md-display-lg emph tabular-nums">{fmtNumber(r.minutes, lang)} <span className="md-headline-md">{tr('мин', 'min')}</span></div>
            {delta != null && <div className="md-body-lg opacity-80">{delta >= 0 ? '↑' : '↓'} {Math.abs(delta)}% {tr('к прошлому периоду', 'vs. the previous period')}</div>}
            {p && <div className="mt-4"><div className="md-headline-sm emph">{tr(p[0], p[1])}</div><div className="md-body-md opacity-80">{tr(p[2], p[3])}</div></div>}
          </section>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
            {([
              [tr('Прослушиваний', 'Plays'), r.plays], [tr('Разных треков', 'Different tracks'), r.distinctTracks], [tr('Исполнителей', 'Artists'), r.distinctArtists],
              [tr('Новых исполнителей', 'New artists'), r.newArtists], [tr('Жанров', 'Genres'), r.genres], [tr('Дней с музыкой', 'Days with music'), r.activeDays],
              [tr('Серия дней подряд', 'Day streak'), r.streakDays], [tr('Открытий', 'Discoveries'), r.discoveries],
            ] as Array<[string, number]>).map(([label, n]) => (
              <div key={label} className="surface-low rounded-[24px] p-4"><div className="md-label-md muted uppercase line-1">{label}</div><div className="md-headline-md emph tabular-nums">{fmtNumber(n, lang)}</div></div>
            ))}
          </div>
          {r.topTracks.length > 0 && (
            <section className="mb-8">
              <h2 className="md-headline-sm emph mb-3">{tr('Главные треки', 'Top tracks')}</h2>
              <div className="space-y-1">
                {r.topTracks.slice(0, 10).map((x, i) => (
                  <button key={x.track.id} className="w-full flex items-center gap-3 p-2 rounded-[20px] state-layer text-left" onClick={() => play(r.topTracks.map((y) => y.track), i, 'recap')}>
                    <span className="w-7 text-center md-title-md emph tabular-nums text-primary">{i + 1}</span>
                    <Cover src={x.track.coverUrl} className="w-12 h-12 !rounded-[12px]" />
                    <span className="min-w-0 flex-1"><span className="block md-title-sm line-1">{x.track.title}</span><span className="block md-body-sm muted line-1">{x.track.artist.name}</span></span>
                    <span className="md-body-sm muted tabular-nums">{x.plays}× · {x.minutes} {tr('мин', 'min')}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
          {r.topArtists.length > 0 && <Shelf title={tr('Главные исполнители', 'Top artists')}>{r.topArtists.map((x) => <ArtistCard key={x.artist.id} artist={x.artist} />)}</Shelf>}
          {r.topGenres.length > 0 && <section className="mb-8"><h2 className="md-headline-sm emph mb-3">{tr('Жанры', 'Genres')}</h2><div className="flex flex-wrap gap-2">{r.topGenres.map((g) => <span key={g.name} className="px-3 py-1.5 rounded-full bg-secondary-container text-on-secondary-container md-label-lg">{g.name} · {Math.round(g.share * 100)}%</span>)}</div></section>}
          <section className="surface-low rounded-[28px] p-5 mb-8">
            <h2 className="md-title-lg emph mb-1">{tr('Когда вы слушаете', 'When you listen')}</h2>
            {r.peakHour != null && <p className="md-body-md muted mb-3">{tr(`Чаще всего — около ${r.peakHour}:00`, `Most often around ${r.peakHour}:00`)}{r.busiestDay ? tr(` · самый музыкальный день ${new Date(r.busiestDay.date).toLocaleDateString('ru')} (${r.busiestDay.minutes} мин)`, ` · busiest day ${new Date(r.busiestDay.date).toLocaleDateString('en')} (${r.busiestDay.minutes} min)`) : ''}</p>}
            <div className="flex items-end gap-1 h-28">
              {r.hours.map((h, i) => <div key={i} className="flex-1 rounded-t-[6px] bg-primary" style={{ height: `${Math.max(3, (h / maxHour) * 100)}%`, opacity: i === r.peakHour ? 1 : 0.45 }} title={`${i}:00 · ${h} ${tr('мин', 'min')}`} />)}
            </div>
            <div className="flex justify-between md-label-sm muted mt-1"><span>0</span><span>6</span><span>12</span><span>18</span><span>23</span></div>
          </section>
          {r.firstTrack && <p className="md-body-md muted">{tr('Первым в этом периоде прозвучал', 'The first track of this period was')} «{r.firstTrack.title}» — {r.firstTrack.artist.name}</p>}
        </div>
      )}
    </div>
  );
}
