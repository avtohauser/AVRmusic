import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ListMusic, Maximize2, Mic2, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume1, Volume2, VolumeX, Loader2 } from 'lucide-react';
import { usePlayer } from '@/stores/player';
import { useUI } from '@/stores/ui';
import { Cover } from './Cover';
import { LikeButton } from './LikeButton';
import { fmtTime } from '@/lib/format';
import { useT } from '@/lib/i18n';

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
  const pct = duration ? (pos / duration) * 100 : 0;
  const VolIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div className="fixed left-0 right-0 z-[60] md:px-3 md:pb-3" style={{ bottom: 'calc(var(--nav-h) + var(--safe-b))' }} data-playerbar>
      {/* Mobile: compact bar */}
      <div className="md:hidden mx-2 mb-2 glass border border-line rounded-2xl overflow-hidden shadow-2xl" onClick={() => setOpen(true)}>
        <div className="flex items-center gap-3 p-2 pr-3">
          <Cover src={track.coverUrl} className="w-11 h-11" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-sm line-clamp-1">{track.title}</div>
            <div className="text-xs text-muted line-clamp-1">{track.artist.name}</div>
          </div>
          <LikeButton type="track" id={track.id} alwaysVisible />
          <button className="icon-btn text-fg" onClick={(e) => { e.stopPropagation(); p.toggle(); }} aria-label={playing ? t('pause') : t('play')}>
            {loading && playing ? <Loader2 size={22} className="animate-spin" /> : playing ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
          </button>
        </div>
        <div className="h-0.5 bg-surface-2"><div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${pct}%` }} /></div>
      </div>

      {/* Desktop */}
      <div className="hidden md:grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)] items-center gap-4 glass border border-line rounded-2xl px-4 h-[var(--player-h)] shadow-2xl">
        <div className="flex items-center gap-3 min-w-0">
          <button className="relative group shrink-0" onClick={() => setOpen(true)} aria-label={t('fullscreen')}>
            <Cover src={track.coverUrl} className="w-14 h-14" />
            <span className="absolute inset-0 rounded-lg bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"><Maximize2 size={18} /></span>
          </button>
          <div className="min-w-0">
            <div className="font-semibold line-clamp-1"><button className="hover:underline text-left" onClick={() => setOpen(true)}>{track.title}</button></div>
            <div className="text-sm text-muted line-clamp-1">
              <Link to={`/artist/${track.artist.id}`} className="hover:underline">{track.artist.name}</Link>
              {track.featuring.map((f) => <span key={f.id}>, <Link to={`/artist/${f.id}`} className="hover:underline">{f.name}</Link></span>)}
            </div>
          </div>
          <LikeButton type="track" id={track.id} alwaysVisible />
        </div>

        <div className="flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-2">
            <button className="icon-btn" data-active={shuffle} onClick={p.toggleShuffle} title={t('shuffle')}><Shuffle size={16} /></button>
            <button className="icon-btn" onClick={p.prev} title={t('prev')}><SkipBack size={20} fill="currentColor" /></button>
            <button className="w-10 h-10 rounded-full bg-fg text-bg flex items-center justify-center hover:scale-105 active:scale-95 transition-transform" onClick={p.toggle} title={playing ? t('pause') : t('play')}>
              {loading && playing ? <Loader2 size={18} className="animate-spin" /> : playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
            </button>
            <button className="icon-btn" onClick={() => p.next()} title={t('next')}><SkipForward size={20} fill="currentColor" /></button>
            <button className="icon-btn" data-active={repeat !== 'off'} onClick={p.cycleRepeat} title={t('repeat')}>{repeat === 'one' ? <Repeat1 size={16} /> : <Repeat size={16} />}</button>
          </div>
          <div className="flex items-center gap-2 w-full max-w-xl text-xs text-muted tabular-nums">
            <span className="w-10 text-right">{fmtTime(pos)}</span>
            <input type="range" min={0} max={duration || 0} step={0.1} value={pos} className="slider" style={{ ['--p' as any]: `${pct}%` }}
              onChange={(e) => setSeeking(Number(e.target.value))}
              onMouseUp={() => { if (seeking != null) p.seek(seeking); setSeeking(null); }}
              onKeyUp={() => { if (seeking != null) p.seek(seeking); setSeeking(null); }} />
            <span className="w-10">{fmtTime(duration)}</span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-1">
          {track.hasLyrics && <button className="icon-btn" onClick={() => setOpen(true)} title={t('lyrics')}><Mic2 size={18} /></button>}
          <button className="icon-btn" data-active={queueOpen} onClick={() => setQueueOpen(!queueOpen)} title={t('queue')}><ListMusic size={18} /></button>
          <button className="icon-btn" onClick={p.toggleMute} title={t('mute')}><VolIcon size={18} /></button>
          <input type="range" min={0} max={1} step={0.01} value={muted ? 0 : volume} onChange={(e) => p.setVolume(Number(e.target.value))} className="slider w-24" style={{ ['--p' as any]: `${(muted ? 0 : volume) * 100}%` }} title={t('volume')} />
          <button className="icon-btn" onClick={() => setOpen(true)} title={t('fullscreen')}><Maximize2 size={18} /></button>
        </div>
      </div>
    </div>
  );
}
