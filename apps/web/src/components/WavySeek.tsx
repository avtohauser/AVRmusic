// The app's media seek bar: a wavy line while playing, flat when paused, with an invisible slider on top
// for dragging (the wave itself only moves by transform — see WavyProgress).
import { useState } from 'react';
import { WavyProgress } from './WavyProgress';

export function WavySeek({ position, duration, playing, onSeek, className = '' }: { position: number; duration: number; playing: boolean; onSeek: (sec: number) => void; className?: string }) {
  const [drag, setDrag] = useState<number | null>(null);
  const value = drag ?? position;
  const max = Math.max(1, duration || 1);
  return (
    <div className={`wavy-seek ${className}`}>
      <WavyProgress moving={playing && drag === null} value={(Math.min(value, max) / max) * 100} />
      <input
        type="range" min={0} max={max} step={0.1} value={Math.min(value, max)} aria-label="seek"
        onChange={(e) => setDrag(Number(e.target.value))}
        onPointerUp={() => { if (drag !== null) { onSeek(drag); setDrag(null); } }}
        onKeyUp={() => { if (drag !== null) { onSeek(drag); setDrag(null); } }}
        onTouchEnd={() => { if (drag !== null) { onSeek(drag); setDrag(null); } }}
      />
    </div>
  );
}
