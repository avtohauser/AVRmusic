import { usePlayer } from '@/stores/player';
import { M3eIconButton } from '@/md';
import { useT } from '@/lib/i18n';

/** Mute and a slim volume line (the app has none: the phone's buttons do it). */
export function Volume({ className = '' }: { className?: string }) {
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const p = usePlayer.getState();
  const t = useT();
  const v = muted ? 0 : volume;
  return (
    <span className={`flex items-center gap-1 ${className}`}>
      <M3eIconButton size="small" aria-label={t('mute')} onClick={p.toggleMute}><m3e-icon variant="rounded" name={v === 0 ? 'volume_off' : v < 0.5 ? 'volume_down' : 'volume_up'} /></M3eIconButton>
      <input type="range" className="slim-range flex-1 min-w-0" min={0} max={1} step={0.01} value={v} aria-label={t('mute')}
        style={{ ['--v' as any]: `${v * 100}%` }} onChange={(e) => p.setVolume(Number(e.target.value))} />
    </span>
  );
}
