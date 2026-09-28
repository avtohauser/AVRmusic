import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { M3eButtonSegment, M3eIconButton, M3eSegmentedButton, M3eSlider, M3eSliderThumb } from '@/md';
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
const thumbValue = (e: Event) => Number((e.target as any)?.value ?? 0);

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
  const tint = useDominantColor(track?.coverUrl, 'var(--md-sys-color-primary-container)');

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
  const showCanvas = track.hasCanvas && tab === 'cover';

  return (
    <div className="fixed inset-0 z-[70] slide-up overflow-hidden text-on-surface" style={{ background: `linear-gradient(180deg, ${tint} 0%, var(--md-sys-color-surface) 70%)` }}>
      {showCanvas && (
        <div className="absolute inset-0">
          <CanvasView track={track} className="w-full h-full opacity-90" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/45" />
        </div>
      )}
      {!showCanvas && track.coverUrl && (
        <div className="absolute inset-0 opacity-20 blur-3xl scale-125" style={{ backgroundImage: `url(${track.coverUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
      )}
      <div className={`relative h-full flex flex-col max-w-6xl mx-auto px-4 md:px-8 ${showCanvas ? 'text-white' : ''}`} style={{ paddingTop: 'calc(var(--safe-t) + 12px)', paddingBottom: 'calc(var(--safe-b) + 16px)' }}>
        <div className="flex items-center justify-between">
          <M3eIconButton aria-label={t('close')} onClick={() => setOpen(false)}><m3e-icon variant="rounded" name="keyboard_arrow_down" /></M3eIconButton>
          <div className="text-center min-w-0">
            <div className="md-label-md uppercase tracking-widest opacity-70">{t('nowPlaying')}</div>
            {track.album && <Link to={`/album/${track.album.id}`} onClick={() => setOpen(false)} className="md-title-sm line-1 hover:underline">{track.album.title}</Link>}
          </div>
          <M3eIconButton aria-label="menu" onClick={(e: any) => openMenu(e.clientX, e.clientY, { kind: 'track', track })}><m3e-icon variant="rounded" name="more_vert" /></M3eIconButton>
        </div>

        <div className="flex justify-center mt-3">
          <M3eSegmentedButton onChange={(e: Event) => { const v = (e.target as any)?.value as Tab | undefined; if (v) setTab(v); }}>
            <M3eButtonSegment value="cover" checked={tab === 'cover' || undefined}><m3e-icon variant="rounded" slot="icon" name="movie" />{t('canvas')}</M3eButtonSegment>
            <M3eButtonSegment value="lyrics" checked={tab === 'lyrics' || undefined} disabled={(!track.hasLyrics && !lyrics?.plain) || undefined}><m3e-icon variant="rounded" slot="icon" name="lyrics" />{t('lyrics')}</M3eButtonSegment>
            <M3eButtonSegment value="queue" checked={tab === 'queue' || undefined}><m3e-icon variant="rounded" slot="icon" name="queue_music" />{t('queue')}</M3eButtonSegment>
          </M3eSegmentedButton>
        </div>

        <div className="flex-1 min-h-0 grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-6 md:gap-10 items-center mt-4 overflow-hidden">
          <div className={`min-h-0 h-full flex items-center justify-center ${tab !== 'cover' ? 'hidden md:flex' : ''}`}>
            {showCanvas ? (
              <>
                <div className="hidden md:block canvas-box overflow-hidden elev-3 relative" style={{ borderRadius: 28 }}>
                  <CanvasView track={track} className="w-full h-full" />
                  <div className="absolute left-3 bottom-3"><Cover src={track.coverUrl} className="w-12 h-12 elev-2" /></div>
                </div>
                <div className="md:hidden flex-1" />
              </>
            ) : (
              <Cover src={track.coverUrl} alt={track.title} className="cover-box elev-3 !rounded-[28px]" />
            )}
          </div>
          <div className={`min-h-0 h-full ${tab === 'cover' ? 'hidden md:block' : ''}`}>
            {tab === 'queue' ? (
              <div className="h-full rounded-[28px] bg-black/25 overflow-hidden"><QueuePanel embedded /></div>
            ) : (
              <div className="h-full"><Lyrics lyrics={lyrics} loading={lyricsLoading} big /></div>
            )}
          </div>
        </div>

        <div className="mt-4 md:mt-6 md:max-w-2xl md:mx-auto w-full">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="md-headline-sm emph line-1">{track.title}</div>
              <div className="md-body-lg opacity-80 line-1">
                <Link to={`/artist/${track.artist.id}`} onClick={() => setOpen(false)} className="hover:underline">{track.artist.name}</Link>
                {track.featuring.map((f) => <span key={f.id}>, <Link to={`/artist/${f.id}`} onClick={() => setOpen(false)} className="hover:underline">{f.name}</Link></span>)}
              </div>
            </div>
            {track.hasLyrics && <M3eIconButton toggle selected={tab === 'lyrics' || undefined} aria-label={t('lyrics')} onClick={() => setTab(tab === 'lyrics' ? 'cover' : 'lyrics')}><m3e-icon variant="rounded" name="lyrics" /><m3e-icon variant="rounded" slot="selected" name="lyrics" filled /></M3eIconButton>}
            <LikeButton type="track" id={track.id} alwaysVisible buttonSize="medium" />
          </div>
          <div className="mt-3">
            <M3eSlider className="seek" size="small" min={0} max={Math.max(1, duration || 1)} step={0.1} onInput={(e: Event) => setSeeking(thumbValue(e))} onChange={(e: Event) => { p.seek(thumbValue(e)); setSeeking(null); }}>
              <M3eSliderThumb value={pos} />
            </M3eSlider>
            <div className="flex justify-between md-label-md opacity-70 tabular-nums"><span>{fmtTime(pos)}</span><span>-{fmtTime(Math.max(0, duration - pos))}</span></div>
          </div>
          <div className="flex items-center justify-between mt-2">
            <M3eIconButton toggle selected={shuffle || undefined} aria-label={t('shuffle')} onClick={p.toggleShuffle}><m3e-icon variant="rounded" name="shuffle" /><m3e-icon variant="rounded" slot="selected" name="shuffle" filled style={{ color: 'var(--md-sys-color-primary)' }} /></M3eIconButton>
            <div className="flex items-center gap-3 md:gap-5">
              <M3eIconButton size="large" aria-label={t('prev')} onClick={p.prev}><m3e-icon variant="rounded" name="skip_previous" filled /></M3eIconButton>
              <M3eIconButton variant="filled" size="large" width="wide" aria-label={playing ? t('pause') : t('play')} onClick={p.toggle}><m3e-icon variant="rounded" name={playing ? 'pause' : 'play_arrow'} filled /></M3eIconButton>
              <M3eIconButton size="large" aria-label={t('next')} onClick={() => p.next()}><m3e-icon variant="rounded" name="skip_next" filled /></M3eIconButton>
            </div>
            <M3eIconButton toggle selected={repeat !== 'off' || undefined} aria-label={t('repeat')} onClick={p.cycleRepeat}><m3e-icon variant="rounded" name="repeat" /><m3e-icon variant="rounded" slot="selected" name={repeat === 'one' ? 'repeat_one' : 'repeat'} filled style={{ color: 'var(--md-sys-color-primary)' }} /></M3eIconButton>
          </div>
          <div className="hidden md:flex items-center justify-between mt-3 opacity-90">
            <div className="flex items-center gap-2 w-44">
              <M3eIconButton size="small" aria-label={t('mute')} onClick={p.toggleMute}><m3e-icon variant="rounded" name={muted || volume === 0 ? 'volume_off' : 'volume_up'} /></M3eIconButton>
              <M3eSlider className="flex-1" size="extra-small" min={0} max={1} step={0.01} onInput={(e: Event) => p.setVolume(thumbValue(e))}><M3eSliderThumb value={muted ? 0 : volume} /></M3eSlider>
            </div>
            <div className="flex items-center gap-1">
              <M3eIconButton size="small" width="wide" title={t('speed')} onClick={() => p.setRate(rate >= 2 ? 0.75 : Math.round((rate + 0.25) * 100) / 100)}><span className="md-label-md">{rate}×</span></M3eIconButton>
              <M3eIconButton size="small" toggle selected={!!sleepAt || undefined} title={t('sleepTimer')} onClick={() => p.setSleep(sleepAt ? null : 30)}><m3e-icon variant="rounded" name="bedtime" /><m3e-icon variant="rounded" slot="selected" name="bedtime" filled style={{ color: 'var(--md-sys-color-primary)' }} /></M3eIconButton>
              {user && <M3eIconButton size="small" href={downloadUrl(track.id)} download="" title={t('download')}><m3e-icon variant="rounded" name="download" /></M3eIconButton>}
              <M3eIconButton size="small" toggle selected={tab === 'queue' || undefined} title={t('queue')} onClick={() => setTab(tab === 'queue' ? 'cover' : 'queue')}><m3e-icon variant="rounded" name="queue_music" /><m3e-icon variant="rounded" slot="selected" name="queue_music" filled style={{ color: 'var(--md-sys-color-primary)' }} /></M3eIconButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
