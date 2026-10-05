import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { M3eAssistChip, M3eButton, M3eButtonSegment, M3eIconButton, M3eFilterChip, M3eFilterChipSet, M3eSearchBar, M3eSegmentedButton } from '@/md';
import { useCatalogSearch, useGenres, useSearch } from '@/lib/queries';
import { useDebounced } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import { useAuth } from '@/stores/auth';
import { usePlayer } from '@/stores/player';
import { api } from '@/lib/api';
import { TrackList } from '@/components/TrackList';
import { AlbumCard, ArtistCard, GenreCard, PlaylistCard } from '@/components/Cards';
import { CatalogAlbumCard, CatalogArtistCard, CatalogTrackRow, AcquireButton } from '@/components/Catalog';
import { Shelf } from '@/components/Shelf';
import { Cover } from '@/components/Cover';
import { PlayButton } from '@/components/PlayButton';
import { EmptyState } from '@/components/EmptyState';
import { TrackListSkeleton } from '@/components/Skeleton';
import type { AlbumSummary, ArtistSummary, PlaylistSummary, Track } from '@avrmusic/shared';
import { rememberSearch } from '@/lib/nav';
import { useTr } from '@/lib/social';
import { playCatalog } from '@/lib/instant';
import { useVoiceInput } from '@/lib/voice';

const RECENT_KEY = 'avr.recentSearches';
const loadRecent = (): string[] => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; } };
const SCOPE_KEY = 'avr.searchScope';
const loadScope = (): 'library' | 'catalog' => { try { return localStorage.getItem(SCOPE_KEY) === 'catalog' ? 'catalog' : 'library'; } catch { return 'library'; } };
type Type = 'all' | 'track' | 'album' | 'artist' | 'playlist' | 'lyrics';

