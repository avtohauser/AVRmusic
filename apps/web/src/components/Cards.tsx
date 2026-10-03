import { Link } from 'react-router-dom';
import type { AlbumSummary, ArtistSummary, Genre, PlaylistSummary, Track } from '@avrmusic/shared';
import { M3eCard, M3eIconButton } from '@/md';
import { Cover } from './Cover';
import { PlayButton } from './PlayButton';
import { usePlayer } from '@/stores/player';
import { useUI } from '@/stores/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';

const cardBase = 'group relative w-36 sm:w-40 md:w-44 shrink-0 snap-start';
const SHAPES: Array<'cookie' | 'clover' | 'sunny' | 'circle'> = ['cookie', 'clover', 'sunny', 'circle'];
const shapeFor = (id: string) => SHAPES[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % SHAPES.length];

function MediaCard({ to, onContextMenu, children }: { to: string; onContextMenu?: (e: any) => void; children: React.ReactNode }) {
  return (
    <Link to={to} className={cardBase} onContextMenu={onContextMenu}>
      <M3eCard variant="filled" actionable className="media-card block w-full">
        <div className="p-3">{children}</div>
      </M3eCard>
    </Link>
  );
}

export function AlbumCard({ album }: { album: AlbumSummary }) {
  const t = useT();
  const openMenu = useUI((s) => s.openMenu);
  const play = async () => {
    const full = await api.get<{ tracks: Track[] }>(`/api/albums/${album.id}`);
    usePlayer.getState().playTracks(full.tracks, 0, `album:${album.id}`);
  };
  const sub = album.type === 'single' ? t('single') : album.type === 'ep' ? t('ep') : album.type === 'compilation' ? t('compilation') : album.year ? String(album.year) : t('album');
  return (
    <MediaCard to={`/album/${album.id}`} onContextMenu={(e) => { e.preventDefault(); openMenu(e.clientX, e.clientY, { kind: 'album', album }); }}>
      <div className="relative">
        <Cover src={album.coverUrl} alt={album.title} className="w-full aspect-square !rounded-[20px] elev-1" />
        <PlayButton onClick={play} size="md" className="absolute right-2 bottom-2 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all" />
      </div>
      <div className="mt-3 md-title-sm line-1">{album.title}</div>
      <div className="md-body-sm muted line-1">{sub} · {album.artist.name}</div>
    </MediaCard>
  );
}

export function ArtistCard({ artist }: { artist: ArtistSummary }) {
  const t = useT();
  const play = async () => {
    const full = await api.get<{ topTracks: Track[] }>(`/api/artists/${artist.id}`);
    usePlayer.getState().playTracks(full.topTracks, 0, `artist:${artist.id}`);
  };
  return (
    <MediaCard to={`/artist/${artist.id}`}>
      <div className="relative">
        <Cover src={artist.imageUrl} alt={artist.name} shape={shapeFor(artist.id)} kind="artist" className="w-full aspect-square spring group-hover:rotate-6" />
        <PlayButton onClick={play} size="md" className="absolute right-1 bottom-1 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all" />
      </div>
      <div className="mt-3 md-title-sm line-1 text-center">{artist.name}</div>
      <div className="md-body-sm muted text-center">{t('artist')}</div>
    </MediaCard>
  );
}

export function PlaylistCard({ playlist }: { playlist: PlaylistSummary & { mosaic?: string[] } }) {
  const t = useT();
  const openMenu = useUI((s) => s.openMenu);
  const play = async () => {
    const full = await api.get<{ tracks: Track[] }>(`/api/playlists/${playlist.id}`);
    usePlayer.getState().playTracks(full.tracks, 0, `playlist:${playlist.id}`);
  };
  return (
    <MediaCard to={`/playlist/${playlist.id}`} onContextMenu={(e) => { e.preventDefault(); openMenu(e.clientX, e.clientY, { kind: 'playlist', playlist }); }}>
      <div className="relative">
        <Cover src={playlist.coverUrl} mosaic={playlist.mosaic} alt={playlist.title} className="w-full aspect-square !rounded-[20px] elev-1" />
        <PlayButton onClick={play} size="md" className="absolute right-2 bottom-2 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all" />
      </div>
      <div className="mt-3 md-title-sm line-1">{playlist.title}</div>
      <div className="md-body-sm muted line-2">{playlist.description || `${t('playlist')} · ${playlist.owner.displayName}`}</div>
    </MediaCard>
  );
}

