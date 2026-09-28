import { M3eFab, M3eIconButton } from '@/md';

interface Props {
  playing?: boolean;
  onClick: (e: any) => void;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  variant?: 'accent' | 'white';
  label?: string;
}

/** Primary play control: a Material FAB for hero sizes, a filled icon button for cards. */
export function PlayButton({ playing = false, onClick, size = 'md', className = '', label }: Props) {
  const icon = <m3e-icon variant="rounded" name={playing ? 'pause' : 'play_arrow'} filled />;
  const stop = (e: any) => { e.stopPropagation(); e.preventDefault(); onClick(e); };
  if (size === 'lg') {
    return <M3eFab className={`play-fab ${className}`} variant="primary" size="large" aria-label={label ?? (playing ? 'Pause' : 'Play')} onClick={stop}>{icon}</M3eFab>;
  }
  return <M3eIconButton className={className} variant="filled" size={size === 'sm' ? 'small' : 'medium'} aria-label={label ?? (playing ? 'Pause' : 'Play')} onClick={stop}>{icon}</M3eIconButton>;
}
