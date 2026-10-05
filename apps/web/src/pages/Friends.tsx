// Friends: who listens to what right now, listening together, a blend of several tastes.
import { Link, useNavigate } from 'react-router-dom';
import { M3eButton } from '@/md';
import { usePlayer } from '@/stores/player';
import { joinJam, listenTogether } from '@/lib/jam';
import { ago, blendWith, useFriends, useInbox, useTr, type Friend } from '@/lib/social';
import { Avatar } from '@/components/Social';
import { EmptyState } from '@/components/EmptyState';
import { ShelfSkeleton } from '@/components/Skeleton';

export default function Friends() {
  const { data: friends, isLoading } = useFriends();
  const { data: inbox } = useInbox();
  const tr = useTr();
  const nav = useNavigate();
  const unread = (inbox ?? []).filter((s) => !s.seen).length;
  return (
    <div className="page pt-4">
      <h1 className="md-headline-lg emph mb-4">{tr('Друзья', 'Friends')}</h1>
      <div className="flex flex-wrap gap-2 mb-6">
        <M3eButton variant="filled" onClick={() => void listenTogether(tr)}><m3e-icon variant="rounded" slot="icon" name="groups" />{tr('Слушать вместе', 'Listen together')}</M3eButton>
        <M3eButton variant="tonal" onClick={() => blendWith(nav, tr)}><m3e-icon variant="rounded" slot="icon" name="blender" />{tr('Блендер', 'Blend')}</M3eButton>
        <M3eButton variant="tonal" href="/inbox"><m3e-icon variant="rounded" slot="icon" name="inbox" />{tr('Входящие', 'Inbox')}{unread ? ` · ${unread}` : ''}</M3eButton>
        <M3eButton variant="tonal" href="/recap"><m3e-icon variant="rounded" slot="icon" name="leaderboard" />{tr('Мои итоги', 'My recap')}</M3eButton>
      </div>
      {isLoading && <ShelfSkeleton round />}
      {friends && !friends.length && <EmptyState icon="group" title={tr('Пока здесь никого', 'Nobody here yet')} hint={tr('Друзья появятся, когда зарегистрируются по вашему приглашению', 'Friends appear once they sign up with your invite')} />}
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 fade-in">{(friends ?? []).map((f) => <FriendCard key={f.id} f={f} />)}</div>
    </div>
  );
}

export function FriendCard({ f }: { f: Friend }) {
  const tr = useTr();
  const now = f.now;
  return (
    <Link to={`/user/${f.id}`} className="surface-low rounded-[28px] hover:rounded-[36px] spring p-4 flex items-center gap-3 state-layer">
      <Avatar user={f} className="w-14 h-14" />
      <div className="min-w-0 flex-1">
        <div className="md-title-md emph line-1">{f.displayName}</div>
        {now ? (
          <div className="md-body-sm line-1 flex items-center gap-1.5">
            {now.playing ? <span className="eq shrink-0"><i /><i /><i /></span> : <m3e-icon variant="rounded" name="pause" style={{ ['--m3e-icon-size' as any]: '14px' }} />}
            <span className="line-1">{now.track.artist.name} — {now.track.title}</span>
          </div>
        ) : <div className="md-body-sm muted line-1">{f.lastSeenAt ? tr(`был(а) ${ago(f.lastSeenAt)}`, `seen ${ago(f.lastSeenAt)}`) : `@${f.username}`}</div>}
      </div>
      {f.jamId ? (
        <M3eButton variant="filled" onClick={(e: any) => { e.preventDefault(); void joinJam(f.jamId!); }}><m3e-icon variant="rounded" slot="icon" name="groups" />{tr('К ним', 'Join')}</M3eButton>
      ) : now ? (
        <M3eButton variant="tonal" title={tr('Включить этот трек', 'Play this track')} onClick={(e: any) => { e.preventDefault(); usePlayer.getState().playTrack(now.track, `friend:${f.id}`); }}><m3e-icon variant="rounded" slot="icon" name="play_arrow" filled />{tr('Тоже', 'Me too')}</M3eButton>
      ) : null}
    </Link>
  );
}
