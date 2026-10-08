import { useState } from 'react';
import { shapeMask, type ShapeName } from '@/lib/shapes';

interface Props {
  src: string | null | undefined;
  alt?: string;
  className?: string;
  round?: boolean;
  kind?: 'album' | 'artist';
  mosaic?: string[];
  size?: number;
  /** a Material 3 Expressive shape, as in the app: artists wear the 9-sided cookie, people the 12-sided one */
  shape?: 'circle' | 'cookie' | 'cookie12' | 'clover' | 'sunny' | 'none';
}

/** Cover image with graceful fallback, optional 2x2 mosaic (playlists) and expressive shapes (artists). */
export function Cover({ src, alt = '', className = '', round = false, kind = 'album', mosaic, size, shape }: Props) {
  const [err, setErr] = useState(false);
  const useShape = shape && shape !== 'none' && shape !== 'circle';
  const radius = round || shape === 'circle' ? 'rounded-full' : 'rounded-[16px]';
  const base = `relative overflow-hidden bg-surface-container-highest shrink-0 ${useShape ? '' : radius} ${className}`;
  const style: React.CSSProperties = { ...(size ? { width: size, height: size } : {}), ...(useShape ? shapeMask((shape === 'cookie' ? 'cookie9' : shape) as ShapeName) : {}) };
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
      <div className={`${base} flex items-center justify-center text-on-surface-variant`} style={style}>
        <m3e-icon variant="rounded" name={kind === 'artist' ? 'person' : 'music_note'} style={{ ['--m3e-icon-size' as any]: 'clamp(20px, 45%, 96px)' }} />
      </div>
    );
  }
  return (
    <div className={base} style={style}>
      <img src={src || (fallbackSrc as string)} alt={alt} loading="lazy" decoding="async" onError={() => setErr(true)} className="w-full h-full object-cover" />
    </div>
  );
}
