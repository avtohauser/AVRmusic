import { useState } from 'react';
import { Link } from 'react-router-dom';
import { M3eIconButton, M3eLinearProgressIndicator, M3eSlider, M3eSliderThumb } from '@/md';
import { usePlayer } from '@/stores/player';
import { useUI } from '@/stores/ui';
import { Cover } from './Cover';
import { LikeButton } from './LikeButton';
import { fmtTime } from '@/lib/format';
import { useT } from '@/lib/i18n';

const thumbValue = (e: Event) => Number((e.target as any)?.value ?? (e.currentTarget as any)?.value ?? 0);

export function PlayerBar() {
  const track = usePlayer((s) => s.queue[s.index] ?? null);
  const playing = usePlayer((s) => s.playing);
  const loading = usePlayer((s) => s.loading);
  const position = usePlayer((s) => s.position);
  const duration = usePlayer((s) => s.duration);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const p = usePlayer.getState();
  const setOpen = useUI((s) => s.setNowPlayingOpen);
  const queueOpen = useUI((s) => s.queueOpen);
  const setQueueOpen = useUI((s) => s.setQueueOpen);
  const t = useT();
  const [seeking, setSeeking] = useState<number | null>(null);
  if (!track) return null;
  const pos = seeking ?? position;
  const volIcon = muted || volume === 0 ? 'volume_off' : volume < 0.5 ? 'volume_down' : 'volume_up';

  return (
    <div className="fixed left-0 right-0 z-[60] md:px-3 md:pb-3" style={{ bottom: 'calc(var(--nav-h) + var(--safe-b))' }} data-playerbar>
      {/* Phone: compact card */}
      <div className="md:hidden mx-3 mb-2 surface-high rounded-[24px] overflow-hidden elev-2" onClick={() => setOpen(true)}>
        <div className="flex items-center gap-3 p-2 pr-2">
          <Cover src={track.coverUrl} className="w-12 h-12 !rounded-[14px]" />
          <div className="min-w-0 flex-1">
            <div className="md-title-sm line-1">{track.title}</div>
            <div className="md-body-sm muted line-1">{track.artist.name}</div>
          </div>
          <LikeButton type="track" id={track.id} alwaysVisible />
          <M3eIconButton variant="filled" aria-label={playing ? t('pause') : t('play')} onClick={(e: any) => { e.stopPropagation(); p.toggle(); }}>
            <m3e-icon variant="rounded" name={loading && playing ? 'hourglass_empty' : playing ? 'pause' : 'play_arrow'} filled />
          </M3eIconButton>
        </div>
        <M3eLinearProgressIndicator className="mini" variant={playing ? 'wavy' : 'flat'} value={duration ? (pos / duration) * 100 : 0} max={100} />
      </div>

      {/* Desktop */}
      <div className="hidden md:grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)] items-center gap-4 surface-high rounded-[28px] px-4 h-[var(--player-h)] elev-3">
        <div className="flex items-center gap-3 min-w-0">
          <button className="relative group shrink-0" onClick={() => setOpen(true)} aria-label={t('fullscreen')}>
            <Cover src={track.coverUrl} className="w-14 h-14 !rounded-[16px]" />
            <span className="absolute inset-0 rounded-[16px] bg-black/50 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"><m3e-icon variant="rounded" name="fullscreen" /></span>
          </button>
          <div className="min-w-0">
            <div className="md-title-sm line-1"><button className="hover:underline text-left" onClick={() => setOpen(true)}>{track.title}</button></div>
            <div className="md-body-sm muted line-1">
              <Link to={`/artist/${track.artist.id}`} className="hover:underline">{track.artist.name}</Link>
              {track.featuring.map((f) => <span key={f.id}>, <Link to={`/artist/${f.id}`} className="hover:underline">{f.name}</Link></span>)}
            </div>
          </div>
          <LikeButton type="track" id={track.id} alwaysVisible />
        </div>

        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-1">
            <M3eIconButton id="pb-shuffle" toggle selected={shuffle || undefined} variant="standard" size="small" onClick={p.toggleShuffle}><m3e-icon variant="rounded" name="shuffle" /><m3e-icon variant="rounded" slot="selected" name="shuffle" filled style={{ color: 'var(--md-sys-color-primary)' }} /></M3eIconButton>
            <m3e-tooltip for="pb-shuffle">{t('shuffle')}</m3e-tooltip>
            <M3eIconButton aria-label={t('prev')} onClick={p.prev}><m3e-icon variant="rounded" name="skip_previous" filled /></M3eIconButton>
            <M3eIconButton variant="filled" size="medium" width="wide" aria-label={playing ? t('pause') : t('play')} onClick={p.toggle}>
              <m3e-icon variant="rounded" name={loading && playing ? 'hourglass_empty' : playing ? 'pause' : 'play_arrow'} filled />
            </M3eIconButton>
            <M3eIconButton aria-label={t('next')} onClick={() => p.next()}><m3e-icon variant="rounded" name="skip_next" filled /></M3eIconButton>
            <M3eIconButton id="pb-repeat" toggle selected={repeat !== 'off' || undefined} variant="standard" size="small" onClick={p.cycleRepeat}><m3e-icon variant="rounded" name="repeat" /><m3e-icon variant="rounded" slot="selected" name={repeat === 'one' ? 'repeat_one' : 'repeat'} filled style={{ color: 'var(--md-sys-color-primary)' }} /></M3eIconButton>
            <m3e-tooltip for="pb-repeat">{t('repeat')}</m3e-tooltip>
          </div>
          <div className="flex items-center gap-3 w-full max-w-xl md-label-md muted tabular-nums">
            <span className="w-10 text-right">{fmtTime(pos)}</span>
            <M3eSlider className="seek flex-1" size="extra-small" min={0} max={Math.max(1, duration || 1)} step={0.1} onInput={(e: Event) => setSeeking(thumbValue(e))} onChange={(e: Event) => { p.seek(thumbValue(e)); setSeeking(null); }}>
              <M3eSliderThumb value={pos} />
            </M3eSlider>
            <span className="w-10">{fmtTime(duration)}</span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-1">
          {track.hasLyrics && <M3eIconButton aria-label={t('lyrics')} onClick={() => setOpen(true)}><m3e-icon variant="rounded" name="lyrics" /></M3eIconButton>}
          <M3eIconButton toggle selected={queueOpen || undefined} aria-label={t('queue')} onClick={() => setQueueOpen(!queueOpen)}><m3e-icon variant="rounded" name="queue_music" /><m3e-icon variant="rounded" slot="selected" name="queue_music" filled style={{ color: 'var(--md-sys-color-primary)' }} /></M3eIconButton>
          <M3eIconButton aria-label={t('mute')} onClick={p.toggleMute}><m3e-icon variant="rounded" name={volIcon} /></M3eIconButton>
          <M3eSlider className="w-28" size="extra-small" min={0} max={1} step={0.01} onInput={(e: Event) => p.setVolume(thumbValue(e))}>
            <M3eSliderThumb value={muted ? 0 : volume} />
          </M3eSlider>
          <M3eIconButton aria-label={t('fullscreen')} onClick={() => setOpen(true)}><m3e-icon variant="rounded" name="fullscreen" /></M3eIconButton>
        </div>
      </div>
    </div>
  );
}
