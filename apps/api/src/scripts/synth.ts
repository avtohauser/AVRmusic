// Tiny procedural music synthesizer used only to generate demo tracks for the seed.
// Produces 16-bit PCM mono WAV buffers; no external tools required.

export interface SynthPreset {
  bpm: number;
  bars: number;
  root: number; // MIDI note
  scale: number[]; // semitone offsets
  progression: number[]; // scale degrees (0-based) per bar
  lead: 'sine' | 'saw' | 'square' | 'tri';
  pad: 'sine' | 'saw' | 'tri';
  drums: boolean;
  swing: number;
  seed: number;
}

const SAMPLE_RATE = 24000;

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return (s >>> 0) / 4294967296;
  };
}

const midiHz = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

function osc(kind: string, phase: number): number {
  const p = phase - Math.floor(phase);
  switch (kind) {
    case 'saw': return 2 * p - 1;
    case 'square': return p < 0.5 ? 1 : -1;
    case 'tri': return 4 * Math.abs(p - 0.5) - 1;
    default: return Math.sin(2 * Math.PI * p);
  }
}

export function synthesize(preset: SynthPreset): { wav: Buffer; durationSec: number } {
  const rand = rng(preset.seed);
  const beatSec = 60 / preset.bpm;
  const barSec = beatSec * 4;
  const total = preset.bars * barSec + 1.5;
  const n = Math.floor(total * SAMPLE_RATE);
  const out = new Float32Array(n);

  const chordTones = (degree: number) => {
    const s = preset.scale;
    const deg = (i: number) => preset.root + s[(degree + i) % s.length] + 12 * Math.floor((degree + i) / s.length);
    return [deg(0), deg(2), deg(4)];
  };

  // Pad chords
  for (let bar = 0; bar < preset.bars; bar++) {
    const degree = preset.progression[bar % preset.progression.length];
    const tones = chordTones(degree);
    const start = Math.floor(bar * barSec * SAMPLE_RATE);
    const end = Math.min(n, Math.floor((bar + 1) * barSec * SAMPLE_RATE));
    for (const t of tones) {
      const hz = midiHz(t);
      for (let i = start; i < end; i++) {
        const tt = (i - start) / SAMPLE_RATE;
        const env = Math.min(1, tt / 0.15) * Math.min(1, (barSec - tt) / 0.3);
        out[i] += 0.09 * env * osc(preset.pad, (i / SAMPLE_RATE) * hz) * (0.7 + 0.3 * Math.sin(tt * 3));
      }
    }
    // Bass
    const bass = midiHz(tones[0] - 24);
    for (let beat = 0; beat < 4; beat++) {
      const bs = start + Math.floor(beat * beatSec * SAMPLE_RATE);
      const be = Math.min(n, bs + Math.floor(beatSec * 0.9 * SAMPLE_RATE));
      for (let i = bs; i < be; i++) {
        const tt = (i - bs) / SAMPLE_RATE;
        const env = Math.exp(-tt * 4);
        out[i] += 0.22 * env * (Math.sin(2 * Math.PI * bass * tt) + 0.3 * Math.sin(4 * Math.PI * bass * tt));
      }
    }
  }

  // Lead melody: 8 sixteenth-ish notes per bar picked from the chord scale, with rests
  const stepSec = beatSec / 2;
  let lastNote = preset.root + 12;
  for (let bar = 0; bar < preset.bars; bar++) {
    const degree = preset.progression[bar % preset.progression.length];
    const tones = chordTones(degree).map((t) => t + 12);
    for (let step = 0; step < 8; step++) {
      if (rand() < 0.28) continue; // rest
      const swing = step % 2 ? preset.swing * stepSec : 0;
      const s0 = Math.floor((bar * barSec + step * stepSec + swing) * SAMPLE_RATE);
      const len = Math.floor(stepSec * (rand() < 0.3 ? 1.8 : 0.95) * SAMPLE_RATE);
      let note: number;
      if (rand() < 0.55) note = tones[Math.floor(rand() * tones.length)];
      else {
        const s = preset.scale;
        const idx = Math.floor(rand() * s.length);
        note = preset.root + 12 + s[idx] + (rand() < 0.2 ? 12 : 0);
      }
      if (Math.abs(note - lastNote) > 9) note = lastNote + Math.sign(note - lastNote) * 5;
      lastNote = note;
      const hz = midiHz(note);
      for (let i = s0; i < Math.min(n, s0 + len); i++) {
        const tt = (i - s0) / SAMPLE_RATE;
        const env = Math.min(1, tt / 0.01) * Math.exp(-tt * 3.2);
        const vib = 1 + 0.004 * Math.sin(2 * Math.PI * 5.5 * tt);
        out[i] += 0.16 * env * osc(preset.lead, tt * hz * vib);
      }
    }
  }

  // Drums: kick on 1 & 3, snare-ish noise on 2 & 4, hats on eighths
  if (preset.drums) {
    for (let bar = 0; bar < preset.bars; bar++) {
      for (let beat = 0; beat < 4; beat++) {
        const bs = Math.floor((bar * barSec + beat * beatSec) * SAMPLE_RATE);
        if (beat % 2 === 0) {
          for (let i = bs; i < Math.min(n, bs + SAMPLE_RATE * 0.18); i++) {
            const tt = (i - bs) / SAMPLE_RATE;
            out[i] += 0.5 * Math.exp(-tt * 18) * Math.sin(2 * Math.PI * (55 + 90 * Math.exp(-tt * 30)) * tt);
          }
        } else {
          for (let i = bs; i < Math.min(n, bs + SAMPLE_RATE * 0.12); i++) {
            const tt = (i - bs) / SAMPLE_RATE;
            out[i] += 0.18 * Math.exp(-tt * 25) * (rand() * 2 - 1);
          }
        }
        for (let h = 0; h < 2; h++) {
          const hs = bs + Math.floor(h * (beatSec / 2) * SAMPLE_RATE);
          for (let i = hs; i < Math.min(n, hs + SAMPLE_RATE * 0.03); i++) {
            const tt = (i - hs) / SAMPLE_RATE;
            out[i] += 0.06 * Math.exp(-tt * 90) * (rand() * 2 - 1);
          }
        }
      }
    }
  }

  // Fade out and soft clip
  const fade = Math.floor(1.2 * SAMPLE_RATE);
  for (let i = n - fade; i < n; i++) out[i] *= (n - i) / fade;
  const pcm = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const v = Math.tanh(out[i] * 1.4);
    pcm.writeInt16LE(Math.round(v * 32767), i * 2);
  }
  return { wav: wavHeader(pcm, SAMPLE_RATE, 1), durationSec: n / SAMPLE_RATE };
}

