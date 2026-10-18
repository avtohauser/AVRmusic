import { useMemo, useRef, useState } from 'react';
import { M3eFilterChip, M3eFilterChipSet, M3eIconButton } from '@/md';
import type { Track } from '@avrmusic/shared';
import { useLikedTracks, useSuperTracks } from '@/lib/queries';
import { usePlayer } from '@/stores/player';
import { useAuth } from '@/stores/auth';
import { useI18n, useT } from '@/lib/i18n';
import { useTr } from '@/lib/social';
import { fmtDurationLong, tracksWord } from '@/lib/format';
import { TrackList } from '@/components/TrackList';
import { PlayButton } from '@/components/PlayButton';
import { OfflineToggle } from '@/components/OfflineToggle';
import { EmptyState } from '@/components/EmptyState';
import { TrackListSkeleton } from '@/components/Skeleton';
import { FlowText } from '@/components/FlowText';
import { SuperStar } from '@/components/LikeButton';

type Sort = 'recent' | 'oldest' | 'title' | 'artist' | 'album';
const SORTS: Sort[] = ['recent', 'oldest', 'title', 'artist', 'album'];

const sortKey = (starred: boolean) => `avr.liked.sort.${starred ? 'super' : 'all'}`;
const savedSort = (starred: boolean): Sort => { try { const v = localStorage.getItem(sortKey(starred)) as Sort; return SORTS.includes(v) ? v : 'recent'; } catch { return 'recent'; } };

