import { useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { M3eIconButton } from '@/md';
import { keysOf, useFlip } from '@/lib/hooks';

export function Shelf({ title, subtitle, to, children }: { title: string; subtitle?: string; to?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useFlip(ref, [keysOf(children)]);
  const scroll = (dir: number) => ref.current?.scrollBy({ left: dir * (ref.current.clientWidth * 0.8), behavior: 'smooth' });
  return (
    <section className="mb-6 fade-in">
      <div className="flex items-end justify-between mb-1 gap-3">
        <div className="min-w-0">
          {to ? <Link to={to} data-vt="title" className="md-title-lg flow-soft hover:text-primary line-1 w-fit max-w-full">{title}</Link> : <h2 className="md-title-lg flow-soft line-1">{title}</h2>}
          {subtitle && <p className="md-body-sm muted">{subtitle}</p>}
        </div>
        <div className="hidden md:flex gap-1 shrink-0">
          <M3eIconButton variant="tonal" size="small" aria-label="prev" onClick={() => scroll(-1)}><m3e-icon variant="rounded" name="chevron_left" /></M3eIconButton>
          <M3eIconButton variant="tonal" size="small" aria-label="next" onClick={() => scroll(1)}><m3e-icon variant="rounded" name="chevron_right" /></M3eIconButton>
        </div>
      </div>
      <div ref={ref} className="flex gap-1 md:gap-2 overflow-x-auto no-scrollbar snap-x -mx-4 px-2.5 md:-mx-1.5 md:px-0 pb-1">
        {children}
      </div>
    </section>
  );
}

/** A grid of cards where a card that comes, goes or moves glides to its place instead of jumping. */
export function FlipGrid({ className, children }: { className: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useFlip(ref, [keysOf(children)]);
  return <div ref={ref} className={className}>{children}</div>;
}
