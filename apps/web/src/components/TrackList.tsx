import { Link } from 'react-router-dom';
import type { Track } from '@avrmusic/shared';
import { Cover } from './Cover';
import { LikeButton } from './LikeButton';
import { usePlayer } from '@/stores/player';
import { useUI } from '@/stores/ui';
import { fmtMs, fmtDate } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useOfflineIds } from '@/lib/hooks';
import { Clock, MoreHorizontal, Play, Pause, Mic2, Clapperboard, CheckCircle2, Download } from 'lucide-react';
import { downloadUrl } from '@/lib/api';
import { useAuth } from '@/stores/auth';

interface Props {
  tracks: Track[];
  context?: string;
  showAlbum?: boolean;
  showCover?: boolean;
  showAddedAt?: boolean;
  numbered?: boolean;
  playlistId?: string;
  canRemove?: boolean;
  compact?: boolean;
  header?: boolean;
}

export function TrackList({ tracks, context, showAlbum = true, showCover = true, showAddedAt = false, numbered = true, playlistId, canRemove, compact = false, header = true }: Props) {
  const currentId = usePlayer((s) => s.queue[s.index]?.id);
  const playing = usePlayer((s) => s.playing);
  const openMenu = useUI((s) => s.openMenu);
  const menuTrack = useUI((s) => (s.menu?.target.kind === 'track' ? s.menu.target.track.id : null));
  const offline = useOfflineIds();
  const lang = useI18n((s) => s.lang);
  const user = useAuth((s) => s.user);

  const play = (i: number) => {
    const p = usePlayer.getState();
    if (tracks[i].id === currentId) p.toggle();
    else p.playTracks(tracks, i, context);
  };

  return (
    <div className="fade-in">
      {header && !compact && (
        <div className={`track-row ${showAlbum ? '' : 'no-album'} text-xs uppercase tracking-wide text-muted border-b border-line mb-2 !rounded-none hidden md:grid`}>
          <span className="text-center">#</span>
          <span>{lang === 'en' ? 'Title' : 'Название'}</span>
          {showAlbum && <span>{showAddedAt ? (lang === 'en' ? 'Added' : 'Добавлено') : lang === 'en' ? 'Album' : 'Альбом'}</span>}
          <span className="text-right pr-2"><Clock size={14} className="inline" /></span>
          <span />
        </div>
      )}
      {tracks.map((track, i) => {
        const isCur = track.id === currentId;
        return (
          <div
            key={`${track.id}-${i}`}
            className={`track-row ${showAlbum ? '' : 'no-album'} cursor-pointer select-none`}
            data-current={isCur}
            data-menu={menuTrack === track.id}
            onDoubleClick={() => play(i)}
            onClick={(e) => { if (window.matchMedia('(hover: none)').matches && !(e.target as HTMLElement).closest('button,a')) play(i); }}
            onContextMenu={(e) => { e.preventDefault(); openMenu(e.clientX, e.clientY, { kind: 'track', track, playlistId, canRemove }); }}
          >
            <button className="w-8 h-8 flex items-center justify-center text-muted text-sm tabular-nums group" onClick={() => play(i)} aria-label="play">
              {isCur ? (
                playing ? <span className="eq"><i /><i /><i /></span> : <Play size={14} fill="currentColor" className="text-accent" />
              ) : (
                <>
                  <span className="group-hover:hidden">{numbered ? i + 1 : ''}</span>
                  <Play size={14} fill="currentColor" className="hidden group-hover:block" />
                </>
              )}
              {isCur && playing && <Pause size={14} fill="currentColor" className="hidden" />}
            </button>
            <div className="flex items-center gap-3 min-w-0">
              {showCover && <Cover src={track.coverUrl} alt="" className={compact ? 'w-9 h-9' : 'w-10 h-10 md:w-11 md:h-11'} />}
              <div className="min-w-0">
                <div className={`track-title font-medium line-clamp-1 ${isCur ? 'text-accent' : ''}`}>{track.title}{track.explicit && <span className="ml-1.5 text-[10px] px-1 rounded bg-surface-2 text-muted align-middle">E</span>}</div>
                <div className="text-sm text-muted truncate">
                  {offline.has(track.id) && <CheckCircle2 size={13} className="text-emerald-400 inline align-[-2px] mr-1" />}
                  {track.hasSyncedLyrics && <Mic2 size={12} className="inline align-[-1px] mr-1 opacity-70" />}
                  {track.hasCanvas && <Clapperboard size={12} className="inline align-[-1px] mr-1 opacity-70" />}
                  <Link to={`/artist/${track.artist.id}`} className="hover:underline hover:text-fg" onClick={(e) => e.stopPropagation()}>{track.artist.name}</Link>
                  {track.featuring.map((f) => (<span key={f.id}>, <Link to={`/artist/${f.id}`} className="hover:underline hover:text-fg" onClick={(e) => e.stopPropagation()}>{f.name}</Link></span>))}
                  {!showAlbum && track.album && <span className="md:hidden">· {track.album.title}</span>}
                </div>
              </div>
            </div>
            {showAlbum && (
              <div className="hidden md:block text-sm text-muted line-clamp-1">
                {showAddedAt && track.addedAt ? fmtDate(track.addedAt, lang) : track.album ? <Link to={`/album/${track.album.id}`} className="hover:underline hover:text-fg" onClick={(e) => e.stopPropagation()}>{track.album.title}</Link> : '—'}
              </div>
            )}
            <div className="hidden md:block text-sm text-muted tabular-nums text-right pr-2">{fmtMs(track.durationMs)}</div>
            <div className="flex items-center gap-0.5 justify-end">
              <LikeButton type="track" id={track.id} />
              {user && <a className="icon-btn row-actions" href={downloadUrl(track.id)} download title={lang === 'en' ? 'Download' : 'Скачать'} onClick={(e) => e.stopPropagation()}><Download size={17} /></a>}
              <button className="icon-btn row-actions" aria-label="menu" onClick={(e) => { e.stopPropagation(); openMenu(e.clientX, e.clientY, { kind: 'track', track, playlistId, canRemove }); }}><MoreHorizontal size={18} /></button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
