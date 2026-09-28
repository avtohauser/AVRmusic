import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Search as SearchIcon, X, Clock } from 'lucide-react';
import { useGenres, useSearch } from '@/lib/queries';
import { useDebounced } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import { TrackList } from '@/components/TrackList';
import { AlbumCard, ArtistCard, GenreCard, PlaylistCard } from '@/components/Cards';
import { Shelf } from '@/components/Shelf';
import { Cover } from '@/components/Cover';
import { PlayButton } from '@/components/PlayButton';
import { EmptyState } from '@/components/EmptyState';
import { TrackListSkeleton } from '@/components/Skeleton';
import { usePlayer } from '@/stores/player';
import { api } from '@/lib/api';
import type { AlbumSummary, ArtistSummary, PlaylistSummary, Track } from '@avrmusic/shared';

const RECENT_KEY = 'avr.recentSearches';
const loadRecent = (): string[] => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; } };

export default function Search() {
  const [params, setParams] = useSearchParams();
  const initial = params.get('q') ?? '';
  const [q, setQ] = useState(initial);
  const [type, setType] = useState<'all' | 'track' | 'album' | 'artist' | 'playlist'>('all');
  const dq = useDebounced(q, 250);
  const { data, isFetching } = useSearch(dq, type);
  const { data: genres } = useGenres();
  const t = useT();
  const nav = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [recent, setRecent] = useState<string[]>(loadRecent);

  useEffect(() => { if (initial !== q) setQ(initial); }, [initial]);
  useEffect(() => { if (!initial) inputRef.current?.focus(); }, []);
  useEffect(() => {
    if (dq.trim()) {
      setParams({ q: dq }, { replace: true });
      const r = [dq.trim(), ...loadRecent().filter((x) => x !== dq.trim())].slice(0, 8);
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(r)); } catch { /* ignore */ }
      setRecent(r);
    } else setParams({}, { replace: true });
  }, [dq]);

  const tabs: Array<[typeof type, string]> = [['all', t('all')], ['track', t('tracks')], ['artist', t('artists')], ['album', t('albums')], ['playlist', t('playlists')]];
  const hasResults = data && (data.tracks.length || data.albums.length || data.artists.length || data.playlists.length);

  return (
    <div className="page pt-2">
      <div className="sticky top-16 z-10 pb-3 pt-1 bg-bg">
        <div className="relative">
          <SearchIcon size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
          <input ref={inputRef} className="input !h-12 !pl-11 !pr-10 !rounded-full text-base" placeholder={t('searchPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search" />
          {q && <button className="icon-btn absolute right-2 top-1/2 -translate-y-1/2" onClick={() => { setQ(''); inputRef.current?.focus(); }}><X size={16} /></button>}
        </div>
        {dq.trim() && (
          <div className="flex gap-2 mt-3 overflow-x-auto no-scrollbar">
            {tabs.map(([k, label]) => <button key={k} className="chip" data-active={type === k} onClick={() => setType(k)}>{label}</button>)}
          </div>
        )}
      </div>

      {!dq.trim() && (
        <div className="fade-in">
          {recent.length > 0 && (
            <div className="mb-6">
              <h2 className="font-bold mb-2">{t('recentSearches')}</h2>
              <div className="flex flex-wrap gap-2">
                {recent.map((r) => <button key={r} className="chip" onClick={() => setQ(r)}><Clock size={14} className="mr-1.5 text-muted" />{r}</button>)}
                <button className="chip text-muted" onClick={() => { localStorage.removeItem(RECENT_KEY); setRecent([]); }}><X size={14} /></button>
              </div>
            </div>
          )}
          <h2 className="font-bold mb-3">{t('browseAll')}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {(genres ?? []).map((g) => <GenreCard key={g.slug} genre={g} wide />)}
          </div>
        </div>
      )}

      {dq.trim() && !data && isFetching && <TrackListSkeleton />}
      {dq.trim() && data && !hasResults && <EmptyState icon={<SearchIcon />} title={`${t('nothingFound')} «${dq}»`} hint={t('tryAnother')} />}

      {data && hasResults && type === 'all' && (
        <div className="fade-in">
          <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-6 mb-6">
            {data.top && <TopResult top={data.top} />}
            {data.tracks.length > 0 && (
              <div>
                <h2 className="text-xl font-bold mb-2">{t('tracks')}</h2>
                <TrackList tracks={data.tracks.slice(0, 5)} context={`search:${dq}`} showAlbum={false} numbered={false} header={false} compact />
                {data.tracks.length > 5 && <button className="text-sm text-muted hover:text-fg mt-1 px-3" onClick={() => setType('track')}>{t('showAll')}</button>}
              </div>
            )}
          </div>
          {data.artists.length > 0 && <Shelf title={t('artists')}>{data.artists.map((a) => <ArtistCard key={a.id} artist={a} />)}</Shelf>}
          {data.albums.length > 0 && <Shelf title={t('albums')}>{data.albums.map((a) => <AlbumCard key={a.id} album={a} />)}</Shelf>}
          {data.playlists.length > 0 && <Shelf title={t('playlists')}>{data.playlists.map((p) => <PlaylistCard key={p.id} playlist={p} />)}</Shelf>}
        </div>
      )}
      {data && type === 'track' && <TrackList tracks={data.tracks} context={`search:${dq}`} />}
      {data && type !== 'all' && type !== 'track' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2 fade-in">
          {type === 'artist' && data.artists.map((a) => <ArtistCard key={a.id} artist={a} />)}
          {type === 'album' && data.albums.map((a) => <AlbumCard key={a.id} album={a} />)}
          {type === 'playlist' && data.playlists.map((p) => <PlaylistCard key={p.id} playlist={p} />)}
        </div>
      )}
      {!dq.trim() && <div className="hidden">{String(nav)}</div>}
    </div>
  );
}

