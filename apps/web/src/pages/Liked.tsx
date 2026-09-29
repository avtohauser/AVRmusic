import { M3eIconButton } from '@/md';
import { useLikedTracks } from '@/lib/queries';
import { usePlayer } from '@/stores/player';
import { useAuth } from '@/stores/auth';
import { useI18n, useT } from '@/lib/i18n';
import { fmtDurationLong, tracksWord } from '@/lib/format';
import { TrackList } from '@/components/TrackList';
import { PlayButton } from '@/components/PlayButton';
import { OfflineToggle } from '@/components/OfflineToggle';
import { EmptyState } from '@/components/EmptyState';
import { TrackListSkeleton } from '@/components/Skeleton';
import { FlowText } from '@/components/FlowText';

export default function Liked() {
  const { data, isLoading } = useLikedTracks();
  const t = useT();
  const lang = useI18n((s) => s.lang);
  const user = useAuth((s) => s.user);
  const context = usePlayer((s) => s.context);
  const playing = usePlayer((s) => s.playing);
  const p = usePlayer.getState();
  const tracks = data ?? [];
  const isThis = context === 'liked';
  return (
    <div>
      <div className="relative -mt-16 pt-16 mb-6">
        <div className="hero-bg" />
        <div className="page pt-6 md:pt-10 flex flex-col sm:flex-row sm:items-end gap-6">
          <div className="w-44 h-44 md:w-56 md:h-56 rounded-[28px] bg-primary text-on-primary flex items-center justify-center elev-3 mx-auto sm:mx-0"><m3e-icon variant="rounded" name="favorite" filled style={{ ['--m3e-icon-size' as any]: '96px' }} /></div>
          <div className="text-center sm:text-left">
            <div className="md-label-lg muted uppercase tracking-wider">{t('playlist')}</div>
            <FlowText as="h1" text={t('likedSongs')} className="md-display-md emph mt-1" />
            <div className="md-body-md mt-3"><span className="md-title-sm">{user?.displayName}</span> · {tracksWord(tracks.length, lang)}{tracks.length ? `, ${fmtDurationLong(tracks.reduce((s, x) => s + x.durationMs, 0), lang)}` : ''}</div>
          </div>
        </div>
        {tracks.length > 0 && (
          <div className="page flex items-center gap-3 mt-6 justify-center sm:justify-start">
            <PlayButton size="lg" playing={isThis && playing} onClick={() => (isThis ? p.toggle() : p.playTracks(tracks, 0, 'liked'))} />
            <M3eIconButton variant="tonal" size="medium" title={t('shuffle')} onClick={() => { if (!p.shuffle) p.toggleShuffle(); p.playTracks(tracks, Math.floor(Math.random() * tracks.length), 'liked'); }}><m3e-icon variant="rounded" name="shuffle" /></M3eIconButton>
            <OfflineToggle tracks={tracks} />
          </div>
        )}
      </div>
      <div className="page">
        {isLoading ? <TrackListSkeleton /> : tracks.length ? <TrackList tracks={tracks} context="liked" showAddedAt /> : <EmptyState icon="favorite" title={t('emptyLiked')} hint={t('emptyLikedHint')} />}
      </div>
    </div>
  );
}
