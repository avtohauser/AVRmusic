import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Search as SearchIcon, X, Clock } from 'lucide-react';
import { useCatalogSearch, useGenres, useSearch } from '@/lib/queries';
import { useAuth } from '@/stores/auth';
import { CatalogAlbumCard, CatalogArtistCard, CatalogTrackRow, AcquireButton } from '@/components/Catalog';
import { Globe, Library } from 'lucide-react';
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
  const info = useAuth((s) => s.info);
  const [scope, setScope] = useState<'library' | 'catalog'>(params.get('scope') === 'catalog' ? 'catalog' : 'library');
  const [q, setQ] = useState(initial);
  const [type, setType] = useState<'all' | 'track' | 'album' | 'artist' | 'playlist'>('all');
  const dq = useDebounced(q, 250);
  const { data: libData, isFetching: libFetching } = useSearch(scope === 'library' ? dq : '', type);
  const { data: catData, isFetching: catFetching } = useCatalogSearch(scope === 'catalog' ? dq : '');
  const data = scope === 'library' ? libData : undefined;
  const isFetching = scope === 'library' ? libFetching : catFetching;
  const { data: genres } = useGenres();
  const t = useT();
  const nav = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [recent, setRecent] = useState<string[]>(loadRecent);

  useEffect(() => { if (initial !== q) setQ(initial); }, [initial]);
  useEffect(() => { if (!initial) inputRef.current?.focus(); }, []);
  useEffect(() => {
    if (dq.trim()) {
      setParams(scope === 'catalog' ? { q: dq, scope } : { q: dq }, { replace: true });
      const r = [dq.trim(), ...loadRecent().filter((x) => x !== dq.trim())].slice(0, 8);
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(r)); } catch { /* ignore */ }
      setRecent(r);
    } else setParams(scope === 'catalog' ? { scope } : {}, { replace: true });
  }, [dq, scope]);

  const tabs: Array<[typeof type, string]> = [['all', t('all')], ['track', t('tracks')], ['artist', t('artists')], ['album', t('albums')], ['playlist', t('playlists')]];
  const hasResults = !!data && !!(data.tracks.length || data.albums.length || data.artists.length || data.playlists.length);

  return (
    <div className="page pt-2">
      <div className="sticky top-16 z-10 pb-3 pt-1 bg-bg">
        <div className="relative">
          <SearchIcon size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
          <input ref={inputRef} className="input !h-12 !pl-11 !pr-10 !rounded-full text-base" placeholder={t('searchPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search" />
          {q && <button className="icon-btn absolute right-2 top-1/2 -translate-y-1/2" onClick={() => { setQ(''); inputRef.current?.focus(); }}><X size={16} /></button>}
        </div>
        {info?.catalog && (
          <div className="flex gap-2 mt-3">
            <button className="chip" data-active={scope === 'library'} onClick={() => setScope('library')}><Library size={14} className="mr-1.5" />{t('myLibrary')}</button>
            <button className="chip" data-active={scope === 'catalog'} onClick={() => setScope('catalog')}><Globe size={14} className="mr-1.5" />{t('catalog')}</button>
          </div>
        )}
        {dq.trim() && scope === 'library' && (
          <div className="flex gap-2 mt-3 overflow-x-auto no-scrollbar">
            {tabs.map(([k, label]) => <button key={k} className="chip" data-active={type === k} onClick={() => setType(k)}>{label}</button>)}
          </div>
        )}
      </div>

      {!dq.trim() && scope === 'library' && (
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

      {scope === 'catalog' && !dq.trim() && <p className="text-muted text-sm mb-6">{t('catalogHint')}</p>}
      {scope === 'catalog' && dq.trim() && <CatalogResults q={dq} data={catData} fetching={catFetching} />}
      {scope === 'library' && dq.trim() && !data && isFetching && <TrackListSkeleton />}
      {scope === 'library' && dq.trim() && data && !hasResults && <EmptyState icon={<SearchIcon />} title={`${t('nothingFound')} «${dq}»`} hint={t('tryAnother')} />}

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


function CatalogResults({ q, data, fetching }: { q: string; data: ReturnType<typeof useCatalogSearch>['data']; fetching: boolean }) {
  const t = useT();
  if (!data && fetching) return <TrackListSkeleton />;
  if (!data) return null;
  const has = data.artists.length || data.albums.length || data.tracks.length;
  if (!has) return <EmptyState icon={<SearchIcon />} title={`${t('nothingFound')} «${q}»`} hint={t('tryAnother')} />;
  const top = data.top;
  return (
    <div className="fade-in">
      <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-6 mb-6">
        {top && (
          <div>
            <h2 className="text-xl font-bold mb-2">{t('topResult')}</h2>
            <Link to={top.kind === 'artist' ? `/catalog/artist/${top.item.id}` : top.kind === 'album' ? `/catalog/album/${top.item.id}` : top.item.album ? `/catalog/album/${top.item.album.id}` : `/catalog/artist/${top.item.artist.id}`} className="group card card-hover block p-5 relative">
              <Cover src={top.kind === 'artist' ? top.item.imageUrl : top.kind === 'album' ? top.item.coverUrl : top.item.album?.coverUrl} round={top.kind === 'artist'} kind={top.kind === 'artist' ? 'artist' : 'album'} className="w-24 h-24 shadow-xl shadow-black/30" />
              <div className="mt-4 text-2xl font-extrabold line-clamp-1">{top.kind === 'artist' ? top.item.name : top.item.title}</div>
              <div className="text-muted">{top.kind === 'artist' ? t('artist') : top.kind === 'album' ? `${t('album')} · ${top.item.artist.name}` : `${t('track')} · ${top.item.artist.name}`}</div>
              <div className="mt-4">
                {top.kind === 'artist' && <AcquireButton kind="artist" id={top.item.id} title={`${top.item.name} — дискография`} label />}
                {top.kind === 'album' && <AcquireButton kind="album" id={top.item.id} title={`${top.item.artist.name} — ${top.item.title} (альбом)`} done={top.item.trackCount > 0 && top.item.inLibrary >= top.item.trackCount} label />}
                {top.kind === 'track' && <AcquireButton kind="track" id={top.item.id} title={`${top.item.artist.name} — ${top.item.title}`} done={!!top.item.libraryTrackId} label />}
              </div>
            </Link>
          </div>
        )}
        {data.tracks.length > 0 && (
          <div>
            <h2 className="text-xl font-bold mb-2">{t('tracks')}</h2>
            {data.tracks.slice(0, 6).map((tr) => <CatalogTrackRow key={tr.id} track={tr} />)}
          </div>
        )}
      </div>
      {data.artists.length > 0 && <Shelf title={t('artists')}>{data.artists.map((a) => <CatalogArtistCard key={a.id} artist={a} />)}</Shelf>}
      {data.albums.length > 0 && <Shelf title={t('albums')}>{data.albums.map((a) => <CatalogAlbumCard key={a.id} album={a} />)}</Shelf>}
      {data.tracks.length > 6 && <><h2 className="text-xl font-bold mb-2">{t('tracks')}</h2>{data.tracks.slice(6).map((tr) => <CatalogTrackRow key={tr.id} track={tr} />)}</>}
    </div>
  );
}
