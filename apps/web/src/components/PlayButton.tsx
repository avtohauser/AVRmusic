import { M3eButton, M3eIconButton } from '@/md';
import { useT } from '@/lib/i18n';

interface Props {
  playing?: boolean;
  onClick: (e: any) => void;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  variant?: 'accent' | 'white';
  label?: string;
}

/** Primary play control: on a page's header the app's labelled "Listen" button, a filled icon button elsewhere. */
export function PlayButton({ playing = false, onClick, size = 'md', className = '', label }: Props) {
  const t = useT();
  const icon = <m3e-icon variant="rounded" name={playing ? 'pause' : 'play_arrow'} filled slot={size === 'lg' ? 'icon' : undefined} />;
  const stop = (e: any) => { e.stopPropagation(); e.preventDefault(); onClick(e); };
  if (size === 'lg') {
    return <M3eButton className={className} variant="filled" size="medium" aria-label={label ?? (playing ? t('pause') : t('play'))} onClick={stop}>{icon}{label ?? (playing ? t('pause') : t('play'))}</M3eButton>;
  }
  return <M3eIconButton className={className} variant="filled" size={size === 'sm' ? 'small' : 'medium'} aria-label={label ?? (playing ? 'Pause' : 'Play')} onClick={stop}>{icon}</M3eIconButton>;
}
