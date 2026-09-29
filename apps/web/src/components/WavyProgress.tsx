// Material 3 expressive "wavy" progress bar, drawn so that its motion costs nothing: the wave is a
// masked strip that slides with a transform (run by the compositor / GPU), so the bar keeps moving at
// the display's frame rate without touching the page's layout. (The library's wavy indicator moves an
// SVG path, which re-lays out and repaints the page on every frame.)
interface Props {
  /** 0…max */
  value?: number;
  max?: number;
  /** the wave travels (playing / working); still bars are flat */
  moving?: boolean;
  indeterminate?: boolean;
  className?: string;
}

export function WavyProgress({ value = 0, max = 100, moving = true, indeterminate = false, className = '' }: Props) {
  const pct = indeterminate ? 100 : Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  return (
    <div
      className={`wavy ${className}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={indeterminate ? undefined : Math.round(value)}
      data-moving={moving || indeterminate || undefined}
      data-indeterminate={indeterminate || undefined}
    >
      {pct < 100 && <div className="wavy-rest" style={{ left: `calc(${pct}% + 6px)` }} />}
      <div className="wavy-fill" style={{ width: `${pct}%` }}><div className="wavy-wave" /></div>
    </div>
  );
}