export function TrackCard({ track, list, index }: { track: Track; list?: Track[]; index?: number }) {
  const current = usePlayer((s) => s.queue[s.index]?.id);
  const playing = usePlayer((s) => s.playing);
  const openMenu = useUI((s) => s.openMenu);
  const isCur = current === track.id;
  const play = () => {
    const p = usePlayer.getState();
    if (isCur) p.toggle();
    else p.playTracks(list ?? [track], index ?? 0, 'card');
  };
  return (
    <MediaCard to={track.album ? `/album/${track.album.id}` : `/artist/${track.artist.id}`} onContextMenu={(e) => { e.preventDefault(); openMenu(e.clientX, e.clientY, { kind: 'track', track }); }}>
      <div className="relative">
        <Cover src={track.coverUrl} alt={track.title} className="w-full aspect-square !rounded-[20px] elev-1" />
        <PlayButton playing={isCur && playing} onClick={play} size="md" className={`absolute right-2 bottom-2 transition-all ${isCur ? 'opacity-100' : 'opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0'}`} />
        <M3eIconButton size="small" variant="tonal" className="absolute left-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity" aria-label="menu" onClick={(e: any) => { e.preventDefault(); e.stopPropagation(); openMenu(e.clientX, e.clientY, { kind: 'track', track }); }}><m3e-icon variant="rounded" name="more_horiz" /></M3eIconButton>
      </div>
      <div className={`mt-3 md-title-sm line-1 ${isCur ? 'text-primary' : ''}`}>{track.title}</div>
      <div className="md-body-sm muted line-1">{track.artist.name}</div>
    </MediaCard>
  );
}

/** A genre: its colour, its name, and covers of its most played music fanned out in the corner. */
const FAN = [
  { cls: 'w-24 h-24 -right-3 -bottom-4 rounded-[30%] rotate-[-12deg] group-hover:rotate-[-20deg]', z: 'z-[3]' },
  { cls: 'w-20 h-20 right-14 -bottom-6 rounded-full rotate-[10deg] group-hover:rotate-[20deg] group-hover:-translate-x-1', z: 'z-[2]' },
  { cls: 'w-16 h-16 -right-5 bottom-14 rounded-[38%_62%_55%_45%] rotate-[24deg] group-hover:rotate-[34deg]', z: 'z-[1]' },
];
export function GenreCard({ genre, wide = false }: { genre: Genre; wide?: boolean }) {
  const covers = (genre.covers?.length ? genre.covers : genre.coverUrl ? [genre.coverUrl] : []).slice(0, FAN.length);
  return (
    <Link to={`/genre/${genre.slug}`} className={`group relative shrink-0 snap-start overflow-hidden rounded-[28px] spring hover:rounded-[36px] ${wide ? 'w-full aspect-[16/9]' : 'w-48 h-32'} p-4 md-title-lg emph text-white`} style={{ background: `linear-gradient(135deg, ${genre.color}, color-mix(in srgb, ${genre.color} 62%, black))` }}>
      <span className="relative z-10 drop-shadow line-2 pr-14 block">{genre.name}</span>
      <span className="absolute z-10 left-4 bottom-3 md-label-md text-white/80">♪ {genre.trackCount}</span>
      {covers.map((c, i) => (
        <img key={c} src={c} alt="" loading="lazy" className={`absolute ${FAN[i].z} ${FAN[i].cls} object-cover elev-2 spring`} />
      )).reverse()}
    </Link>
  );
}

export function QuickPick({ title, cover, mosaic, to, onPlay, liked }: { title: string; cover?: string | null; mosaic?: string[]; to: string; onPlay: () => void; liked?: boolean }) {
  return (
    <Link to={to} className="group surface-mid rounded-[16px] hover:rounded-[24px] spring flex items-center gap-3 pr-2 overflow-hidden h-14 sm:h-16 state-layer">
      {liked ? (
        <div className="w-14 sm:w-16 h-full bg-primary text-on-primary flex items-center justify-center shrink-0"><m3e-icon variant="rounded" name="favorite" filled /></div>
      ) : (
        <Cover src={cover} mosaic={mosaic} alt={title} className="w-14 sm:w-16 h-full !rounded-none" />
      )}
      <span className="md-title-sm line-2 text-xs sm:text-sm flex-1 min-w-0 pr-2">{title}</span>
      <PlayButton onClick={onPlay} size="sm" className="!hidden md:!flex opacity-0 group-hover:opacity-100 transition-opacity mr-1" />
    </Link>
  );
}