function wavHeader(pcm: Buffer, sampleRate: number, channels: number): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * 2, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  pentatonic: [0, 2, 4, 7, 9],
  lydian: [0, 2, 4, 6, 7, 9, 11],
};

/** Cover art: gradient square with geometric shapes, deterministic per seed. */
export function coverSvg(seed: number, title: string, subtitle: string): string {
  const r = rng(seed);
  const h1 = Math.floor(r() * 360), h2 = (h1 + 40 + Math.floor(r() * 120)) % 360;
  const shapes: string[] = [];
  for (let i = 0; i < 6; i++) {
    const cx = 60 + r() * 480, cy = 60 + r() * 480, rad = 40 + r() * 160;
    shapes.push(`<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${rad.toFixed(0)}" fill="hsl(${(h1 + i * 30) % 360} 80% ${55 + r() * 25}%)" opacity="${(0.25 + r() * 0.35).toFixed(2)}"/>`);
  }
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h1} 70% 35%)"/><stop offset="1" stop-color="hsl(${h2} 75% 20%)"/></linearGradient>
<filter id="b"><feGaussianBlur stdDeviation="18"/></filter></defs>
<rect width="600" height="600" fill="url(#g)"/>
<g filter="url(#b)">${shapes.join('')}</g>
<rect x="0" y="380" width="600" height="220" fill="rgba(0,0,0,0.35)"/>
<text x="40" y="470" font-family="Inter, Arial, sans-serif" font-size="46" font-weight="800" fill="#fff">${esc(title)}</text>
<text x="40" y="525" font-family="Inter, Arial, sans-serif" font-size="28" fill="rgba(255,255,255,0.8)">${esc(subtitle)}</text>
</svg>`;
}

/** Canvas: animated SVG (portrait 9:16) with drifting blobs — stands in for a looping video. */
export function canvasSvg(seed: number): string {
  const r = rng(seed);
  const h1 = Math.floor(r() * 360), h2 = (h1 + 90) % 360;
  const blobs: string[] = [];
  for (let i = 0; i < 5; i++) {
    const cx = 100 + r() * 340, cy = 150 + r() * 660, rad = 120 + r() * 160, dur = 6 + r() * 8;
    blobs.push(`<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${rad.toFixed(0)}" fill="hsl(${(h1 + i * 45) % 360} 85% 60%)" opacity="0.55">
<animate attributeName="cy" values="${cy.toFixed(0)};${(cy - 120 - r() * 120).toFixed(0)};${cy.toFixed(0)}" dur="${dur.toFixed(1)}s" repeatCount="indefinite"/>
<animate attributeName="r" values="${rad.toFixed(0)};${(rad * 1.25).toFixed(0)};${rad.toFixed(0)}" dur="${(dur * 0.7).toFixed(1)}s" repeatCount="indefinite"/></circle>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 540 960" width="540" height="960">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${h1} 60% 18%)"/><stop offset="1" stop-color="hsl(${h2} 70% 10%)"/></linearGradient>
<filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="45"/></filter></defs>
<rect width="540" height="960" fill="url(#g)"/>
<g filter="url(#b)">${blobs.join('')}</g>
</svg>`;
}