/** Liked songs, or only the superliked ones ([starred]); a long list is searched and sorted right here. */
export default function Liked({ starred = false }: { starred?: boolean }) {
  const liked = useLikedTracks();
  const supers = useSuperTracks();
  const { data, isLoading } = starred ? supers : liked;
  const t = useT();
  const tr = useTr();
  const lang = useI18n((s) => s.lang);
  const user = useAuth((s) => s.user);
  const context = usePlayer((s) => s.context);
  const playing = usePlayer((s) => s.playing);
  const p = usePlayer.getState();
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [sort, setSortState] = useState<Sort>(() => savedSort(starred));
  const setSort = (s: Sort) => {
    try { localStorage.setItem(sortKey(starred), s); } catch { /* ignore */ }
    setSortState(s);
  };
  const all = data ?? [];
  const tracks = useMemo(() => arrange(all, query, sort, lang), [all, query, sort, lang]);
  const ctx = starred ? 'superliked' : 'liked';
  const isThis = context === ctx;
  const title = starred ? tr('Суперлайки', 'Superlikes') : t('likedSongs');
  const sortNames: Record<Sort, string> = {
    recent: tr('Сначала новые', 'Newest first'), oldest: tr('Сначала старые', 'Oldest first'),
    title: tr('По названию', 'By title'), artist: tr('По исполнителю', 'By artist'), album: tr('По альбому', 'By album'),
  };
  return (
    <div>
      <div className="relative -mt-16 pt-16 mb-6">
        <div className="hero-bg" />
        <div className="page pt-6 md:pt-10 flex flex-col sm:flex-row sm:items-end gap-6">
          <div className="w-44 h-44 md:w-56 md:h-56 rounded-[28px] bg-primary text-on-primary flex items-center justify-center elev-3 mx-auto sm:mx-0" style={{ ...(starred ? { background: 'linear-gradient(135deg, #0B4248, #1d5d63)' } : {}), viewTransitionName: starred ? 'super-box' : 'likes-box' }}>
            <span className="flex" style={{ viewTransitionName: starred ? 'super-mark' : 'likes-mark' }}>{starred ? <SuperStar className="w-28 h-28" /> : <m3e-icon variant="rounded" name="favorite" filled style={{ ['--m3e-icon-size' as any]: '96px' }} />}</span>
          </div>
          <div className="text-center sm:text-left">
            <div className="md-label-lg muted uppercase tracking-wider">{t('playlist')}</div>
            <div style={{ viewTransitionName: starred ? 'super-title' : 'likes-title', width: 'fit-content' }} className="mx-auto sm:mx-0"><FlowText as="h1" text={title} className="md-display-md emph mt-1" /></div>
            <div className="md-body-md mt-3"><span className="md-title-sm">{user?.displayName}</span> · {tracksWord(all.length, lang)}{all.length ? `, ${fmtDurationLong(all.reduce((s, x) => s + x.durationMs, 0), lang)}` : ''}</div>
          </div>
        </div>
        {all.length > 0 && (
          <div className="page flex flex-wrap items-center gap-3 mt-6 justify-center sm:justify-start">
            <PlayButton size="lg" playing={isThis && playing} onClick={() => (isThis ? p.toggle() : tracks.length && p.playTracks(tracks, 0, ctx))} />
            <M3eIconButton variant="tonal" size="medium" title={t('shuffle')} onClick={() => { if (!tracks.length) return; if (!p.shuffle) p.toggleShuffle(); p.playTracks(tracks, Math.floor(Math.random() * tracks.length), ctx); }}><m3e-icon variant="rounded" name="shuffle" /></M3eIconButton>
            <OfflineToggle tracks={all} />
          </div>
        )}
      </div>
      <div className="page">
        {all.length > 8 && (
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <label className={`search-pill ${searching || query ? 'open' : ''}`} onClick={() => { setSearching(true); inputRef.current?.focus(); }}>
              <m3e-icon variant="rounded" name="search" />
              <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} onBlur={() => setSearching(false)} placeholder={tr('Найти в списке', 'Find in the list')} aria-label={tr('Найти в списке', 'Find in the list')} />
              {query && <button onClick={(e) => { e.preventDefault(); setQuery(''); inputRef.current?.focus(); }} aria-label={tr('Очистить', 'Clear')} className="flex shrink-0"><m3e-icon variant="rounded" name="close" /></button>}
            </label>
            <M3eFilterChipSet aria-label={tr('Сортировка', 'Sort')} onChange={(e: Event) => { const v = (e.target as any)?.value as Sort | undefined; if (v && v !== sort) setSort(v); }}>
              {SORTS.map((s) => <M3eFilterChip key={s} value={s} selected={sort === s || undefined}>{sortNames[s]}</M3eFilterChip>)}
            </M3eFilterChipSet>
          </div>
        )}
        {isLoading ? <TrackListSkeleton />
          : !all.length ? (starred
            ? <EmptyState icon="star" title={tr('Суперлайков пока нет', 'No superlikes yet')} hint={tr('Зажмите сердце у трека — он получит звезду и попадёт сюда, а в «Любимых» останется.', 'Press and hold the heart on a track — it gets the star and lands here, and stays in Liked too.')} />
            : <EmptyState icon="favorite" title={t('emptyLiked')} hint={t('emptyLikedHint')} />)
          : !tracks.length ? <EmptyState icon="search_off" title={t('nothingFound')} />
          : <TrackList tracks={tracks} context={ctx} showAddedAt flip />}
      </div>
    </div>
  );
}

/** The list as the listener wants it: matching the search (title, artist, guests, album), in the chosen order. */
function arrange(list: Track[], query: string, sort: Sort, lang: string): Track[] {
  const q = query.trim().toLowerCase();
  const found = q ? list.filter((x) => [x.title, x.artist.name, x.album?.title ?? '', ...x.featuring.map((f) => f.name)].some((s) => s.toLowerCase().includes(q))) : list;
  const by = (f: (x: Track) => string) => [...found].sort((a, b) => f(a).localeCompare(f(b), lang) || a.title.localeCompare(b.title, lang));
  switch (sort) {
    case 'oldest': return [...found].reverse();
    case 'title': return by((x) => x.title);
    case 'artist': return by((x) => x.artist.name);
    case 'album': return by((x) => x.album?.title ?? '￿');
    default: return found;
  }
}
