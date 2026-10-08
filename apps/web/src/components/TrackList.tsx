import { Link } from 'react-router-dom';
import type { Track } from '@avrmusic/shared';
import { M3eIconButton } from '@/md';
import { Cover } from './Cover';
import { LikeButton } from './LikeButton';
import { usePlayer } from '@/stores/player';
import { useUI } from '@/stores/ui';
import { useAuth } from '@/stores/auth';
import { fmtMs, fmtDate } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useOfflineIds } from '@/lib/hooks';
import { downloadUrl } from '@/lib/api';

interface Props {
  tracks: Track[];
  context?: string;
  showAlbum?: boolean;
  showCover?: boolean;
  showAddedAt?: boolean;
  /** shared playlists: who put each track in (a blend: whose taste it came from) */
  showAddedBy?: boolean;
  addedByTaste?: boolean;
  numbered?: boolean;
  playlistId?: string;
  canRemove?: boolean;
  compact?: boolean;
  header?: boolean;
}

export function TrackList({ tracks, context, showAlbum = true, showCover = true, showAddedAt = false, showAddedBy = false, addedByTaste = false, numbered = true, playlistId, canRemove, compact = false, header = true }: Props) {
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
        <div className={`track-row ${showAlbum ? '' : 'no-album'} md-label-md muted uppercase tracking-wide border-b border-outline-variant mb-2 !rounded-none hidden md:grid`}>
          <span className="text-center">#</span>
          <span>{lang === 'en' ? 'Title' : 'Название'}</span>
          {showAlbum && <span>{showAddedAt ? (lang === 'en' ? 'Added' : 'Добавлено') : lang === 'en' ? 'Album' : 'Альбом'}</span>}
          <span className="text-right pr-2"><m3e-icon variant="rounded" name="schedule" style={{ ['--m3e-icon-size' as any]: '16px' }} /></span>
          <span />
        </div>
      )}
      {tracks.map((track, i) => {
        const isCur = track.id === currentId;
        return (
          <div
            key={`${track.id}-${i}`}
            className={`track-row ${showAlbum ? '' : 'no-album'} ${showCover ? 'has-cover' : ''} cursor-pointer select-none`}
            data-current={isCur}
            data-menu={menuTrack === track.id}
            onDoubleClick={() => play(i)}
            onClick={(e) => { if (window.matchMedia('(hover: none)').matches && !(e.target as HTMLElement).closest('button,a,m3e-icon-button')) play(i); }}
            onContextMenu={(e) => { e.preventDefault(); openMenu(e.clientX, e.clientY, { kind: 'track', track, playlistId, canRemove }); }}
          >
            <button className="tr-num w-10 h-10 flex items-center justify-center muted md-label-lg tabular-nums group rounded-full" onClick={() => play(i)} aria-label="play">
              {isCur ? (
                playing ? <span className="eq"><i /><i /><i /></span> : <m3e-icon variant="rounded" name="play_arrow" filled style={{ color: 'var(--md-sys-color-primary)' }} />
              ) : (
                <>
                  <span className="group-hover:hidden">{numbered ? i + 1 : ''}</span>
                  <m3e-icon variant="rounded" name="play_arrow" filled className="hidden group-hover:block" />
                </>
              )}
            </button>
            <div className="flex items-center gap-3 min-w-0">
              {showCover && <Cover src={track.coverUrl} alt="" className={`${compact ? 'w-11 h-11' : 'w-[50px] h-[50px] md:w-12 md:h-12'} !rounded-[12px]`} />}
              <div className="min-w-0">
                <div className={`track-title md-title-md line-1 ${isCur ? 'text-primary' : ''}`}>{track.title}{track.explicit && <span className="ml-1.5 md-label-sm px-1 rounded bg-surface-container-highest muted align-middle">E</span>}</div>
                <div className="md-body-md muted truncate">
                  {offline.has(track.id) && <m3e-icon variant="rounded" name="offline_pin" filled className="inline align-[-3px] mr-1" style={{ color: 'var(--md-sys-color-tertiary)', ['--m3e-icon-size' as any]: '14px' }} />}
                  {track.hasSyncedLyrics && <m3e-icon variant="rounded" name="lyrics" className="inline align-[-3px] mr-1 opacity-70" style={{ ['--m3e-icon-size' as any]: '14px' }} />}
                  {track.hasCanvas && <m3e-icon variant="rounded" name="movie" className="inline align-[-3px] mr-1 opacity-70" style={{ ['--m3e-icon-size' as any]: '14px' }} />}
                  <Link to={`/artist/${track.artist.id}`} className="hover:underline hover:text-on-surface" onClick={(e) => e.stopPropagation()}>{track.artist.name}</Link>
                  {track.featuring.map((f) => (<span key={f.id}>, <Link to={`/artist/${f.id}`} className="hover:underline hover:text-on-surface" onClick={(e) => e.stopPropagation()}>{f.name}</Link></span>))}
                  {!showAlbum && track.album && <span className="md:hidden"> · {track.album.title}</span>}
                  {showAddedBy && track.addedBy && <span className="md:hidden"> · {addedByTaste ? (lang === 'en' ? 'taste: ' : 'вкус: ') : ''}{track.addedBy.displayName}</span>}
                </div>
              </div>
            </div>
            {showAlbum && (
              <div className="hidden md:block md-body-md muted line-1">
                {showAddedAt && track.addedAt ? <>{fmtDate(track.addedAt, lang)}{showAddedBy && track.addedBy ? <span> · {addedByTaste ? (lang === 'en' ? 'taste: ' : 'вкус: ') : ''}{track.addedBy.displayName}</span> : null}</> : track.album ? <Link to={`/album/${track.album.id}`} className="hover:underline hover:text-on-surface" onClick={(e) => e.stopPropagation()}>{track.album.title}</Link> : '—'}
              </div>
            )}
            <div className="hidden md:block md-body-md muted tabular-nums text-right pr-2">{fmtMs(track.durationMs)}</div>
            <div className="flex items-center gap-0.5 justify-end">
              <LikeButton type="track" id={track.id} />
              {user && <M3eIconButton size="small" className="row-actions" href={downloadUrl(track.id)} download="" title={lang === 'en' ? 'Download' : 'Скачать'} onClick={(e: any) => e.stopPropagation()}><m3e-icon variant="rounded" name="download" /></M3eIconButton>}
              <M3eIconButton size="small" className="row-actions" aria-label="menu" onClick={(e: any) => { e.stopPropagation(); openMenu(e.clientX, e.clientY, { kind: 'track', track, playlistId, canRemove }); }}><m3e-icon variant="rounded" name="more_vert" /></M3eIconButton>
            </div>
          </div>
        );
      })}
    </div>
  );
}
