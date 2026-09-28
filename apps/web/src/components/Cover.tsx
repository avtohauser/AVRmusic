import { useState } from 'react';
import { Music2, User } from 'lucide-react';

interface Props {
  src: string | null | undefined;
  alt?: string;
  className?: string;
  round?: boolean;
  kind?: 'album' | 'artist';
  mosaic?: string[];
  size?: number;
}

/** Cover image with graceful fallback, optional 2x2 mosaic for playlists without a custom cover. */
export function Cover({ src, alt = '', className = '', round = false, kind = 'album', mosaic, size }: Props) {
  const [err, setErr] = useState(false);
  const shape = round ? 'rounded-full' : 'rounded-lg';
  const base = `relative overflow-hidden bg-surface-2 shrink-0 ${shape} ${className}`;
  const style = size ? { width: size, height: size } : undefined;
  if (!src && mosaic && mosaic.length >= 4) {
    return (
      <div className={`${base} grid grid-cols-2 grid-rows-2`} style={style}>
        {mosaic.slice(0, 4).map((m, i) => <img key={i} src={m} alt="" loading="lazy" className="w-full h-full object-cover" />)}
      </div>
    );
  }
  const fallbackSrc = !src && mosaic?.[0];
  if ((!src && !fallbackSrc) || err) {
    return (
      <div className={`${base} flex items-center justify-center text-muted`} style={style}>
        {kind === 'artist' ? <User className="w-[40%] h-[40%]" strokeWidth={1.5} /> : <Music2 className="w-[40%] h-[40%]" strokeWidth={1.5} />}
      </div>
    );
  }
  return (
    <div className={base} style={style}>
      <img src={src || (fallbackSrc as string)} alt={alt} loading="lazy" decoding="async" onError={() => setErr(true)} className="w-full h-full object-cover" />
    </div>
  );
}
