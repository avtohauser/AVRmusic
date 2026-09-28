import { useState } from 'react';

interface Props {
  src: string | null | undefined;
  alt?: string;
  className?: string;
  round?: boolean;
  kind?: 'album' | 'artist';
  mosaic?: string[];
  size?: number;
  /** Material 3 Expressive abstract shape for artists (e.g. "cookie"): applied via clip-path */
  shape?: 'circle' | 'cookie' | 'clover' | 'sunny' | 'none';
}

const CLIP: Record<string, string> = {
  cookie: 'polygon(50% 0%, 61% 8%, 74% 4%, 82% 15%, 96% 18%, 96% 32%, 100% 44%, 96% 56%, 98% 70%, 88% 80%, 84% 94%, 70% 94%, 58% 100%, 46% 96%, 32% 100%, 22% 90%, 8% 86%, 6% 72%, 0% 60%, 4% 46%, 0% 32%, 10% 22%, 12% 8%, 26% 6%, 36% 0%)',
  clover: 'polygon(50% 12%, 62% 2%, 78% 6%, 88% 18%, 92% 34%, 98% 50%, 92% 66%, 88% 82%, 78% 94%, 62% 98%, 50% 88%, 38% 98%, 22% 94%, 12% 82%, 8% 66%, 2% 50%, 8% 34%, 12% 18%, 22% 6%, 38% 2%)',
  sunny: 'polygon(50% 0%, 58% 12%, 70% 5%, 74% 19%, 88% 16%, 86% 30%, 100% 34%, 92% 45%, 100% 57%, 88% 63%, 92% 77%, 78% 78%, 76% 92%, 63% 87%, 57% 100%, 47% 90%, 38% 100%, 33% 87%, 20% 92%, 20% 78%, 6% 77%, 11% 63%, 0% 57%, 9% 46%, 0% 34%, 13% 30%, 11% 16%, 25% 19%, 29% 5%, 41% 12%)',
};

/** Cover image with graceful fallback, optional 2x2 mosaic (playlists) and expressive shapes (artists). */
export function Cover({ src, alt = '', className = '', round = false, kind = 'album', mosaic, size, shape }: Props) {
  const [err, setErr] = useState(false);
  const useShape = shape && shape !== 'none' && shape !== 'circle';
  const radius = round || shape === 'circle' ? 'rounded-full' : 'rounded-[16px]';
  const base = `relative overflow-hidden bg-surface-container-highest shrink-0 ${useShape ? '' : radius} ${className}`;
  const style: React.CSSProperties = { ...(size ? { width: size, height: size } : {}), ...(useShape ? { clipPath: CLIP[shape!] } : {}) };
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
