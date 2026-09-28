import { useRef, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Shelf({ title, subtitle, to, children }: { title: string; subtitle?: string; to?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => ref.current?.scrollBy({ left: dir * (ref.current.clientWidth * 0.8), behavior: 'smooth' });
  return (
    <section className="mb-8 fade-in">
      <div className="flex items-end justify-between mb-3">
        <div>
          {to ? <Link to={to} className="text-xl font-bold hover:underline">{title}</Link> : <h2 className="text-xl font-bold">{title}</h2>}
          {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        </div>
        <div className="hidden md:flex gap-1">
          <button className="icon-btn" onClick={() => scroll(-1)} aria-label="prev"><ChevronLeft size={18} /></button>
          <button className="icon-btn" onClick={() => scroll(1)} aria-label="next"><ChevronRight size={18} /></button>
        </div>
      </div>
      <div ref={ref} className="flex gap-3 md:gap-4 overflow-x-auto no-scrollbar snap-x -mx-4 px-4 md:mx-0 md:px-0 pb-1">
        {children}
      </div>
    </section>
  );
}