export default function Search() {
  const [params, setParams] = useSearchParams();
  const initial = params.get('q') ?? '';
  const info = useAuth((s) => s.info);
  const [scope, setScope] = useState<'library' | 'catalog'>(params.get('scope') === 'catalog' ? 'catalog' : params.get('scope') === 'library' ? 'library' : loadScope());
  const [q, setQ] = useState(initial);
  const [type, setType] = useState<Type>('all');
  const dq = useDebounced(q, 250);
  const { data: libData, isFetching: libFetching } = useSearch(scope === 'library' ? dq : '', type);
  const { data: catData, isFetching: catFetching } = useCatalogSearch(scope === 'catalog' ? dq : '');
  const data = scope === 'library' ? libData : undefined;
  const isFetching = scope === 'library' ? libFetching : catFetching;
  const { data: genres } = useGenres();
  const t = useT();
  const tr = useTr();
  const inputRef = useRef<HTMLInputElement>(null);
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const voice = useVoiceInput((text) => setQ(text));

  useEffect(() => { if (initial !== q) setQ(initial); }, [initial]);
  useEffect(() => { if (!initial) inputRef.current?.focus(); }, []);
  useEffect(() => {
    if (dq.trim()) {
      setParams(scope === 'catalog' ? { q: dq, scope } : { q: dq }, { replace: true });
      const r = [dq.trim(), ...loadRecent().filter((x) => x !== dq.trim())].slice(0, 8);
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(r)); } catch { /* ignore */ }
      setRecent(r);
    } else setParams(scope === 'catalog' ? { scope } : {}, { replace: true });
    try { localStorage.setItem(SCOPE_KEY, scope); } catch { /* ignore */ }
    const sp = new URLSearchParams(); if (dq.trim()) sp.set('q', dq.trim()); sp.set('scope', scope);
    rememberSearch(`?${sp.toString()}`);
  }, [dq, scope]);

  const tabs: Array<[Type, string]> = [['all', t('all')], ['track', t('tracks')], ['artist', t('artists')], ['album', t('albums')], ['playlist', t('playlists')], ['lyrics', tr('По тексту', 'By lyrics')]];
  const hasResults = !!data && !!(data.tracks.length || data.albums.length || data.artists.length || data.playlists.length || data.lyrics?.length);

  return (
    <div className="page pt-2">
      <div className="sticky top-16 z-10 pb-3 pt-1 bg-background">
        <M3eSearchBar clearable className="!max-w-none" onClear={() => { setQ(''); inputRef.current?.focus(); }}>
          <m3e-icon variant="rounded" slot="leading" name="search" />
          <input ref={inputRef} slot="input" className="md-input md-body-lg" placeholder={t('searchPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search" />
          {voice.supported && <M3eIconButton slot="trailing" toggle selected={voice.listening || undefined} title={tr('Сказать голосом', 'Say it')} onClick={voice.start}><m3e-icon variant="rounded" name="mic" /><m3e-icon variant="rounded" slot="selected" name="mic" filled style={{ color: 'var(--md-sys-color-error)' }} /></M3eIconButton>}
        </M3eSearchBar>
        {info?.catalog && (
          <div className="mt-3">
            <M3eSegmentedButton onChange={(e: Event) => { const v = (e.target as any)?.value; if (v) setScope(v); }}>
              <M3eButtonSegment value="library" checked={scope === 'library' || undefined}><m3e-icon variant="rounded" slot="icon" name="library_music" />{t('myLibrary')}</M3eButtonSegment>
              <M3eButtonSegment value="catalog" checked={scope === 'catalog' || undefined}><m3e-icon variant="rounded" slot="icon" name="public" />{t('catalog')}</M3eButtonSegment>
            </M3eSegmentedButton>
          </div>
        )}
        {dq.trim() && scope === 'library' && (
          <M3eFilterChipSet className="mt-3 flex-wrap" onChange={(e: Event) => { const v = (e.target as any)?.value as Type | undefined; if (v) setType(v); }}>
            {tabs.map(([k, label]) => <M3eFilterChip key={k} value={k} selected={type === k || undefined}>{label}</M3eFilterChip>)}
          </M3eFilterChipSet>
        )}
      </div>

      {!dq.trim() && scope === 'library' && (
        <div className="fade-in">
          {recent.length > 0 && (
            <div className="mb-6">
              <h2 className="md-title-md emph mb-2">{t('recentSearches')}</h2>
              <div className="flex flex-wrap gap-2">
                {recent.map((r) => <M3eAssistChip key={r} onClick={() => setQ(r)}><m3e-icon variant="rounded" slot="icon" name="history" />{r}</M3eAssistChip>)}
                <M3eAssistChip onClick={() => { localStorage.removeItem(RECENT_KEY); setRecent([]); }}><m3e-icon variant="rounded" slot="icon" name="close" />{t('clearHistory')}</M3eAssistChip>
              </div>
            </div>
          )}
          <h2 className="md-title-md emph mb-3">{t('browseAll')}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {(genres ?? []).map((g) => <GenreCard key={g.slug} genre={g} wide />)}
          </div>
        </div>
      )}
      {scope === 'catalog' && !dq.trim() && <p className="muted md-body-md mb-6">{t('catalogHint')}</p>}
      {scope === 'catalog' && dq.trim() && <CatalogResults q={dq} data={catData} fetching={catFetching} />}
      {scope === 'library' && dq.trim() && !data && isFetching && <TrackListSkeleton />}
      {scope === 'library' && dq.trim() && data && !hasResults && <EmptyState icon="search_off" title={`${t('nothingFound')} «${dq}»`} hint={t('tryAnother')} />}

      {data && hasResults && type === 'all' && (
        <div className="fade-in">
          <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-6 mb-6">
            {data.top && <TopResult top={data.top} />}
            {data.tracks.length > 0 && (
              <div>
                <h2 className="md-title-lg emph mb-2">{t('tracks')}</h2>
                <TrackList tracks={data.tracks.slice(0, 5)} context={`search:${dq}`} showAlbum={false} numbered={false} header={false} compact />
                {data.tracks.length > 5 && <M3eButton variant="text" onClick={() => setType('track')}>{t('showAll')}</M3eButton>}
              </div>
            )}
          </div>
          {data.artists.length > 0 && <Shelf title={t('artists')}>{data.artists.map((a) => <ArtistCard key={a.id} artist={a} />)}</Shelf>}
          {data.albums.length > 0 && <Shelf title={t('albums')}>{data.albums.map((a) => <AlbumCard key={a.id} album={a} />)}</Shelf>}
          {data.playlists.length > 0 && <Shelf title={t('playlists')}>{data.playlists.map((p) => <PlaylistCard key={p.id} playlist={p} />)}</Shelf>}
          {!!data.lyrics?.length && <LyricsHits hits={data.lyrics.slice(0, 5)} q={dq} />}
        </div>
      )}
      {data && type === 'lyrics' && (data.lyrics?.length ? <LyricsHits hits={data.lyrics} q={dq} /> : <EmptyState icon="lyrics" title={tr('Ни в одной песне нет такой строчки', 'No song has that line')} hint={tr('Попробуйте пару слов из припева', 'Try a couple of words from the chorus')} />)}
      {data && type === 'track' && <TrackList tracks={data.tracks} context={`search:${dq}`} />}
      {data && type !== 'all' && type !== 'track' && type !== 'lyrics' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2 fade-in [&>*]:w-full">
          {type === 'artist' && data.artists.map((a) => <ArtistCard key={a.id} artist={a} />)}
          {type === 'album' && data.albums.map((a) => <AlbumCard key={a.id} album={a} />)}
          {type === 'playlist' && data.playlists.map((p) => <PlaylistCard key={p.id} playlist={p} />)}
        </div>
      )}
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
      <h2 className="md-title-lg emph mb-2">{t('topResult')}</h2>
      <Link to={to} className="group surface-low rounded-[28px] hover:rounded-[36px] spring block p-5 relative state-layer">
        <Cover src={cover} shape={round ? 'cookie' : undefined} kind={round ? 'artist' : 'album'} className="w-28 h-28 elev-2" />
        <div className="mt-4 md-headline-md emph line-1">{title}</div>
        <div className="md-body-md muted">{sub}</div>
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
  if (!has) return <EmptyState icon="search_off" title={`${t('nothingFound')} «${q}»`} hint={t('tryAnother')} />;
  const top = data.top;
  return (
    <div className="fade-in">
      <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-6 mb-6">
        {top && (
          <div>
            <h2 className="md-title-lg emph mb-2">{t('topResult')}</h2>
            <Link to={top.kind === 'artist' ? `/catalog/artist/${top.item.id}` : top.kind === 'album' ? `/catalog/album/${top.item.id}` : top.item.album ? `/catalog/album/${top.item.album.id}` : `/catalog/artist/${top.item.artist.id}`} className="group surface-low rounded-[28px] hover:rounded-[36px] spring block p-5 relative state-layer">
              <Cover src={top.kind === 'artist' ? top.item.imageUrl : top.kind === 'album' ? top.item.coverUrl : top.item.album?.coverUrl} shape={top.kind === 'artist' ? 'cookie' : undefined} kind={top.kind === 'artist' ? 'artist' : 'album'} className="w-28 h-28 elev-2" />
              <div className="mt-4 md-headline-md emph line-1">{top.kind === 'artist' ? top.item.name : top.item.title}</div>
              <div className="md-body-md muted">{top.kind === 'artist' ? t('artist') : top.kind === 'album' ? `${t('album')} · ${top.item.artist.name}` : `${t('track')} · ${top.item.artist.name}`}</div>
              <div className="mt-4">
                {top.kind === 'artist' && <AcquireButton kind="artist" id={top.item.id} title={`${top.item.name} — дискография`} label />}
                {top.kind === 'album' && <AcquireButton kind="album" id={top.item.id} title={`${top.item.artist.name} — ${top.item.title} (альбом)`} done={top.item.trackCount > 0 && top.item.inLibrary >= top.item.trackCount} label />}
                {top.kind === 'track' && <div className="flex flex-wrap gap-2"><M3eButton variant="filled" onClick={(e: any) => { e.preventDefault(); void playCatalog([top.item], 0); }}><m3e-icon variant="rounded" slot="icon" name="play_arrow" filled />{t('play')}</M3eButton><AcquireButton kind="track" id={top.item.id} title={`${top.item.artist.name} — ${top.item.title}`} done={!!top.item.libraryTrackId} label /></div>}
              </div>
            </Link>
          </div>
        )}
        {data.tracks.length > 0 && (
          <div>
            <h2 className="md-title-lg emph mb-2">{t('tracks')}</h2>
            {data.tracks.slice(0, 6).map((x, i) => <CatalogTrackRow key={x.id} track={x} index={i} list={data.tracks} context={`catalog-search:${q}`} />)}
          </div>
        )}
      </div>
      {data.artists.length > 0 && <Shelf title={t('artists')}>{data.artists.map((a) => <CatalogArtistCard key={a.id} artist={a} />)}</Shelf>}
      {data.albums.length > 0 && <Shelf title={t('albums')}>{data.albums.map((a) => <CatalogAlbumCard key={a.id} album={a} />)}</Shelf>}
      {data.tracks.length > 6 && <><h2 className="md-title-lg emph mb-2">{t('tracks')}</h2>{data.tracks.slice(6).map((x, i) => <CatalogTrackRow key={x.id} track={x} index={i + 6} list={data.tracks} context={`catalog-search:${q}`} />)}</>}
    </div>
  );
}

/** Songs found by a line of their lyrics: the line, with the words searched for marked. */
function LyricsHits({ hits, q }: { hits: Array<{ track: Track; line: string }>; q: string }) {
  const tr = useTr();
  const play = usePlayer.getState().playTracks;
  const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  const mark = (line: string) => line.split(/(\s+)/).map((w, i) => (words.some((x) => w.toLowerCase().includes(x)) ? <mark key={i} className="bg-transparent text-primary font-semibold">{w}</mark> : w));
  const list = hits.map((h) => h.track);
  return (
    <section className="mb-8">
      <h2 className="md-title-lg emph mb-2 flex items-center gap-2"><m3e-icon variant="rounded" name="lyrics" />{tr('По строчке из песни', 'By a line of the song')}</h2>
      <div className="space-y-1">
        {hits.map((h, i) => (
          <button key={h.track.id} className="w-full flex items-center gap-3 p-2 rounded-[20px] state-layer text-left" onClick={() => play(list, i, `search-lyrics:${q}`)}>
            <Cover src={h.track.coverUrl} className="w-12 h-12 !rounded-[12px]" />
            <span className="min-w-0 flex-1">
              <span className="block md-body-lg italic line-1">«{mark(h.line)}»</span>
              <span className="block md-body-sm muted line-1">{h.track.artist.name} — {h.track.title}</span>
            </span>
            <m3e-icon variant="rounded" name="play_arrow" filled />
          </button>
        ))}
      </div>
    </section>
  );
}
