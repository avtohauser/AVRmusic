// What friends sent: tracks, albums, playlists, invitations to own a playlist or to listen together;
// new releases of followed artists (from the server itself) and, for the admin, track reports.
import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { AlbumSummary, ArtistSummary, PlaylistSummary, Track } from '@avrmusic/shared';
import { M3eButton } from '@/md';
import { api } from '@/lib/api';
import { usePlayer } from '@/stores/player';
import { joinJam } from '@/lib/jam';
import { ago, useInbox, useTr, type JamSummary, type Share } from '@/lib/social';
import { Avatar, namesLine } from '@/components/Social';
import { Cover } from '@/components/Cover';
import { EmptyState } from '@/components/EmptyState';
import { TrackListSkeleton } from '@/components/Skeleton';

export default function Inbox() {
  const { data, isLoading } = useInbox();
  const qc = useQueryClient();
  const tr = useTr();
  const unread = (data ?? []).some((s) => !s.seen);
  useEffect(() => {
    if (!unread) return;
    const id = setTimeout(() => api.post('/api/shares/seen', {}).then(() => qc.invalidateQueries({ queryKey: ['inbox'] })).catch(() => {}), 2500);
    return () => clearTimeout(id);
  }, [unread, qc]);
  return (
    <div className="page pt-4 max-w-3xl">
      <h1 className="md-headline-lg emph mb-4">{tr('Входящие', 'Inbox')}</h1>
      {isLoading && <TrackListSkeleton />}
      {data && !data.length && <EmptyState icon="inbox" title={tr('Пока пусто', 'Nothing yet')} hint={tr('Здесь появится то, что пришлют друзья, и новинки ваших исполнителей', 'What friends send and new releases of your artists show up here')} />}
      <div className="space-y-2 fade-in">{(data ?? []).map((s) => <ShareCard key={s.id} s={s} />)}</div>
    </div>
  );
}

function ShareCard({ s }: { s: Share }) {
  const tr = useTr();
  const nav = useNavigate();
  const play = usePlayer.getState();
  const who = s.from?.displayName ?? 'AVRmusic';
  let what = '', title = '', sub = '', cover: string | null = null, round = false, to: string | null = null;
  let action: { icon: string; label: string; run: () => void } | null = null;
  switch (s.kind) {
    case 'track': { const t = s.item as Track; what = tr('прислал(а) трек', 'sent a track'); title = t.title; sub = t.artist.name; cover = t.coverUrl; to = t.album ? `/album/${t.album.id}` : null; action = { icon: 'play_arrow', label: tr('Слушать', 'Play'), run: () => play.playTrack(t, 'inbox') }; break; }
    case 'album': { const a = s.item as AlbumSummary; what = tr('прислал(а) альбом', 'sent an album'); title = a.title; sub = a.artist.name; cover = a.coverUrl; to = `/album/${a.id}`; action = { icon: 'play_arrow', label: tr('Слушать', 'Play'), run: async () => play.playTracks((await api.get<{ tracks: Track[] }>(`/api/albums/${a.id}`)).tracks, 0, `album:${a.id}`) }; break; }
    case 'artist': { const a = s.item as ArtistSummary; what = tr('советует исполнителя', 'recommends an artist'); title = a.name; cover = a.imageUrl; round = true; to = `/artist/${a.id}`; break; }
    case 'playlist': {
      const p = s.item as PlaylistSummary;
      what = s.message === 'invite' ? tr('сделал(а) вас совладельцем плейлиста', 'made you a co-owner of a playlist') : tr('прислал(а) плейлист', 'sent a playlist');
      title = p.title; sub = p.owner.displayName; cover = p.coverUrl; to = `/playlist/${p.id}`; break;
    }
    case 'jam': {
      const j = s.item as JamSummary;
      what = tr('зовёт слушать вместе', 'invites you to listen together'); title = namesLine(j.members, (n) => tr(`и ещё ${n}`, `and ${n} more`));
      sub = j.track ? `${j.track.artist.name} — ${j.track.title}` : ''; cover = j.track?.coverUrl ?? null;
      action = { icon: 'groups', label: tr('Присоединиться', 'Join'), run: () => void joinJam(j.id) }; break;
    }
    case 'release': {
      const r = s.item as { id: number; title: string; artist: string; coverUrl: string | null; type: string; year: number | null; libraryAlbumId: string | null };
      what = r.type === 'single' ? tr('новый сингл', 'a new single') : r.type === 'ep' ? tr('новый EP', 'a new EP') : tr('новый альбом', 'a new album');
      title = r.title; sub = r.artist; cover = r.coverUrl; to = r.libraryAlbumId ? `/album/${r.libraryAlbumId}` : `/catalog/album/${r.id}`;
      action = { icon: r.libraryAlbumId ? 'play_arrow' : 'open_in_new', label: r.libraryAlbumId ? tr('Слушать', 'Play') : tr('Открыть', 'Open'), run: async () => {
        if (r.libraryAlbumId) play.playTracks((await api.get<{ tracks: Track[] }>(`/api/albums/${r.libraryAlbumId}`)).tracks, 0, `album:${r.libraryAlbumId}`);
        else nav(`/catalog/album/${r.id}`);
      } };
      break;
    }
    case 'report': { const t = s.item as Track; what = tr('пожаловался(ась) на трек', 'reported a track'); title = t.title; sub = t.artist.name; cover = t.coverUrl; to = '/admin?tab=reports'; break; }
  }
  const message = s.message && !['invite', 'release'].includes(s.message) && s.kind !== 'report' ? s.message : '';
  return (
    <div className={`rounded-[28px] p-4 ${s.seen ? 'surface-low' : 'bg-secondary-container text-on-secondary-container'}`}>
      <div className="flex items-center gap-2 mb-3">
        {s.from ? <Avatar user={s.from} className="w-8 h-8" /> : <span className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center"><m3e-icon variant="rounded" name="campaign" style={{ ['--m3e-icon-size' as any]: '18px' }} /></span>}
        <span className="md-body-md min-w-0 line-1"><b className="md-title-sm">{who}</b> {what}</span>
        <span className="md-body-sm muted ml-auto shrink-0">{ago(s.createdAt)}</span>
      </div>
      {message && <p className="md-body-lg mb-3">«{message}»</p>}
      <div className="flex items-center gap-3">
        {to ? <Link to={to} className="flex items-center gap-3 min-w-0 flex-1"><Cover src={cover} shape={round ? 'cookie' : undefined} kind={round ? 'artist' : 'album'} className="w-14 h-14 !rounded-[16px]" /><Texts title={title} sub={sub} /></Link>
          : <div className="flex items-center gap-3 min-w-0 flex-1"><Cover src={cover} className="w-14 h-14 !rounded-[16px]" /><Texts title={title} sub={sub} /></div>}
        {action && <M3eButton variant="filled" onClick={action.run}><m3e-icon variant="rounded" slot="icon" name={action.icon} filled />{action.label}</M3eButton>}
      </div>
    </div>
  );
}

const Texts = ({ title, sub }: { title: string; sub: string }) => (
  <span className="min-w-0"><span className="block md-title-md emph line-1">{title}</span>{sub && <span className="block md-body-sm opacity-80 line-1">{sub}</span>}</span>
);
