import { useHome } from '@/lib/queries';
import { useAuth } from '@/stores/auth';
import { usePlayer } from '@/stores/player';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { Shelf } from '@/components/Shelf';
import { AlbumCard, ArtistCard, GenreCard, PlaylistCard, QuickPick, TrackCard } from '@/components/Cards';
import { ShelfSkeleton, Skeleton } from '@/components/Skeleton';
import { EmptyState } from '@/components/EmptyState';
import { Link } from 'react-router-dom';
import { Music2, Upload } from 'lucide-react';
import type { AlbumSummary, ArtistSummary, Genre, PlaylistSummary, Track } from '@avrmusic/shared';

export default function Home() {
  const { data, isLoading, error } = useHome();
  const user = useAuth((s) => s.user);
  const info = useAuth((s) => s.info);
  const t = useT();
  const play = usePlayer.getState().playTracks;

  if (!user && !info?.publicLibrary) {
    return (
      <div className="page pt-10">
        <div className="card p-8 md:p-12 text-center max-w-2xl mx-auto fade-in">
          <div className="w-16 h-16 rounded-2xl accent-gradient mx-auto flex items-center justify-center text-white mb-4"><Music2 size={30} /></div>
          <h1 className="text-3xl font-extrabold">{t('welcome')} <span className="text-gradient">AVRmusic</span></h1>
          <p className="text-muted mt-2">{t('signInToListen')}</p>
          <div className="flex justify-center gap-3 mt-6">
            <Link to="/login" className="btn btn-primary">{t('login')}</Link>
            {(info?.allowRegistration || info?.needsSetup) && <Link to="/register" className="btn btn-ghost">{t('register')}</Link>}
          </div>
        </div>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="page pt-4">
        <Skeleton className="h-9 w-56 mb-6" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
        <ShelfSkeleton /><div className="h-8" /><ShelfSkeleton round />
      </div>
    );
  }
  if (error) return <div className="page pt-8 text-red-400">{String((error as any).message)}</div>;

  const empty = !data.sections.length;
  return (
    <div className="page pt-4">
      <h1 className="text-2xl md:text-3xl font-extrabold mb-5 fade-in">{data.greeting}{user ? `, ${user.displayName}` : ''}</h1>
      {empty && (
        <EmptyState icon={<Music2 />} title={t('emptyLibrary')} hint={t('emptyLibraryHint')} action={user?.role === 'admin' ? <Link to="/admin" className="btn btn-accent"><Upload size={16} />{t('upload')}</Link> : undefined} />
      )}
      {data.quickPicks.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8 fade-in">
          {data.quickPicks.map((q: any) => {
            if (q.kind === 'liked') return <QuickPick key="liked" title={q.title} to="/liked" liked onPlay={async () => play(await api.get<Track[]>('/api/me/likes/tracks'), 0, 'liked')} />;
            if ('owner' in q) return <QuickPick key={q.id} title={q.title} cover={q.coverUrl} mosaic={q.mosaic} to={`/playlist/${q.id}`} onPlay={async () => play((await api.get<{ tracks: Track[] }>(`/api/playlists/${q.id}`)).tracks, 0, `playlist:${q.id}`)} />;
            return <QuickPick key={q.id} title={q.title} cover={q.coverUrl} to={`/album/${q.id}`} onPlay={async () => play((await api.get<{ tracks: Track[] }>(`/api/albums/${q.id}`)).tracks, 0, `album:${q.id}`)} />;
          })}
        </div>
      )}
      {data.sections.map((s) => (
        <Shelf key={s.id} title={s.title} subtitle={s.subtitle} to={s.kind === 'genres' ? '/library?tab=genres' : s.kind === 'artists' ? '/library?tab=artists' : s.kind === 'albums' ? '/library?tab=albums' : undefined}>
          {s.kind === 'tracks' && (s.items as Track[]).map((tr, i) => <TrackCard key={tr.id} track={tr} list={s.items as Track[]} index={i} />)}
          {s.kind === 'albums' && (s.items as AlbumSummary[]).map((a) => <AlbumCard key={a.id} album={a} />)}
          {s.kind === 'artists' && (s.items as ArtistSummary[]).map((a) => <ArtistCard key={a.id} artist={a} />)}
          {s.kind === 'playlists' && (s.items as PlaylistSummary[]).map((p) => <PlaylistCard key={p.id} playlist={p} />)}
          {s.kind === 'genres' && (s.items as Genre[]).map((g) => <GenreCard key={g.slug} genre={g} />)}
        </Shelf>
      ))}
    </div>
  );
}
