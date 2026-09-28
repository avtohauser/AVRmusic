import { useSearchParams, Link } from 'react-router-dom';
import { Heart, Plus } from 'lucide-react';
import { useAlbums, useArtists, useGenres, useLikedAlbums, useLikedArtists, useMyPlaylists, usePublicPlaylists } from '@/lib/queries';
import { useAuth } from '@/stores/auth';
import { useUI } from '@/stores/ui';
import { useT } from '@/lib/i18n';
import { AlbumCard, ArtistCard, GenreCard, PlaylistCard } from '@/components/Cards';
import { ShelfSkeleton } from '@/components/Skeleton';
import { EmptyState } from '@/components/EmptyState';

type Tab = 'playlists' | 'albums' | 'artists' | 'genres';

export default function Library() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'playlists';
  const user = useAuth((s) => s.user);
  const t = useT();
  const setEditor = useUI((s) => s.setPlaylistEditor);
  const tabs: Array<[Tab, string]> = [['playlists', t('playlists')], ['albums', t('albums')], ['artists', t('artists')], ['genres', t('genres')]];
  const grid = 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2 fade-in';

  return (
    <div className="page pt-2">
      <div className="flex items-center gap-2 mb-5 overflow-x-auto no-scrollbar">
        {tabs.map(([k, label]) => <button key={k} className="chip" data-active={tab === k} onClick={() => setParams({ tab: k })}>{label}</button>)}
        {user && tab === 'playlists' && <button className="btn btn-ghost !h-8 ml-auto" onClick={() => setEditor({ initial: { title: '', description: '', isPublic: true } })}><Plus size={16} />{t('createPlaylist')}</button>}
      </div>
      {tab === 'playlists' && <Playlists grid={grid} />}
      {tab === 'albums' && <Albums grid={grid} />}
      {tab === 'artists' && <Artists grid={grid} />}
      {tab === 'genres' && <Genres />}
    </div>
  );
}

function Playlists({ grid }: { grid: string }) {
  const user = useAuth((s) => s.user);
  const t = useT();
  const mine = useMyPlaylists();
  const pub = usePublicPlaylists();
  if (mine.isLoading || pub.isLoading) return <ShelfSkeleton />;
  const myIds = new Set((mine.data ?? []).map((p) => p.id));
  const others = (pub.data ?? []).filter((p) => !myIds.has(p.id));
  return (
    <>
      {user && (
        <>
          <div className={grid}>
            <Link to="/liked" className="group w-full p-3 rounded-2xl card-hover">
              <div className="w-full aspect-square rounded-lg accent-gradient flex items-center justify-center text-white shadow-lg"><Heart size={44} fill="currentColor" /></div>
              <div className="mt-3 font-semibold">{t('likedSongs')}</div>
              <div className="text-sm text-muted">{t('playlist')}</div>
            </Link>
            {(mine.data ?? []).map((p) => <div key={p.id} className="w-full [&>a]:w-full"><PlaylistCard playlist={p} /></div>)}
          </div>
          {others.length > 0 && <h2 className="text-xl font-bold mt-8 mb-3">{t('communityPlaylists')}</h2>}
        </>
      )}
      <div className={grid}>{others.map((p) => <div key={p.id} className="w-full [&>a]:w-full"><PlaylistCard playlist={p} /></div>)}</div>
      {!user && !others.length && <EmptyState title={t('nothingFound')} />}
    </>
  );
}

function Albums({ grid }: { grid: string }) {
  const user = useAuth((s) => s.user);
  const liked = useLikedAlbums();
  const all = useAlbums('new');
  const t = useT();
  if (all.isLoading) return <ShelfSkeleton />;
  return (
    <>
      {user && liked.data && liked.data.length > 0 && (<><h2 className="text-xl font-bold mb-3">{t('likedSongs').replace(/треки|songs/i, (m) => (m.toLowerCase() === 'songs' ? 'albums' : 'альбомы'))}</h2><div className={grid}>{liked.data.map((a) => <div key={a.id} className="w-full [&>a]:w-full"><AlbumCard album={a} /></div>)}</div><h2 className="text-xl font-bold mt-8 mb-3">{t('all')}</h2></>)}
      <div className={grid}>{(all.data?.items ?? []).map((a) => <div key={a.id} className="w-full [&>a]:w-full"><AlbumCard album={a} /></div>)}</div>
    </>
  );
}

function Artists({ grid }: { grid: string }) {
  const user = useAuth((s) => s.user);
  const liked = useLikedArtists();
  const all = useArtists('popular');
  const t = useT();
  if (all.isLoading) return <ShelfSkeleton round />;
  return (
    <>
      {user && liked.data && liked.data.length > 0 && (<><h2 className="text-xl font-bold mb-3">{t('following')}</h2><div className={grid}>{liked.data.map((a) => <div key={a.id} className="w-full [&>a]:w-full"><ArtistCard artist={a} /></div>)}</div><h2 className="text-xl font-bold mt-8 mb-3">{t('all')}</h2></>)}
      <div className={grid}>{(all.data?.items ?? []).map((a) => <div key={a.id} className="w-full [&>a]:w-full"><ArtistCard artist={a} /></div>)}</div>
    </>
  );
}

function Genres() {
  const { data, isLoading } = useGenres();
  if (isLoading) return <ShelfSkeleton />;
  return <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 fade-in">{(data ?? []).map((g) => <GenreCard key={g.slug} genre={g} wide />)}</div>;
}
