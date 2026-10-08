import { useState } from 'react';
import { Link } from 'react-router-dom';
import { artistHref } from '@/lib/instant';
import { M3eIconButton } from '@/md';
import { WavyProgress } from './WavyProgress';
import { usePlayer } from '@/stores/player';
import { useUI } from '@/stores/ui';
import { Cover } from './Cover';
import { LikeButton } from './LikeButton';
import { fmtTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { DevicesButton } from './Devices';
import { MorphPlay } from './MorphPlay';
import { WavySeek } from './WavySeek';
import { Volume } from './Volume';


export function PlayerBar() {
  const track = usePlayer((s) => s.queue[s.index] ?? null);
  const playing = usePlayer((s) => s.playing);
  const loading = usePlayer((s) => s.loading);
  const position = usePlayer((s) => s.position);
  const duration = usePlayer((s) => s.duration);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const p = usePlayer.getState();
  const setOpen = useUI((s) => s.setNowPlayingOpen);
  const queueOpen = useUI((s) => s.queueOpen);
  const setQueueOpen = useUI((s) => s.setQueueOpen);
  const t = useT();
  const [seeking, setSeeking] = useState<number | null>(null);
  if (!track) return null;
  const pos = seeking ?? position;

  return (
    <>
      {/* Phone: the app's mini player — a floating card above the navigation island */}
      <div className="md:hidden mini-player press" data-playerbar onClick={() => setOpen(true)}>
        <div className="flex items-center gap-3 pl-2 pr-1.5 pt-2 pb-1.5">
          <Cover src={track.coverUrl} className="w-12 h-12 !rounded-[16px]" />
          <div className="min-w-0 flex-1">
            <div className="md-title-sm line-1">{track.title}</div>
            <div className="md-body-sm muted line-1">{[track.artist.name, ...track.featuring.map((f) => f.name)].join(', ')}</div>
          </div>
          <LikeButton type="track" id={track.id} alwaysVisible />
          <MorphPlay playing={playing} loading={loading} onClick={() => p.toggle()} size={44} label={playing ? t('pause') : t('play')} />
        </div>
        <WavyProgress className="mini" moving={playing} value={duration ? (pos / duration) * 100 : 0} />
      </div>
    <div className="hidden md:block fixed z-[60] px-3 pb-3" style={{ bottom: 'var(--safe-b)', left: 'var(--safe-l)', right: 'var(--safe-r)' }} data-playerbar>
      {/* Desktop */}
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)] items-center gap-4 surface-high rounded-[32px] px-4 h-[84px] elev-3">
        <div className="flex items-center gap-3 min-w-0">
          <button className="relative group shrink-0" onClick={() => setOpen(true)} aria-label={t('fullscreen')}>
            <Cover src={track.coverUrl} className="w-14 h-14 !rounded-[16px]" />
            <span className="absolute inset-0 rounded-[16px] bg-black/50 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"><m3e-icon variant="rounded" name="fullscreen" /></span>
          </button>
          <div className="min-w-0">
            <div className="md-title-sm line-1"><button className="hover:underline text-left" onClick={() => setOpen(true)}>{track.title}</button></div>
            <div className="md-body-sm muted line-1">
              <Link to={artistHref(track.artist)} className="hover:underline">{track.artist.name}</Link>
              {track.featuring.map((f) => <span key={f.id || f.name}>, <Link to={artistHref(f)} className="hover:underline">{f.name}</Link></span>)}
            </div>
          </div>
          <LikeButton type="track" id={track.id} alwaysVisible />
        </div>

        <div className="flex flex-col items-center gap-0.5">
          <div className="flex items-center gap-1">
            <M3eIconButton id="pb-shuffle" toggle selected={shuffle || undefined} variant="standard" size="small" onClick={p.toggleShuffle}><m3e-icon variant="rounded" name="shuffle" /><m3e-icon variant="rounded" slot="selected" name="shuffle" filled style={{ color: 'var(--md-sys-color-primary)' }} /></M3eIconButton>
            <m3e-tooltip for="pb-shuffle">{t('shuffle')}</m3e-tooltip>
            <M3eIconButton variant="tonal" aria-label={t('prev')} onClick={p.prev}><m3e-icon variant="rounded" name="skip_previous" filled /></M3eIconButton>
            <MorphPlay playing={playing} loading={loading} onClick={() => p.toggle()} size={48} label={playing ? t('pause') : t('play')} className="mx-1" />
            <M3eIconButton variant="tonal" aria-label={t('next')} onClick={() => p.next()}><m3e-icon variant="rounded" name="skip_next" filled /></M3eIconButton>
            <M3eIconButton id="pb-repeat" toggle selected={repeat !== 'off' || undefined} variant="standard" size="small" onClick={p.cycleRepeat}><m3e-icon variant="rounded" name="repeat" /><m3e-icon variant="rounded" slot="selected" name={repeat === 'one' ? 'repeat_one' : 'repeat'} filled style={{ color: 'var(--md-sys-color-primary)' }} /></M3eIconButton>
            <m3e-tooltip for="pb-repeat">{t('repeat')}</m3e-tooltip>
          </div>
          <div className="flex items-center gap-3 w-full max-w-xl md-label-md muted tabular-nums">
            <span className="w-10 text-right">{fmtTime(pos)}</span>
            <WavySeek className="flex-1" position={pos} duration={duration} playing={playing} onSeek={(v) => { p.seek(v); setSeeking(null); }} />
            <span className="w-10">{fmtTime(duration)}</span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-1">
          {track.hasLyrics && <M3eIconButton aria-label={t('lyrics')} onClick={() => setOpen(true)}><m3e-icon variant="rounded" name="lyrics" /></M3eIconButton>}
          <DevicesButton />
          <M3eIconButton toggle selected={queueOpen || undefined} aria-label={t('queue')} onClick={() => setQueueOpen(!queueOpen)}><m3e-icon variant="rounded" name="queue_music" /><m3e-icon variant="rounded" slot="selected" name="queue_music" filled style={{ color: 'var(--md-sys-color-primary)' }} /></M3eIconButton>
          <Volume className="w-36" />
          <M3eIconButton aria-label={t('fullscreen')} onClick={() => setOpen(true)}><m3e-icon variant="rounded" name="fullscreen" /></M3eIconButton>
        </div>
      </div>
    </div>
    </>
  );
}
