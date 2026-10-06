// A story card for a song: its cover over a blur of itself, the title and the artist, the brand below —
// drawn on a 1080×1920 canvas and handed to the share sheet (or saved as a picture).
import { useEffect, useState } from 'react';
import type { Track } from '@avrmusic/shared';
import { M3eButton } from '@/md';
import { Modal } from './Modal';
import { useTr } from '@/lib/social';
import { useUI } from '@/stores/ui';

const W = 1080, H = 1920;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Lines of [text] that fit [max] pixels, at most [lines] of them (the last one cut with "…"). */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number, lines: number): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width <= max) { line = next; continue; }
    if (line) out.push(line);
    line = w;
  }
  if (line) out.push(line);
  if (out.length > lines) {
    out.length = lines;
    let last = out[lines - 1];
    while (ctx.measureText(`${last}…`).width > max && last.length > 1) last = last.slice(0, -1);
    out[lines - 1] = `${last}…`;
  }
  return out;
}

async function draw(t: Track, caption: string): Promise<Blob | null> {
  await document.fonts?.ready;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#0B4248';
  ctx.fillRect(0, 0, W, H);
  const img = t.coverUrl ? await loadImage(t.coverUrl) : null;
  if (img) {
    ctx.save();
    ctx.filter = 'blur(70px) saturate(1.3)';
    const s = Math.max(W / img.width, H / img.height) * 1.25;
    ctx.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s);
    ctx.restore();
  }
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(0,0,0,0.15)');
  g.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '500 40px Outfit, system-ui, sans-serif';
  ctx.fillText(caption.toUpperCase().split('').join(' '), W / 2, 420);

  const size = 760, x = (W - size) / 2, y = 500;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 80; ctx.shadowOffsetY = 30;
  rounded(ctx, x, y, size, size, 56);
  ctx.fillStyle = '#123';
  ctx.fill();
  ctx.restore();
  if (img) {
    ctx.save();
    rounded(ctx, x, y, size, size, 56);
    ctx.clip();
    ctx.drawImage(img, x, y, size, size);
    ctx.restore();
  }

  ctx.fillStyle = '#fff';
  ctx.font = '600 76px Outfit, system-ui, sans-serif';
  let ty = y + size + 140;
  for (const l of wrap(ctx, t.title, W - 160, 2)) { ctx.fillText(l, W / 2, ty); ty += 88; }
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '400 50px Outfit, system-ui, sans-serif';
  ctx.fillText(wrap(ctx, [t.artist.name, ...(t.featuring ?? []).map((f) => f.name)].join(', '), W - 160, 1)[0] ?? '', W / 2, ty + 10);

  // the brand: "avr" in mist, "music" in pink
  ctx.font = '500 54px Outfit, system-ui, sans-serif';
  const avr = 'avr', music = ' music';
  ctx.font = '300 54px Outfit, system-ui, sans-serif';
  const wm = ctx.measureText(music).width;
  ctx.font = '500 54px Outfit, system-ui, sans-serif';
  const wa = ctx.measureText(avr).width;
  const left = W / 2 - (wa + wm) / 2;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#E6F4F1';
  ctx.fillText(avr, left, H - 130);
  ctx.font = '300 54px Outfit, system-ui, sans-serif';
  ctx.fillStyle = '#F2A0C4';
  ctx.fillText(music, left + wa, H - 130);

  return new Promise((resolve) => { try { c.toBlob((b) => resolve(b), 'image/png'); } catch { resolve(null); } });
}

export function StoryCard({ track, onClose }: { track: Track; onClose: () => void }) {
  const tr = useTr();
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void draw(track, tr('Сейчас слушаю', 'Now listening')).then((b) => {
      if (!alive || !b) return;
      setBlob(b);
      setUrl(URL.createObjectURL(b));
    });
    return () => { alive = false; };
  }, [track.id]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const name = `${track.artist.name} — ${track.title}.png`.replace(/[\\/:*?"<>|]/g, '_');
  const share = async () => {
    if (!blob) return;
    const file = new File([blob], name, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: `${track.artist.name} — ${track.title}` }); return; } catch { return; }
    }
    const a = document.createElement('a');
    a.href = url!; a.download = name; a.click();
    useUI.getState().toast(tr('Картинка сохранена', 'Picture saved'), 'success');
  };
  return (
    <Modal open onClose={onClose} title={tr('Карточка для сторис', 'Story card')}>
      <div className="flex justify-center">
        {url ? <img src={url} alt="" className="w-64 aspect-[9/16] rounded-3xl elev-2" /> : <div className="w-64 aspect-[9/16] rounded-3xl bg-surface-container-high animate-pulse" />}
      </div>
      <div className="flex justify-end gap-2 pt-4">
        <M3eButton variant="text" onClick={onClose}>{tr('Закрыть', 'Close')}</M3eButton>
        <M3eButton variant="filled" disabled={!blob || undefined} onClick={() => void share()}><m3e-icon variant="rounded" slot="icon" name="ios_share" />{tr('Поделиться', 'Share')}</M3eButton>
      </div>
    </Modal>
  );
}
