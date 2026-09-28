import { Heart, Shuffle } from 'lucide-react';
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
        <div className="hero-bg" style={{ ['--hero' as any]: '#6d3df0' }} />
        <div className="page pt-6 md:pt-10 flex flex-col sm:flex-row sm:items-end gap-6">
          <div className="w-44 h-44 md:w-56 md:h-56 rounded-xl accent-gradient flex items-center justify-center text-white shadow-2xl mx-auto sm:mx-0"><Heart size={80} fill="currentColor" /></div>
          <div className="text-center sm:text-left">
            <div className="text-xs uppercase tracking-wider font-semibold">{t('playlist')}</div>
            <h1 className="text-4xl md:text-6xl font-extrabold mt-1">{t('likedSongs')}</h1>
            <div className="text-sm mt-3 text-fg/80"><span className="font-semibold">{user?.displayName}</span> · {tracksWord(tracks.length, lang)}{tracks.length ? `, ${fmtDurationLong(tracks.reduce((s, x) => s + x.durationMs, 0), lang)}` : ''}</div>
          </div>
        </div>
        {tracks.length > 0 && (
          <div className="page flex items-center gap-3 mt-6 justify-center sm:justify-start">
            <PlayButton size="lg" playing={isThis && playing} onClick={() => (isThis ? p.toggle() : p.playTracks(tracks, 0, 'liked'))} />
            <button className="icon-btn" onClick={() => { if (!p.shuffle) p.toggleShuffle(); p.playTracks(tracks, Math.floor(Math.random() * tracks.length), 'liked'); }}><Shuffle size={22} /></button>
            <OfflineToggle tracks={tracks} />
          </div>
        )}
      </div>
      <div className="page">
        {isLoading ? <TrackListSkeleton /> : tracks.length ? <TrackList tracks={tracks} context="liked" showAddedAt /> : <EmptyState icon={<Heart />} title={t('emptyLiked')} hint={t('emptyLikedHint')} />}
      </div>
    </div>
  );
}
