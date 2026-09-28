import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Download, ListMusic, Mic2, MoreHorizontal, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume2, VolumeX, Moon, Gauge } from 'lucide-react';
import { usePlayer } from '@/stores/player';
import { useUI } from '@/stores/ui';
import { useAuth } from '@/stores/auth';
import { useLyrics } from '@/lib/queries';
import { useDominantColor } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import { fmtTime } from '@/lib/format';
import { downloadUrl } from '@/lib/api';
import { Cover } from './Cover';
import { CanvasView } from './CanvasView';
import { Lyrics } from './Lyrics';
import { LikeButton } from './LikeButton';
import { QueuePanel } from './QueuePanel';

type Tab = 'cover' | 'lyrics' | 'queue';

export function NowPlaying() {
  const open = useUI((s) => s.nowPlayingOpen);
  const setOpen = useUI((s) => s.setNowPlayingOpen);
  const openMenu = useUI((s) => s.openMenu);
  const track = usePlayer((s) => s.queue[s.index] ?? null);
  const playing = usePlayer((s) => s.playing);
  const position = usePlayer((s) => s.position);
  const duration = usePlayer((s) => s.duration);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const rate = usePlayer((s) => s.rate);
  const sleepAt = usePlayer((s) => s.sleepAt);
  const p = usePlayer.getState();
  const user = useAuth((s) => s.user);
  const t = useT();
  const [tab, setTab] = useState<Tab>('cover');
  const [seeking, setSeeking] = useState<number | null>(null);
  const { data: lyrics, isLoading: lyricsLoading } = useLyrics(open && track ? track.id : null);
  const tint = useDominantColor(track?.coverUrl, '#2a2a3d');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, setOpen]);
  useEffect(() => { if (track && !track.hasLyrics && tab === 'lyrics') setTab('cover'); }, [track?.id]);

  if (!open || !track) return null;
  const pos = seeking ?? position;
  const pct = duration ? (pos / duration) * 100 : 0;
  const showCanvas = track.hasCanvas && tab === 'cover';

  return (
    <div className="fixed inset-0 z-[70] slide-up text-white overflow-hidden" style={{ background: `linear-gradient(180deg, ${tint} 0%, #0b0b10 70%)` }}>
      {/* Canvas backdrop */}
      {showCanvas && (
        <div className="absolute inset-0">
          <CanvasView track={track} className="w-full h-full opacity-90" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/45" />
        </div>
      )}
      {!showCanvas && track.coverUrl && (
        <div className="absolute inset-0 opacity-25 blur-3xl scale-125" style={{ backgroundImage: `url(${track.coverUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
      )}

      <div className="relative h-full flex flex-col max-w-6xl mx-auto px-4 md:px-8" style={{ paddingTop: 'calc(var(--safe-t) + 12px)', paddingBottom: 'calc(var(--safe-b) + 16px)' }}>
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <button className="icon-btn text-white" onClick={() => setOpen(false)} aria-label={t('close')}><ChevronDown size={26} /></button>
          <div className="text-center min-w-0">
            <div className="text-[11px] uppercase tracking-widest opacity-70">{t('nowPlaying')}</div>
            {track.album && <Link to={`/album/${track.album.id}`} onClick={() => setOpen(false)} className="text-sm font-semibold line-clamp-1 hover:underline">{track.album.title}</Link>}
          </div>
          <button className="icon-btn text-white" onClick={(e) => openMenu(e.clientX, e.clientY, { kind: 'track', track })} aria-label="menu"><MoreHorizontal size={22} /></button>
        </div>

        {/* Tabs */}
        <div className="flex justify-center gap-2 mt-3">
          {(['cover', 'lyrics', 'queue'] as Tab[]).map((k) => (
            <button key={k} className="chip !bg-white/10 data-[active=true]:!bg-white data-[active=true]:!text-black" data-active={tab === k} onClick={() => setTab(k)} disabled={k === 'lyrics' && !track.hasLyrics && !lyrics?.plain}>
              {k === 'cover' ? t('canvas') : k === 'lyrics' ? t('lyrics') : t('queue')}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-6 md:gap-10 items-center mt-4 overflow-hidden">
          <div className={`min-h-0 h-full flex items-center justify-center ${tab !== 'cover' ? 'hidden md:flex' : ''}`}>
            {showCanvas ? (
              <>
                {/* On phones the full-screen backdrop *is* the canvas; the framed 9:16 box is for wide screens */}
                <div className="hidden md:block canvas-box rounded-2xl overflow-hidden shadow-2xl shadow-black/50 relative">
                  <CanvasView track={track} className="w-full h-full" />
                  <div className="absolute left-3 bottom-3"><Cover src={track.coverUrl} className="w-12 h-12 shadow-lg" /></div>
                </div>
                <div className="md:hidden flex-1" />
              </>
            ) : (
              <Cover src={track.coverUrl} alt={track.title} className="cover-box shadow-2xl shadow-black/60 !rounded-2xl" />
            )}
          </div>
          <div className={`min-h-0 h-full ${tab === 'cover' ? 'hidden md:block' : ''}`}>
            {tab === 'queue' ? (
              <div className="h-full rounded-2xl bg-black/25 overflow-hidden"><QueuePanel embedded /></div>
            ) : (
              <div className="h-full"><Lyrics lyrics={lyrics} loading={lyricsLoading} big /></div>
            )}
          </div>
        </div>

        {/* Track info + controls */}
        <div className="mt-4 md:mt-6 md:max-w-2xl md:mx-auto w-full">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-xl md:text-2xl font-bold line-clamp-1">{track.title}</div>
              <div className="opacity-80 line-clamp-1">
                <Link to={`/artist/${track.artist.id}`} onClick={() => setOpen(false)} className="hover:underline">{track.artist.name}</Link>
                {track.featuring.map((f) => <span key={f.id}>, <Link to={`/artist/${f.id}`} onClick={() => setOpen(false)} className="hover:underline">{f.name}</Link></span>)}
              </div>
            </div>
            {track.hasLyrics && <button className="icon-btn text-white" data-active={tab === 'lyrics'} onClick={() => setTab(tab === 'lyrics' ? 'cover' : 'lyrics')} aria-label={t('lyrics')}><Mic2 size={20} /></button>}
            <LikeButton type="track" id={track.id} size={22} alwaysVisible className="text-white" />
          </div>
          <div className="mt-4">
            <input type="range" min={0} max={duration || 0} step={0.1} value={pos} className="slider" style={{ ['--p' as any]: `${pct}%` }}
              onChange={(e) => setSeeking(Number(e.target.value))}
              onMouseUp={() => { if (seeking != null) p.seek(seeking); setSeeking(null); }}
              onTouchEnd={() => { if (seeking != null) p.seek(seeking); setSeeking(null); }}
              onKeyUp={() => { if (seeking != null) p.seek(seeking); setSeeking(null); }} />
            <div className="flex justify-between text-xs opacity-70 tabular-nums mt-1"><span>{fmtTime(pos)}</span><span>-{fmtTime(Math.max(0, duration - pos))}</span></div>
          </div>
          <div className="flex items-center justify-between mt-3">
            <button className="icon-btn text-white" data-active={shuffle} onClick={p.toggleShuffle} aria-label={t('shuffle')}><Shuffle size={20} /></button>
            <div className="flex items-center gap-4 md:gap-6">
              <button className="icon-btn text-white" onClick={p.prev} aria-label={t('prev')}><SkipBack size={28} fill="currentColor" /></button>
              <button className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-transform" onClick={p.toggle} aria-label={playing ? t('pause') : t('play')}>
                {playing ? <Pause size={30} fill="currentColor" /> : <Play size={30} fill="currentColor" className="ml-1" />}
              </button>
              <button className="icon-btn text-white" onClick={() => p.next()} aria-label={t('next')}><SkipForward size={28} fill="currentColor" /></button>
            </div>
            <button className="icon-btn text-white" data-active={repeat !== 'off'} onClick={p.cycleRepeat} aria-label={t('repeat')}>{repeat === 'one' ? <Repeat1 size={20} /> : <Repeat size={20} />}</button>
          </div>
          <div className="hidden md:flex items-center justify-between mt-3 text-white/80">
            <div className="flex items-center gap-2 w-40">
              <button className="icon-btn text-white" onClick={p.toggleMute}>{muted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
              <input type="range" min={0} max={1} step={0.01} value={muted ? 0 : volume} onChange={(e) => p.setVolume(Number(e.target.value))} className="slider" style={{ ['--p' as any]: `${(muted ? 0 : volume) * 100}%` }} />
            </div>
            <div className="flex items-center gap-1">
              <button className="icon-btn text-white text-xs font-bold w-auto px-2" title={t('speed')} onClick={() => p.setRate(rate >= 2 ? 0.75 : Math.round((rate + 0.25) * 100) / 100)}><Gauge size={16} className="mr-1" />{rate}×</button>
              <button className="icon-btn text-white" data-active={!!sleepAt} title={t('sleepTimer')} onClick={() => p.setSleep(sleepAt ? null : 30)}><Moon size={18} /></button>
              {user && <a className="icon-btn text-white" href={downloadUrl(track.id)} download title={t('download')}><Download size={18} /></a>}
              <button className="icon-btn text-white" data-active={tab === 'queue'} onClick={() => setTab(tab === 'queue' ? 'cover' : 'queue')} title={t('queue')}><ListMusic size={18} /></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
