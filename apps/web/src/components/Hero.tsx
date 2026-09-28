import type { ReactNode } from 'react';
import { Cover } from './Cover';
import { useDominantColor } from '@/lib/hooks';

interface Props {
  kind: string;
  title: string;
  cover?: string | null;
  mosaic?: string[];
  round?: boolean;
  meta?: ReactNode;
  description?: string | null;
  children?: ReactNode;
  header?: string | null;
}

/** Page header for album / artist / playlist: cover, gradient backdrop tinted from the cover. */
export function Hero({ kind, title, cover, mosaic, round, meta, description, children, header }: Props) {
  const tint = useDominantColor(cover ?? mosaic?.[0], '#3b3b55');
  return (
    <div className="relative -mt-16 pt-16 mb-6">
      <div className="hero-bg" style={{ ['--hero' as any]: tint }} />
      {header && <img src={header} alt="" className="absolute inset-0 w-full h-[420px] object-cover -z-10 opacity-60 [mask-image:linear-gradient(to_bottom,black,transparent)]" />}
      <div className="page pt-6 md:pt-10">
        <div className="flex flex-col sm:flex-row sm:items-end gap-5 md:gap-7">
          <Cover src={cover} mosaic={mosaic} round={round} kind={round ? 'artist' : 'album'} className="w-44 h-44 md:w-56 md:h-56 shadow-2xl shadow-black/50 mx-auto sm:mx-0 !rounded-xl" />
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <div className="text-xs uppercase tracking-wider font-semibold text-fg/80">{kind}</div>
            <h1 className="text-3xl md:text-5xl lg:text-6xl font-extrabold leading-tight mt-1 line-clamp-2 break-words">{title}</h1>
            {description && <p className="text-muted mt-2 line-clamp-2 max-w-2xl">{description}</p>}
            {meta && <div className="text-sm mt-2 text-fg/80 flex flex-wrap gap-x-1 justify-center sm:justify-start items-center">{meta}</div>}
          </div>
        </div>
        {children && <div className="flex items-center gap-3 mt-6 flex-wrap justify-center sm:justify-start">{children}</div>}
      </div>
    </div>
  );
}
