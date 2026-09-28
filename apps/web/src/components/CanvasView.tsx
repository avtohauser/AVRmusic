import { useEffect, useRef } from 'react';
import type { Track } from '@avrmusic/shared';
import { canvasUrl } from '@/lib/api';
import { usePlayer } from '@/stores/player';

/** Spotify-style "canvas": looping vertical video or animated image behind the now-playing view. */
export function CanvasView({ track, className = '' }: { track: Track; className?: string }) {
  const playing = usePlayer((s) => s.playing);
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (playing) v.play().catch(() => {});
    else v.pause();
  }, [playing, track.id]);
  if (!track.hasCanvas) return null;
  const src = canvasUrl(track.id);
  if (track.canvasKind === 'video') {
    return <video ref={ref} key={track.id} src={src} className={`object-cover ${className}`} muted loop playsInline autoPlay preload="auto" disablePictureInPicture />;
  }
  return <img key={track.id} src={src} alt="" className={`object-cover ${className}`} />;
}

/** Fallback "canvas" for tracks without a video: the cover art slowly drifts and breathes (paused with playback). */
export function GeneratedCanvas({ src, playing, className = '' }: { src: string | null | undefined; playing: boolean; className?: string }) {
  if (!src) return null;
  return (
    <div className={`gen-canvas ${className}`} data-paused={!playing} aria-hidden="true">
      <img src={src} alt="" className="gen-canvas-blur" />
      <img src={src} alt="" className="gen-canvas-art" />
      <div className="gen-canvas-glow" />
    </div>
  );
}
