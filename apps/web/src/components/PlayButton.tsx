import { Pause, Play } from 'lucide-react';

interface Props {
  playing?: boolean;
  onClick: (e: React.MouseEvent) => void;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  variant?: 'accent' | 'white';
  label?: string;
}

export function PlayButton({ playing = false, onClick, size = 'md', className = '', variant = 'accent', label }: Props) {
  const dim = size === 'lg' ? 'w-14 h-14' : size === 'sm' ? 'w-9 h-9' : 'w-12 h-12';
  const icon = size === 'lg' ? 26 : size === 'sm' ? 16 : 20;
  const bg = variant === 'white' ? 'bg-fg text-bg' : 'accent-gradient text-white';
  return (
    <button
      type="button"
      aria-label={label ?? (playing ? 'Pause' : 'Play')}
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); onClick(e); }}
      className={`${dim} ${bg} rounded-full flex items-center justify-center shadow-lg shadow-black/30 transition-transform hover:scale-105 active:scale-95 ${className}`}
    >
      {playing ? <Pause size={icon} fill="currentColor" /> : <Play size={icon} fill="currentColor" className="ml-0.5" />}
    </button>
  );
}
