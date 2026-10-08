// A friend's page: what they play now, how close your tastes are, their month and playlists.
import { useNavigate, useParams } from 'react-router-dom';
import { M3eButton } from '@/md';
import { startFollow, stopFollow, useFollow } from '@/lib/follow';
import { useI18n } from '@/lib/i18n';
import { fmtNumber } from '@/lib/format';
import { joinJam } from '@/lib/jam';
import { startWave } from '@/lib/wave';
import { ago, blendWith, compatLabel, sendToFriends, useFriend, useTr } from '@/lib/social';
import { Avatar } from '@/components/Social';
import { ArtistCard, PlaylistCard } from '@/components/Cards';
import { Shelf } from '@/components/Shelf';
import { TrackList } from '@/components/TrackList';
import { TrackListSkeleton } from '@/components/Skeleton';
import { EmptyState } from '@/components/EmptyState';
import { Cover } from '@/components/Cover';
import { BadgeChips, BadgeOrbit } from '@/components/Badges';

export default function Friend() {
  const { id = '' } = useParams();
  const { data: f, isLoading, error } = useFriend(id);
  const tr = useTr();
  const lang = useI18n((s) => s.lang);
  const nav = useNavigate();
  const following = useFollow((s) => s.friend?.id);
  if (error) return <div className="page pt-10"><EmptyState icon="error" title={(error as any).message} /></div>;
  if (isLoading || !f) return <div className="page pt-8"><TrackListSkeleton /></div>;
  const c = f.compat;
  const along = following === f.id;
  return (
    <div className="page pt-4">
      <div className="flex items-center gap-5 mb-6">
        <BadgeOrbit badges={(f as any).badges ?? []} size={128}><Avatar user={f} className="w-24 h-24 md:w-32 md:h-32 md-display-sm" /></BadgeOrbit>
        <div className="min-w-0">
          <h1 className="md-display-sm emph line-1">{f.displayName}</h1>
          {!!(f as any).badges?.length && <div className="mt-1 mb-1"><BadgeChips badges={(f as any).badges} /></div>}
          <div className="md-body-md muted">@{f.username}{!f.now && f.lastSeenAt ? ` · ${tr(`был(а) ${ago(f.lastSeenAt)}`, `seen ${ago(f.lastSeenAt)}`)}` : ''}</div>
          <div className="flex flex-wrap gap-2 mt-3">
            <M3eButton variant="filled" onClick={() => void startWave(`friend:${f.id}`)}><m3e-icon variant="rounded" slot="icon" name="all_inclusive" />{tr('Волна друга', "Friend's wave")}</M3eButton>
            <M3eButton variant="tonal" onClick={() => blendWith(nav, tr, [f.id])}><m3e-icon variant="rounded" slot="icon" name="blender" />{tr('Блендер вдвоём', 'Blend together')}</M3eButton>
            {f.jamId && <M3eButton variant="tonal" onClick={() => void joinJam(f.jamId!)}><m3e-icon variant="rounded" slot="icon" name="groups" />{tr('Слушать вместе', 'Listen together')}</M3eButton>}
          </div>
        </div>
      </div>

      {f.now && (
        <div className="surface-low rounded-[28px] p-4 mb-6 flex items-center gap-4">
          <Cover src={f.now.track.coverUrl} className="w-16 h-16 !rounded-[16px]" />
          <div className="min-w-0 flex-1">
            <div className="md-label-md muted uppercase flex items-center gap-2">{f.now.playing ? <span className="eq"><i /><i /><i /></span> : null}{tr('Сейчас слушает', 'Listening now')}</div>
            <div className="md-title-md emph line-1">{f.now.track.title}</div>
            <div className="md-body-sm muted line-1">{f.now.track.artist.name}</div>
          </div>
          {along
            ? <M3eButton variant="tonal" onClick={() => stopFollow()}><m3e-icon variant="rounded" slot="icon" name="stop" filled />{tr('Хватит', 'Stop')}</M3eButton>
            : <M3eButton variant="filled" title={tr('Играть то же, что у друга, и переключаться вслед за ним', 'Play what your friend plays and switch along with them')}
                onClick={() => void startFollow({ id: f.id, displayName: f.displayName, avatarUrl: f.avatarUrl })}><m3e-icon variant="rounded" slot="icon" name="headphones" filled />{tr('Слушать с ним', 'Listen along')}</M3eButton>}
          <M3eButton variant="text" onClick={() => sendToFriends('track', f.now!.track.id, f.now!.track.title)}><m3e-icon variant="rounded" slot="icon" name="send" /></M3eButton>
        </div>
      )}

      {c && (
        <section className="rounded-[32px] p-5 md:p-6 mb-8 bg-primary-container text-on-primary-container">
          <div className="flex items-center gap-5">
            <div className="md-display-md emph tabular-nums">{c.score}%</div>
            <div className="min-w-0"><div className="md-title-lg emph">{compatLabel(c.label)}</div><div className="md-body-md opacity-80">{tr('совпадение вкусов', 'taste match')}</div></div>
          </div>
          {c.commonArtists.length > 0 && <p className="md-body-md mt-3 opacity-90">{tr('Вы оба слушаете', 'You both listen to')}: {c.commonArtists.map((a) => a.name).join(', ')}</p>}
        </section>
      )}
      {c && c.commonTracks.length > 0 && <section className="mb-8"><h2 className="md-headline-sm emph mb-2">{tr('Общие любимые', 'Shared favourites')}</h2><TrackList tracks={c.commonTracks} context={`friend-common:${f.id}`} compact /></section>}

      <div className="grid grid-cols-2 gap-3 mb-8 max-w-lg">
        <div className="surface-low rounded-[24px] p-4"><div className="md-label-md muted uppercase">{tr('Минут за месяц', 'Minutes this month')}</div><div className="md-headline-md emph">{fmtNumber(f.stats.minutes, lang)}</div></div>
        <div className="surface-low rounded-[24px] p-4"><div className="md-label-md muted uppercase">{tr('Любимых треков', 'Liked tracks')}</div><div className="md-headline-md emph">{fmtNumber(f.stats.likes, lang)}</div></div>
      </div>
      {f.stats.topArtists.length > 0 && <Shelf title={tr('Топ исполнителей месяца', 'Top artists this month')}>{f.stats.topArtists.map((a) => <ArtistCard key={a.id} artist={a} />)}</Shelf>}
      {f.stats.recent.length > 0 && <section className="mb-8"><h2 className="md-headline-sm emph mb-2">{tr('Недавно слушал(а)', 'Recently played')}</h2><TrackList tracks={f.stats.recent} context={`friend-recent:${f.id}`} /></section>}
      {f.playlists.length > 0 && <Shelf title={tr('Плейлисты', 'Playlists')}>{f.playlists.map((p) => <PlaylistCard key={p.id} playlist={p} />)}</Shelf>}
    </div>
  );
}
