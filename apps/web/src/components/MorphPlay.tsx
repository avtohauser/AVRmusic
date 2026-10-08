// The app's play button: a cookie while paused that morphs into a rounded square while playing, with an
// expressive spring, and squashes a little when pressed (MorphPlayButton in the app).
import { shapePath, type ShapeName } from '@/lib/shapes';

interface Props {
  playing: boolean;
  onClick: (e: React.MouseEvent) => void;
  /** px */
  size?: number;
  label?: string;
  className?: string;
  /** the container and the icon: CSS colours (the theme's primary / on-primary by default) */
  container?: string;
  content?: string;
  paused?: ShapeName;
  loading?: boolean;
}

export function MorphPlay({ playing, onClick, size = 56, label, className = '', container, content, paused = 'cookie9', loading }: Props) {
  const d = shapePath(playing ? 'square' : paused);
  const icon = loading && playing ? 'hourglass_empty' : playing ? 'pause' : 'play_arrow';
  return (
    <button
      type="button"
      className={`morph-play ${className}`}
      style={{ width: size, height: size, ['--mp-c' as any]: container, ['--mp-on' as any]: content }}
      aria-label={label ?? (playing ? 'Pause' : 'Play')}
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); onClick(e); }}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true"><path d={d} style={{ d: `path('${d}')` } as any} /></svg>
      <m3e-icon variant="rounded" name={icon} filled style={{ ['--m3e-icon-size' as any]: `${Math.round(size * 0.46)}px` }} />
    </button>
  );
}
