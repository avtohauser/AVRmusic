import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { M3eButton, M3eFilterChip, M3eFilterChipSet } from '@/md';
import { useAlbums, useArtists, useGenres, useLikedAlbums, useLikedArtists, useMyPlaylists, usePublicPlaylists } from '@/lib/queries';
import { useAuth } from '@/stores/auth';
import { useUI } from '@/stores/ui';
import { useT } from '@/lib/i18n';
import { AlbumCard, ArtistCard, GenreCard, PlaylistCard } from '@/components/Cards';
import { ShelfSkeleton } from '@/components/Skeleton';
import { EmptyState } from '@/components/EmptyState';
import { blendWith, radar, useTr } from '@/lib/social';

type Tab = 'playlists' | 'albums' | 'artists' | 'genres';
const grid = 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2 fade-in [&>*]:w-full';

export default function Library() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'playlists';
  const user = useAuth((s) => s.user);
  const t = useT();
  const setEditor = useUI((s) => s.setPlaylistEditor);
  const tabs: Array<[Tab, string, string]> = [['playlists', t('playlists'), 'queue_music'], ['albums', t('albums'), 'album'], ['artists', t('artists'), 'artist'], ['genres', t('genres'), 'category']];
  return (
    <div className="page pt-2">
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <M3eFilterChipSet onChange={(e: Event) => { const v = (e.target as any)?.value as Tab | undefined; if (v) setParams({ tab: v }); }}>
          {tabs.map(([k, label, icon]) => <M3eFilterChip key={k} value={k} selected={tab === k || undefined}><m3e-icon variant="rounded" slot="icon" name={icon} />{label}</M3eFilterChip>)}
        </M3eFilterChipSet>
        {user && <M3eButton variant="text" className="ml-auto" href="/transfer"><m3e-icon variant="rounded" slot="icon" name="swap_horiz" />{t('transferMusic')}</M3eButton>}
        {user && tab === 'playlists' && <M3eButton variant="tonal" onClick={() => setEditor({ initial: { title: '', description: '', isPublic: true } })}><m3e-icon variant="rounded" slot="icon" name="add" />{t('createPlaylist')}</M3eButton>}
      </div>
      {tab === 'playlists' && <Playlists />}
      {tab === 'albums' && <Albums />}
      {tab === 'artists' && <Artists />}
      {tab === 'genres' && <Genres />}
    </div>
  );
}

function AutoTile({ icon, title, sub, color, onClick }: { icon: string; title: string; sub: string; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="group surface-low rounded-[24px] hover:rounded-[32px] spring state-layer text-left"><div className="p-3">
      <div className="w-full aspect-square rounded-[20px] flex items-center justify-center elev-1 text-white" style={{ background: color }}><m3e-icon variant="rounded" name={icon} style={{ ['--m3e-icon-size' as any]: '48px' }} /></div>
      <div className="mt-3 md-title-sm line-1">{title}</div>
      <div className="md-body-sm muted line-1">{sub}</div>
    </div></button>
  );
}

function Playlists() {
  const user = useAuth((s) => s.user);
  const t = useT();
  const tr = useTr();
  const nav = useNavigate();
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
            <Link to="/liked" className="group surface-low rounded-[24px] hover:rounded-[32px] spring p-3 state-layer">
              <div className="w-full aspect-square rounded-[20px] bg-primary text-on-primary flex items-center justify-center elev-1"><m3e-icon variant="rounded" name="favorite" filled style={{ ['--m3e-icon-size' as any]: '48px' }} /></div>
              <div className="mt-3 md-title-sm">{t('likedSongs')}</div>
              <div className="md-body-sm muted">{t('playlist')}</div>
            </Link>
            <AutoTile icon="radar" title={tr('Радар новинок', 'Release radar')} sub={tr('Свежее от ваших исполнителей', 'Fresh from your artists')} color="var(--md-sys-color-tertiary)" onClick={async () => { try { nav(`/playlist/${(await radar()).id}`); } catch (e: any) { useUI.getState().toast(e.message, 'error'); } }} />
            <AutoTile icon="blender" title={tr('Блендер', 'Blend')} sub={tr('Общий плейлист с друзьями', 'One playlist with friends')} color="var(--md-sys-color-secondary)" onClick={() => blendWith(nav, tr)} />
            {(mine.data ?? []).map((p) => <PlaylistCard key={p.id} playlist={p} />)}
          </div>
          {others.length > 0 && <h2 className="md-headline-sm emph flow-soft mt-8 mb-3">{t('communityPlaylists')}</h2>}
        </>
      )}
      <div className={grid}>{others.map((p) => <PlaylistCard key={p.id} playlist={p} />)}</div>
      {!user && !others.length && <EmptyState title={t('nothingFound')} />}
    </>
  );
}

function Albums() {
  const user = useAuth((s) => s.user);
  const liked = useLikedAlbums();
  const all = useAlbums('new');
  const t = useT();
  if (all.isLoading) return <ShelfSkeleton />;
  return (
    <>
      {user && liked.data && liked.data.length > 0 && (<><h2 className="md-headline-sm emph flow-soft mb-3">{t('like')}</h2><div className={grid}>{liked.data.map((a) => <AlbumCard key={a.id} album={a} />)}</div><h2 className="md-headline-sm emph flow-soft mt-8 mb-3">{t('all')}</h2></>)}
      <div className={grid}>{(all.data?.items ?? []).map((a) => <AlbumCard key={a.id} album={a} />)}</div>
    </>
  );
}

function Artists() {
  const user = useAuth((s) => s.user);
  const liked = useLikedArtists();
  const all = useArtists('popular');
  const t = useT();
  if (all.isLoading) return <ShelfSkeleton round />;
  return (
    <>
      {user && liked.data && liked.data.length > 0 && (<><h2 className="md-headline-sm emph flow-soft mb-3">{t('following')}</h2><div className={grid}>{liked.data.map((a) => <ArtistCard key={a.id} artist={a} />)}</div><h2 className="md-headline-sm emph flow-soft mt-8 mb-3">{t('all')}</h2></>)}
      <div className={grid}>{(all.data?.items ?? []).map((a) => <ArtistCard key={a.id} artist={a} />)}</div>
    </>
  );
}

function Genres() {
  const { data, isLoading } = useGenres();
  if (isLoading) return <ShelfSkeleton />;
  return <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 fade-in">{(data ?? []).map((g) => <GenreCard key={g.slug} genre={g} wide />)}</div>;
}
