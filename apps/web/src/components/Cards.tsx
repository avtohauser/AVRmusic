import { Link, useNavigate } from 'react-router-dom';
import type { AlbumSummary, ArtistSummary, Genre, PlaylistSummary, Track } from '@avrmusic/shared';
import { Cover } from './Cover';
import { PlayButton } from './PlayButton';
import { usePlayer } from '@/stores/player';
import { useUI } from '@/stores/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { Heart, MoreHorizontal } from 'lucide-react';

const cardBase = 'group relative w-36 sm:w-40 md:w-44 shrink-0 snap-start p-3 rounded-2xl card-hover text-left';

export function AlbumCard({ album }: { album: AlbumSummary }) {
  const t = useT();
  const nav = useNavigate();
  const openMenu = useUI((s) => s.openMenu);
  const play = async (e: React.MouseEvent) => {
    e.preventDefault();
    const full = await api.get<{ tracks: Track[] }>(`/api/albums/${album.id}`);
    usePlayer.getState().playTracks(full.tracks, 0, `album:${album.id}`);
  };
  const sub = album.type === 'single' ? t('single') : album.type === 'ep' ? t('ep') : album.type === 'compilation' ? t('compilation') : album.year ? String(album.year) : t('album');
  return (
    <Link to={`/album/${album.id}`} className={cardBase} onContextMenu={(e) => { e.preventDefault(); openMenu(e.clientX, e.clientY, { kind: 'album', album }); }}>
      <div className="relative">
        <Cover src={album.coverUrl} alt={album.title} className="w-full aspect-square shadow-lg shadow-black/30" />
        <PlayButton onClick={play} size="md" className="absolute right-2 bottom-2 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all" />
      </div>
      <div className="mt-3 font-semibold line-clamp-1">{album.title}</div>
      <div className="text-sm text-muted line-clamp-1">{sub} · <span onClick={(e) => { e.preventDefault(); nav(`/artist/${album.artist.id}`); }} className="hover:underline">{album.artist.name}</span></div>
    </Link>
  );
}

export function ArtistCard({ artist }: { artist: ArtistSummary }) {
  const t = useT();
  const play = async (e: React.MouseEvent) => {
    e.preventDefault();
    const full = await api.get<{ topTracks: Track[] }>(`/api/artists/${artist.id}`);
    usePlayer.getState().playTracks(full.topTracks, 0, `artist:${artist.id}`);
  };
  return (
    <Link to={`/artist/${artist.id}`} className={`${cardBase} text-center`}>
      <div className="relative">
        <Cover src={artist.imageUrl} alt={artist.name} round kind="artist" className="w-full aspect-square shadow-lg shadow-black/30" />
        <PlayButton onClick={play} size="md" className="absolute right-1 bottom-1 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all" />
      </div>
      <div className="mt-3 font-semibold line-clamp-1">{artist.name}</div>
      <div className="text-sm text-muted">{t('artist')}</div>
    </Link>
  );
}

export function PlaylistCard({ playlist }: { playlist: PlaylistSummary & { mosaic?: string[] } }) {
  const t = useT();
  const openMenu = useUI((s) => s.openMenu);
  const play = async (e: React.MouseEvent) => {
    e.preventDefault();
    const full = await api.get<{ tracks: Track[] }>(`/api/playlists/${playlist.id}`);
    usePlayer.getState().playTracks(full.tracks, 0, `playlist:${playlist.id}`);
  };
  return (
    <Link to={`/playlist/${playlist.id}`} className={cardBase} onContextMenu={(e) => { e.preventDefault(); openMenu(e.clientX, e.clientY, { kind: 'playlist', playlist }); }}>
      <div className="relative">
        <Cover src={playlist.coverUrl} mosaic={playlist.mosaic} alt={playlist.title} className="w-full aspect-square shadow-lg shadow-black/30" />
        <PlayButton onClick={play} size="md" className="absolute right-2 bottom-2 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all" />
      </div>
      <div className="mt-3 font-semibold line-clamp-1">{playlist.title}</div>
      <div className="text-sm text-muted line-clamp-2">{playlist.description || `${t('playlist')} · ${playlist.owner.displayName}`}</div>
    </Link>
  );
}

export function TrackCard({ track, list, index }: { track: Track; list?: Track[]; index?: number }) {
  const current = usePlayer((s) => s.queue[s.index]?.id);
  const playing = usePlayer((s) => s.playing);
  const openMenu = useUI((s) => s.openMenu);
  const isCur = current === track.id;
  const play = (e: React.MouseEvent) => {
    e.preventDefault();
    const p = usePlayer.getState();
    if (isCur) p.toggle();
    else p.playTracks(list ?? [track], index ?? 0, 'card');
  };
  return (
    <Link to={`/album/${track.album?.id ?? ''}`} onClick={(e) => { if (!track.album) e.preventDefault(); }} className={cardBase} onContextMenu={(e) => { e.preventDefault(); openMenu(e.clientX, e.clientY, { kind: 'track', track }); }}>
      <div className="relative">
        <Cover src={track.coverUrl} alt={track.title} className="w-full aspect-square shadow-lg shadow-black/30" />
        <PlayButton playing={isCur && playing} onClick={play} size="md" className={`absolute right-2 bottom-2 transition-all ${isCur ? 'opacity-100' : 'opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0'}`} />
        <button className="absolute left-2 top-2 icon-btn glass opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => { e.preventDefault(); e.stopPropagation(); openMenu(e.clientX, e.clientY, { kind: 'track', track }); }} aria-label="menu"><MoreHorizontal size={16} /></button>
      </div>
      <div className={`mt-3 font-semibold line-clamp-1 ${isCur ? 'text-accent' : ''}`}>{track.title}</div>
      <div className="text-sm text-muted line-clamp-1">{track.artist.name}</div>
    </Link>
  );
}

export function GenreCard({ genre, wide = false }: { genre: Genre; wide?: boolean }) {
  return (
    <Link to={`/genre/${genre.slug}`} className={`relative shrink-0 snap-start overflow-hidden rounded-2xl ${wide ? 'w-full aspect-[16/9]' : 'w-44 h-28'} p-4 font-bold text-lg text-white transition-transform hover:scale-[1.02]`} style={{ background: genre.color }}>
      <span className="relative z-10 drop-shadow">{genre.name}</span>
      {genre.coverUrl && <img src={genre.coverUrl} alt="" className="absolute -right-4 -bottom-4 w-24 h-24 rounded-lg rotate-[25deg] shadow-xl object-cover opacity-90" loading="lazy" />}
      <span className="absolute inset-0 bg-gradient-to-br from-black/0 to-black/30" />
    </Link>
  );
}

export function QuickPick({ title, cover, mosaic, to, onPlay, liked }: { title: string; cover?: string | null; mosaic?: string[]; to: string; onPlay: () => void; liked?: boolean }) {
  return (
    <Link to={to} className="group card card-hover flex items-center gap-3 pr-2 overflow-hidden h-14 sm:h-16">
      {liked ? (
        <div className="w-14 sm:w-16 h-full accent-gradient flex items-center justify-center text-white shrink-0"><Heart size={22} fill="currentColor" /></div>
      ) : (
        <Cover src={cover} mosaic={mosaic} alt={title} className="w-14 sm:w-16 h-full !rounded-none" />
      )}
      <span className="font-semibold line-clamp-2 text-xs sm:text-sm flex-1 min-w-0 pr-2">{title}</span>
      <PlayButton onClick={onPlay} size="sm" className="!hidden md:!flex opacity-0 group-hover:opacity-100 transition-opacity mr-1" />
    </Link>
  );
}
