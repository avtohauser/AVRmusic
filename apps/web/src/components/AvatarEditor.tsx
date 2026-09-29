import { useEffect, useRef, useState } from 'react';
import type { User } from '@avrmusic/shared';
import { M3eButton, M3eSlider, M3eSliderThumb } from '@/md';
import { api } from '@/lib/api';
import { useAuth } from '@/stores/auth';
import { useUI } from '@/stores/ui';
import { useT } from '@/lib/i18n';
import { Modal } from './Modal';

const VIEW = 240; // preview size, px
const OUT = 512; // saved avatar size, px

/** Pick a photo, drag/zoom it inside the circle and save a 512×512 JPEG (EXIF rotation respected). */
export function AvatarEditor({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);
  const toast = useUI((s) => s.toast);
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const [img, setImg] = useState<{ bmp: ImageBitmap; url: string } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => () => { if (img) URL.revokeObjectURL(img.url); }, [img]);
  useEffect(() => { if (!open) { setImg(null); setZoom(1); setOff({ x: 0, y: 0 }); } }, [open]);

  const base = img ? Math.max(VIEW / img.bmp.width, VIEW / img.bmp.height) : 1;
  const scale = base * zoom;
  const dw = img ? img.bmp.width * scale : VIEW;
  const dh = img ? img.bmp.height * scale : VIEW;
  const clamp = (o: { x: number; y: number }, s = scale) => {
    if (!img) return o;
    const mx = Math.max(0, (img.bmp.width * s - VIEW) / 2), my = Math.max(0, (img.bmp.height * s - VIEW) / 2);
    return { x: Math.min(mx, Math.max(-mx, o.x)), y: Math.min(my, Math.max(-my, o.y)) };
  };

  const pick = async (f: File) => {
    try {
      const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' } as any);
      setImg({ bmp, url: URL.createObjectURL(f) });
      setZoom(1); setOff({ x: 0, y: 0 });
    } catch { toast(t('error'), 'error'); }
  };
  const setZoomClamped = (z: number) => { const nz = Math.min(4, Math.max(1, z)); setZoom(nz); setOff((o) => clamp(o, base * nz)); };

  const save = async () => {
    if (!img) return;
    setBusy(true);
    try {
      const c = document.createElement('canvas');
      c.width = OUT; c.height = OUT;
      const ctx = c.getContext('2d')!;
      ctx.imageSmoothingQuality = 'high';
      const left = (VIEW - dw) / 2 + off.x, top = (VIEW - dh) / 2 + off.y;
      ctx.drawImage(img.bmp, -left / scale, -top / scale, VIEW / scale, VIEW / scale, 0, 0, OUT, OUT);
      const blob: Blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('encode'))), 'image/jpeg', 0.9));
      const fd = new FormData();
      fd.append('file', blob, 'avatar.jpg');
      setUser(await api.upload<User>('/api/me/avatar', fd));
      toast(t('saved'), 'success');
      onClose();
    } catch (e: any) { toast(e?.message ?? t('error'), 'error'); } finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    try { setUser(await api.del<User>('/api/me/avatar')); toast(t('removed')); onClose(); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={t('changePhoto')}>
      <div className="flex flex-col items-center gap-4">
        <div
          className="relative rounded-full overflow-hidden bg-surface-container-highest touch-none select-none"
          style={{ width: VIEW, height: VIEW, cursor: img ? 'grab' : 'pointer' }}
          onClick={() => { if (!img) fileRef.current?.click(); }}
          onPointerDown={(e) => { if (!img) return; (e.target as Element).setPointerCapture?.(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y }; }}
          onPointerMove={(e) => { const d = drag.current; if (d) setOff(clamp({ x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y })); }}
          onPointerUp={() => { drag.current = null; }}
          onPointerCancel={() => { drag.current = null; }}
          onWheel={(e) => { if (img) setZoomClamped(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08)); }}
        >
          {img ? (
            <img src={img.url} alt="" draggable={false} className="absolute max-w-none pointer-events-none" style={{ width: dw, height: dh, left: (VIEW - dw) / 2 + off.x, top: (VIEW - dh) / 2 + off.y, imageOrientation: 'from-image' as any }} />
          ) : user?.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2 muted"><m3e-icon variant="rounded" name="add_a_photo" style={{ ['--m3e-icon-size' as any]: '40px' }} /><span className="md-label-lg">{t('choosePhoto')}</span></div>
          )}
        </div>
        {img && (
          <div className="w-full flex items-center gap-3">
            <m3e-icon variant="rounded" name="zoom_out" />
            <M3eSlider className="flex-1" min={1} max={4} step={0.01} onInput={(e: any) => setZoomClamped(Number(e.target?.value ?? 1))}><M3eSliderThumb value={zoom} /></M3eSlider>
            <m3e-icon variant="rounded" name="zoom_in" />
          </div>
        )}
        {img && <p className="md-body-sm muted -mt-2">{t('dragToMove')}</p>}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = ''; }} />
        <div className="w-full flex flex-wrap gap-2 justify-end">
          {user?.avatarUrl && !img && <M3eButton variant="text" disabled={busy || undefined} onClick={remove} style={{ color: 'var(--md-sys-color-error)' }}><m3e-icon variant="rounded" slot="icon" name="delete" />{t('removePhoto')}</M3eButton>}
          <M3eButton variant="tonal" disabled={busy || undefined} onClick={() => fileRef.current?.click()}><m3e-icon variant="rounded" slot="icon" name="photo_library" />{img ? t('otherPhoto') : t('choosePhoto')}</M3eButton>
          {img && <M3eButton variant="filled" disabled={busy || undefined} onClick={save}><m3e-icon variant="rounded" slot="icon" name={busy ? 'hourglass_empty' : 'check'} />{t('save')}</M3eButton>}
        </div>
      </div>
    </Modal>
  );
}
