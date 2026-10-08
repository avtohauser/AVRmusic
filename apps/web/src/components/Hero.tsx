import type { ReactNode } from 'react';
import { Cover } from './Cover';
import { FlowText } from '@/components/FlowText';

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

/**
 * A page's header as in the app (Header + Backdrop): the cover blurred behind it, the cover itself (an artist
 * wears the cookie), the flowing title, a line about it and the buttons — centred on phones, beside the cover
 * on wide screens.
 */
export function Hero({ kind, title, cover, mosaic, round, meta, description, children, header }: Props) {
  const back = header ?? cover ?? mosaic?.[0];
  return (
    <div className="relative mb-4 isolate">
      {back && <div className="backdrop"><img src={back} alt="" /></div>}
      <div className="page pt-4 md:pt-10">
        <div className="flex flex-col md:flex-row md:items-end items-center gap-4 md:gap-8">
          <Cover src={cover} mosaic={mosaic} round={round} shape={round ? 'cookie' : undefined} kind={round ? 'artist' : 'album'}
            className={`w-56 h-56 md:w-60 md:h-60 shrink-0 ${round ? '' : '!rounded-[28px] elev-3'}`} />
          <div className="min-w-0 flex-1 text-center md:text-left">
            <div className="md-label-lg muted">{kind}</div>
            <FlowText as="h1" text={title} className="md-headline-md hero-title mt-1 line-3 break-words" />
            {description && <p className="md-body-md muted mt-2 line-2 max-w-2xl mx-auto md:mx-0">{description}</p>}
            {meta && <div className="md-body-md mt-2 flex flex-wrap gap-x-1 justify-center md:justify-start items-center muted">{meta}</div>}
          </div>
        </div>
        {children && <div className="flex items-center gap-2.5 mt-5 flex-wrap justify-center md:justify-start">{children}</div>}
      </div>
    </div>
  );
}