function TopResult({ top }: { top: NonNullable<ReturnType<typeof useSearch>['data']>['top'] & object }) {
  const t = useT();
  const play = usePlayer.getState().playTracks;
  if (!top) return null;
  const { kind, item } = top;
  let title = '', sub = '', cover: string | null = null, to = '', round = false;
  let onPlay: () => void = () => {};
  if (kind === 'track') { const x = item as Track; title = x.title; sub = `${t('track')} · ${x.artist.name}`; cover = x.coverUrl; to = x.album ? `/album/${x.album.id}` : `/artist/${x.artist.id}`; onPlay = () => play([x], 0, 'search'); }
  if (kind === 'album') { const x = item as AlbumSummary; title = x.title; sub = `${t('album')} · ${x.artist.name}`; cover = x.coverUrl; to = `/album/${x.id}`; onPlay = async () => play((await api.get<{ tracks: Track[] }>(`/api/albums/${x.id}`)).tracks, 0, `album:${x.id}`); }
  if (kind === 'artist') { const x = item as ArtistSummary; title = x.name; sub = t('artist'); cover = x.imageUrl; to = `/artist/${x.id}`; round = true; onPlay = async () => play((await api.get<{ topTracks: Track[] }>(`/api/artists/${x.id}`)).topTracks, 0, `artist:${x.id}`); }
  if (kind === 'playlist') { const x = item as PlaylistSummary; title = x.title; sub = `${t('playlist')} · ${x.owner.displayName}`; cover = x.coverUrl; to = `/playlist/${x.id}`; onPlay = async () => play((await api.get<{ tracks: Track[] }>(`/api/playlists/${x.id}`)).tracks, 0, `playlist:${x.id}`); }
  return (
    <div>
      <h2 className="text-xl font-bold mb-2">{t('topResult')}</h2>
      <Link to={to} className="group card card-hover block p-5 relative">
        <Cover src={cover} round={round} kind={round ? 'artist' : 'album'} className="w-24 h-24 shadow-xl shadow-black/30" />
        <div className="mt-4 text-2xl font-extrabold line-clamp-1">{title}</div>
        <div className="text-muted">{sub}</div>
        <PlayButton onClick={onPlay} size="lg" className="absolute right-5 bottom-5 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all" />
      </Link>
    </div>
  );
}
