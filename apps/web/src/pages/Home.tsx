import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useHome } from '@/lib/queries';
import { useAuth } from '@/stores/auth';
import { usePlayer } from '@/stores/player';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { M3eButton } from '@/md';
import { Shelf } from '@/components/Shelf';
import { Mascot } from '@/components/Mascot';
import { AlbumCard, ArtistCard, GenreCard, PlaylistCard, QuickPick, TrackCard } from '@/components/Cards';
import { ShelfSkeleton, Skeleton } from '@/components/Skeleton';
import { EmptyState } from '@/components/EmptyState';
import type { AlbumSummary, ArtistSummary, Genre, PlaylistSummary, Track } from '@avrmusic/shared';
import { FlowText } from '@/components/FlowText';
import { WaveCard } from '@/components/WaveCard';
import { useFriends, useInbox, useTr } from '@/lib/social';
import { Avatar } from '@/components/Social';
import { Cover } from '@/components/Cover';

export default function Home() {
  const { data, isLoading, error } = useHome();
  const user = useAuth((s) => s.user);
  const info = useAuth((s) => s.info);
  const t = useT();
  const play = usePlayer.getState().playTracks;
  // Greeting follows the device's own clock and time zone (not the server's)
  const [hour, setHour] = useState(() => new Date().getHours());
  useEffect(() => { const id = setInterval(() => setHour(new Date().getHours()), 60_000); return () => clearInterval(id); }, []);
  const greeting = hour < 5 ? t('goodNight') : hour < 12 ? t('goodMorning') : hour < 18 ? t('goodAfternoon') : hour < 23 ? t('goodEvening') : t('goodNight');

  if (!user && !info?.publicLibrary) {
    return (
      <div className="page pt-10">
        <div className="surface-low rounded-[36px] p-8 md:p-12 text-center max-w-2xl mx-auto fade-in">
          <Mascot mood="idle" className="w-20 h-20 mx-auto mb-5" />
          <h1 className="md-display-sm emph"><FlowText text={t('welcome')} /> <FlowText text="AVRmusic" className="text-primary" /></h1>
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
      <div className="flex items-center gap-2.5 mb-3 pt-2">
        <LiveMark />
        <FlowText as="h1" text={greeting} className="md-headline-md block min-w-0 flex-1" />
        {user?.role === 'admin' && <Link to="/admin" className="md:hidden w-10 h-10 grid place-items-center rounded-full state-layer" title={t('admin')}><m3e-icon variant="rounded" name="shield" /></Link>}
        {user && <InboxButton />}
      </div>
      {user && !empty && <WaveCard />}
      {user && <FriendsNow />}
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
    </div>
  );
}

function InboxButton() {
  const { data } = useInbox();
  const tr = useTr();
  const unread = (data ?? []).filter((s) => !s.seen).length;
  return (
    <Link to="/inbox" className={`ml-auto shrink-0 flex items-center gap-1.5 px-3 h-10 rounded-full state-layer ${unread ? 'bg-primary text-on-primary' : 'surface-low'}`} title={tr('Входящие', 'Inbox')}>
      <m3e-icon variant="rounded" name="inbox" filled={unread > 0 || undefined} />{unread > 0 && <span className="md-label-lg">{unread}</span>}
    </Link>
  );
}

/** The sign beside the greeting: its waves pulse while music plays (LiveMark in the app). */
function LiveMark() {
  const playing = usePlayer((s) => s.playing);
  return <Mascot mood={playing ? 'dance' : 'idle'} waves className="w-9 h-[26px] shrink-0" />;
}

/** Friends as in the app: their photos in a row, the cover of what each plays pinned to it. */
function FriendsNow() {
  const { data } = useFriends();
  const tr = useTr();
  const friends = data ?? [];
  if (!friends.length) return null;
  const listening = friends.filter((f) => f.now?.playing).length;
  return (
    <Shelf title={tr('Друзья', 'Friends')} subtitle={listening ? tr(`Сейчас слушают: ${listening}`, `Listening now: ${listening}`) : undefined} to="/friends">
      {friends.map((f) => (
        <Link key={f.id} to={`/user/${f.id}`} className="w-[92px] shrink-0 snap-start flex flex-col items-center py-1.5 rounded-[20px] press state-layer">
          <span className="relative">
            <Avatar user={f} className="w-[72px] h-[72px]" />
            {f.now && <Cover src={f.now.track.coverUrl} className="absolute -right-1 -bottom-0.5 w-[30px] h-[30px] !rounded-[9px] ring-2 ring-[var(--md-sys-color-background)]" />}
            {f.jamId && <span className="absolute -right-1 -top-1 w-6 h-6 rounded-full bg-tertiary text-on-tertiary grid place-items-center"><m3e-icon variant="rounded" name="headphones" style={{ ['--m3e-icon-size' as any]: '14px' }} /></span>}
          </span>
          <span className="mt-1.5 md-label-lg line-1 max-w-full">{f.displayName}</span>
          <span className={`md-label-sm line-1 max-w-full ${f.now?.playing ? 'text-primary' : 'muted'}`}>{f.now ? f.now.track.title : ''}</span>
        </Link>
      ))}
    </Shelf>
  );
}
