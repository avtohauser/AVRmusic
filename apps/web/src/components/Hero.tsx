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

/** Page header for album / artist / playlist with an expressive display title and a cover-tinted backdrop. */
export function Hero({ kind, title, cover, mosaic, round, meta, description, children, header }: Props) {
  const tint = useDominantColor(cover ?? mosaic?.[0], 'var(--md-sys-color-primary-container)');
  return (
    <div className="relative -mt-16 pt-16 mb-6">
      <div className="hero-bg" style={{ ['--hero' as any]: tint }} />
      {header && <img src={header} alt="" className="absolute inset-0 w-full h-[440px] object-cover -z-10 opacity-50 [mask-image:linear-gradient(to_bottom,black,transparent)]" />}
      <div className="page pt-6 md:pt-10">
        <div className="flex flex-col sm:flex-row sm:items-end gap-5 md:gap-7">
          <Cover src={cover} mosaic={mosaic} round={round} shape={round ? 'cookie' : undefined} kind={round ? 'artist' : 'album'} className={`w-44 h-44 md:w-56 md:h-56 mx-auto sm:mx-0 ${round ? '' : 'elev-3 !rounded-[28px]'}`} />
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <div className="md-label-lg text-on-surface-variant uppercase tracking-wider">{kind}</div>
            <h1 className="md-display-md emph leading-tight mt-1 line-2 break-words">{title}</h1>
            {description && <p className="md-body-lg muted mt-2 line-2 max-w-2xl">{description}</p>}
            {meta && <div className="md-body-md mt-2 flex flex-wrap gap-x-1 justify-center sm:justify-start items-center text-on-surface">{meta}</div>}
          </div>
        </div>
        {children && <div className="flex items-center gap-3 mt-6 flex-wrap justify-center sm:justify-start">{children}</div>}
      </div>
    </div>
  );
}
