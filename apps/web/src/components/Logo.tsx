import { useId } from 'react';

/** AVRmusic mark: four-point sparkle with the lilac → violet gradient (vector, crisp at any size). */
export function Logo({ className = '', title = 'AVRmusic' }: { className?: string; title?: string }) {
  const id = `g${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label={title}>
      <defs>
        <linearGradient id={id} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#CF8FC9" />
          <stop offset="1" stopColor="#655BD3" />
        </linearGradient>
      </defs>
      <path fill={`url(#${id})`} d="M50 3C50 21 21 50 3 50 21 50 50 79 50 97 50 79 79 50 97 50 79 50 50 21 50 3Z" />
    </svg>
  );
}
