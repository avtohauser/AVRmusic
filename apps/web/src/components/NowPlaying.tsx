import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { artistHref } from '@/lib/instant';
import { M3eIconButton } from '@/md';
import { usePlayer } from '@/stores/player';
import { useUI } from '@/stores/ui';
import { useAuth } from '@/stores/auth';
import { useLyrics } from '@/lib/queries';
import { useT } from '@/lib/i18n';
import { fmtTime } from '@/lib/format';
import { downloadUrl } from '@/lib/api';
import { Cover } from './Cover';
import { CanvasView, GeneratedCanvas } from './CanvasView';
import { Lyrics } from './Lyrics';
import { LikeButton } from './LikeButton';
import { QueuePanel } from './QueuePanel';
import { Mascot } from './Mascot';
import { notificationsSupported, setShadeLike, shadeLikeSetting } from '@/lib/shadeLike';
import { M3eAssistChip } from '@/md';
import { useLikes } from '@/stores/likes';
import { FlowText } from '@/components/FlowText';
import { WAVE_CONTEXT, dislikeInWave, useWave } from '@/lib/wave';
import { ReactButton, ReactionBubbles, ReactionMarks } from './Reactions';
import { listenTogether, useJam } from '@/lib/jam';
import { useTr } from '@/lib/social';
import { DevicesButton } from './Devices';
import { StoryCard } from './StoryCard';
import { MorphPlay } from './MorphPlay';
import { WavySeek } from './WavySeek';
import { Volume } from './Volume';

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
  const [story, setStory] = useState(false);
  const liked = useLikes((s) => (track ? s.ids.track.has(track.id) : false));
  const [burst, setBurst] = useState(0);
  const [offerShade, setOfferShade] = useState(() => !!user && notificationsSupported() && shadeLikeSetting() === null && Notification.permission !== 'denied');
  const prevLiked = useRef(liked);
  const prevTrack = useRef(track?.id);
  useEffect(() => { if (liked && !prevLiked.current) setBurst((b) => b + 1); prevLiked.current = liked; }, [liked]);
  useEffect(() => { if (open && track?.id && prevTrack.current && track.id !== prevTrack.current) setBurst((b) => b + 1); prevTrack.current = track?.id; }, [track?.id, open]);
  const [seeking, setSeeking] = useState<number | null>(null);
  const { data: lyrics, isLoading: lyricsLoading } = useLyrics(open && track ? track.id : null);
  const prevCover = usePlayer((s) => s.queue[s.index - 1]?.coverUrl ?? null);
  const nextCover = usePlayer((s) => s.queue[s.index + 1]?.coverUrl ?? null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, setOpen]);
  useEffect(() => { if (track && !track.hasLyrics && tab === 'lyrics') setTab('cover'); }, [track?.id]);

  const inWave = usePlayer((s) => s.context === WAVE_CONTEXT);
  const jam = useJam((s) => s.view);
  const tr = useTr();
  const waveReason = useWave((s) => (track ? s.reasons[track.id] : undefined));
  if (!open || !track) return null;
  const pos = seeking ?? position;
  const showCanvas = track.hasCanvas && tab === 'cover';

  return (
    <div className="fixed inset-0 z-[70] slide-up overflow-hidden text-on-surface bg-background">
      {showCanvas && (
        <div className="absolute inset-0">
          <CanvasView track={track} className="w-full h-full opacity-90" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/45" />
        </div>
      )}
      {/* the cover blurred behind everything, fading into the theme's ground (as in the app) */}
      {!showCanvas && track.coverUrl && (
        <>
          <GeneratedCanvas src={track.coverUrl} playing={playing} className="absolute inset-0 opacity-60" />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, color-mix(in oklab, var(--md-sys-color-background) 35%, transparent), color-mix(in oklab, var(--md-sys-color-background) 80%, transparent) 60%, var(--md-sys-color-background))' }} />
        </>
      )}
      <div className={`relative h-full flex flex-col max-w-6xl mx-auto px-5 md:px-8 ${showCanvas ? 'text-white' : ''}`} style={{ paddingTop: 'calc(var(--safe-t) + 8px)', paddingBottom: 'calc(var(--safe-b) + 14px)' }}>
        <div className="flex items-center justify-between gap-2">
          <M3eIconButton aria-label={t('close')} onClick={() => setOpen(false)}><m3e-icon variant="rounded" name="keyboard_arrow_down" /></M3eIconButton>
          <div className="text-center min-w-0 flex flex-col items-center">
            <div className="md-label-lg muted flex items-center gap-2"><Mascot mood={playing ? 'dance' : 'sleep'} burst={burst} className="w-5 h-5" />{jam ? tr(`Вместе · ${jam.members.length}`, `Together · ${jam.members.length}`) : inWave ? tr('Моя волна', 'My Wave') : t('nowPlaying')}</div>
            {inWave && waveReason
              ? <div className="md-label-md text-primary line-1 wave-reason" key={track.id}>✦ {waveReason}</div>
              : track.album && <Link to={`/album/${track.album.id}`} onClick={() => setOpen(false)} className="md-label-md text-primary line-1 hover:underline">{track.album.title}</Link>}
          </div>
          <div className="flex items-center">
            {user && <M3eIconButton toggle selected={!!jam || undefined} title={jam ? tr('Позвать ещё', 'Invite more') : tr('Слушать вместе', 'Listen together')} onClick={() => void listenTogether(tr)}><m3e-icon variant="rounded" name="headphones" /><m3e-icon variant="rounded" slot="selected" name="headphones" filled /></M3eIconButton>}
            {user && <DevicesButton />}
            {!track.id.startsWith('dz:') && <M3eIconButton className="hidden sm:inline-flex" title={tr('Карточка для сторис', 'Story card')} onClick={() => setStory(true)}><m3e-icon variant="rounded" name="ios_share" /></M3eIconButton>}
            <M3eIconButton aria-label="menu" onClick={(e: any) => openMenu(e.clientX, e.clientY, { kind: 'track', track })}><m3e-icon variant="rounded" name="more_vert" /></M3eIconButton>
          </div>
          {story && <StoryCard track={track} onClose={() => setStory(false)} />}
        </div>

        <div className="flex-1 min-h-0 grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-6 md:gap-10 items-center mt-3 overflow-hidden">
          <div className={`min-h-0 h-full flex items-center justify-center ${tab !== 'cover' ? 'hidden md:flex' : ''}`}>
            {showCanvas ? (
              <>
                <div className="hidden md:block canvas-box overflow-hidden elev-3 relative" style={{ borderRadius: 28 }}>
                  <CanvasView track={track} className="w-full h-full" />
                  <div className="absolute left-3 bottom-3"><Cover src={track.coverUrl} className="w-12 h-12 elev-2" /></div>
                  <ReactionBubbles track={track} />
                </div>
                <div className="md:hidden flex-1" />
              </>
            ) : (
              <div className="relative flex items-center justify-center">
                <div className="np-aura" data-playing={playing} />
                {prevCover && <div className="deck-card deck-prev"><img src={prevCover} alt="" /></div>}
                {nextCover && <div className="deck-card deck-next"><img src={nextCover} alt="" /></div>}
                <Cover src={track.coverUrl} alt={track.title} className="cover-box elev-3 !rounded-[28px] relative" />
                <ReactionBubbles track={track} />
              </div>
            )}
          </div>
          <div className={`min-h-0 h-full ${tab === 'cover' ? 'hidden md:block' : ''}`}>
            {tab === 'queue' ? (
              <div className="h-full rounded-[28px] surface-low overflow-hidden"><QueuePanel embedded /></div>
            ) : (
              <div className="h-full"><Lyrics lyrics={lyrics} loading={lyricsLoading} big /></div>
            )}
          </div>
        </div>

        <div className="mt-4 md:mt-6 md:max-w-2xl md:mx-auto w-full">
          <div className="min-w-0">
            <FlowText as="div" text={track.title} className="md-headline-sm line-1" />
            <div className="md-title-md text-primary line-1">
              <Link to={artistHref(track.artist)} onClick={() => setOpen(false)} className="hover:underline">{track.artist.name}</Link>
              {track.featuring.map((f) => <span key={f.id || f.name}>, <Link to={artistHref(f)} onClick={() => setOpen(false)} className="hover:underline">{f.name}</Link></span>)}
            </div>
          </div>
          {offerShade && (
            <div className="mt-2 flex items-center gap-1">
              <M3eAssistChip onClick={async () => { const ok = await setShadeLike(true); setOfferShade(false); if (!ok) useUI.getState().toast(t('notificationsDenied'), 'error'); }}>
                <m3e-icon variant="rounded" slot="icon" name="notifications_active" />{t('shadeLikeOffer')} — {t('enable').toLowerCase()}
              </M3eAssistChip>
              <M3eIconButton size="small" aria-label={t('close')} onClick={() => { void setShadeLike(false); setOfferShade(false); }}><m3e-icon variant="rounded" name="close" /></M3eIconButton>
            </div>
          )}
          <div className="mt-2">
            <ReactionMarks track={track} duration={duration} />
            <WavySeek position={pos} duration={duration} playing={playing} onSeek={(v) => { p.seek(v); setSeeking(null); }} />
            <div className="flex justify-between md-label-md muted tabular-nums"><span>{fmtTime(pos)}</span><span>{fmtTime(duration)}</span></div>
          </div>
          <div className="flex items-center justify-between mt-2">
            <M3eIconButton toggle selected={shuffle || undefined} aria-label={t('shuffle')} onClick={p.toggleShuffle}><m3e-icon variant="rounded" name="shuffle" /><m3e-icon variant="rounded" slot="selected" name="shuffle" filled style={{ color: 'var(--md-sys-color-primary)' }} /></M3eIconButton>
            <M3eIconButton variant="tonal" size="large" aria-label={t('prev')} onClick={p.prev}><m3e-icon variant="rounded" name="skip_previous" filled /></M3eIconButton>
            <MorphPlay playing={playing} onClick={() => p.toggle()} size={96} label={playing ? t('pause') : t('play')} />
            <M3eIconButton variant="tonal" size="large" aria-label={t('next')} onClick={() => p.next()}><m3e-icon variant="rounded" name="skip_next" filled /></M3eIconButton>
            <M3eIconButton toggle selected={repeat !== 'off' || undefined} aria-label={t('repeat')} onClick={p.cycleRepeat}><m3e-icon variant="rounded" name="repeat" /><m3e-icon variant="rounded" slot="selected" name={repeat === 'one' ? 'repeat_one' : 'repeat'} filled style={{ color: 'var(--md-sys-color-primary)' }} /></M3eIconButton>
          </div>
          <div className="flex justify-center mt-4">
            <div className="np-toolbar">
              {inWave && <M3eIconButton aria-label={tr('Не нравится', 'Dislike')} title={tr('Не нравится — больше не попадётся в волне', 'Dislike — it won’t come up in the wave again')} onClick={() => void dislikeInWave(track.id)}><m3e-icon variant="rounded" name="thumb_down" /></M3eIconButton>}
              <LikeButton type="track" id={track.id} alwaysVisible />
              <M3eIconButton toggle selected={tab === 'lyrics' || undefined} disabled={(!track.hasLyrics && !lyrics?.plain) || undefined} aria-label={t('lyrics')} onClick={() => setTab(tab === 'lyrics' ? 'cover' : 'lyrics')}><m3e-icon variant="rounded" name="lyrics" /><m3e-icon variant="rounded" slot="selected" name="lyrics" filled style={{ color: 'var(--md-sys-color-primary)' }} /></M3eIconButton>
              <M3eIconButton toggle selected={tab === 'queue' || undefined} aria-label={t('queue')} onClick={() => setTab(tab === 'queue' ? 'cover' : 'queue')}><m3e-icon variant="rounded" name="queue_music" /><m3e-icon variant="rounded" slot="selected" name="queue_music" filled style={{ color: 'var(--md-sys-color-primary)' }} /></M3eIconButton>
              <ReactButton track={track} />
              <M3eIconButton toggle selected={!!sleepAt || undefined} title={t('sleepTimer')} onClick={() => p.setSleep(sleepAt ? null : 30)}><m3e-icon variant="rounded" name="bedtime" /><m3e-icon variant="rounded" slot="selected" name="bedtime" filled style={{ color: 'var(--md-sys-color-primary)' }} /></M3eIconButton>
              <M3eIconButton className="hidden md:inline-flex" width="wide" title={t('speed')} onClick={() => p.setRate(rate >= 2 ? 0.75 : Math.round((rate + 0.25) * 100) / 100)}><span className="md-label-md">{rate}×</span></M3eIconButton>
              {user && <M3eIconButton className="hidden md:inline-flex" href={downloadUrl(track.id)} download="" title={t('download')}><m3e-icon variant="rounded" name="download" /></M3eIconButton>}
              <Volume className="hidden md:flex pl-1 pr-3 w-36" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
