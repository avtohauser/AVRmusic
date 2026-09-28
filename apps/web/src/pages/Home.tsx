import { Link } from 'react-router-dom';
import { useHome } from '@/lib/queries';
import { useAuth } from '@/stores/auth';
import { usePlayer } from '@/stores/player';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { M3eButton } from '@/md';
import { Shelf } from '@/components/Shelf';
import { Logo } from '@/components/Logo';
import { AlbumCard, ArtistCard, GenreCard, PlaylistCard, QuickPick, TrackCard } from '@/components/Cards';
import { ShelfSkeleton, Skeleton } from '@/components/Skeleton';
import { EmptyState } from '@/components/EmptyState';
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
        <div className="surface-low rounded-[36px] p-8 md:p-12 text-center max-w-2xl mx-auto fade-in">
          <Logo className="w-20 h-20 mx-auto mb-5" />
          <h1 className="md-display-sm emph">{t('welcome')} <span className="text-primary">AVRmusic</span></h1>
          <p className="md-body-lg muted mt-2">{t('signInToListen')}</p>
          <div className="flex justify-center gap-3 mt-6">
            <M3eButton variant="filled" size="large" href="/login">{t('login')}</M3eButton>
            {(info?.allowRegistration || info?.needsSetup) && <M3eButton variant="tonal" size="large" href="/register">{t('register')}</M3eButton>}
          </div>
        </div>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="page pt-4">
        <Skeleton className="h-10 w-64 mb-6" />
        <div className="grid grid-cols-2 md:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3 mb-8">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
        <ShelfSkeleton /><div className="h-8" /><ShelfSkeleton round />
      </div>
    );
  }
  if (error) return <div className="page pt-8 text-error">{String((error as any).message)}</div>;

  const empty = !data.sections.length;
  return (
    <div className="page pt-4">
      <h1 className="md-headline-lg emph mb-5 fade-in">{data.greeting}{user ? `, ${user.displayName}` : ''}</h1>
      {empty && (
        <EmptyState icon="music_note" title={t('emptyLibrary')} hint={t('emptyLibraryHint')} action={user?.role === 'admin' ? <M3eButton variant="filled" href="/admin"><m3e-icon variant="rounded" slot="icon" name="upload" />{t('upload')}</M3eButton> : undefined} />
      )}
      {data.quickPicks.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3 mb-8 fade-in">
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
      <span className="hidden">{String(Link)}</span>
    </div>
  );
}
