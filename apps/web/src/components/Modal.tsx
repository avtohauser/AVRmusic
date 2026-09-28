import { useEffect, useRef, type ReactNode } from 'react';
import { M3eDialog } from '@/md';

/** Thin wrapper over the Material dialog: controlled by `open`, reports closing through `onClose`. */
export function Modal({ open, onClose, title, children, width = 'max-w-md' }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; width?: string }) {
  const ref = useRef<any>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.show?.();
    if (!open && el.open) el.hide?.();
  }, [open]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = () => { if (open) onClose(); };
    el.addEventListener('closed', h);
    return () => el.removeEventListener('closed', h);
  }, [open, onClose]);
  return (
    <M3eDialog ref={ref} dismissible className={`${width} w-full`} style={{ ['--m3e-dialog-container-max-width' as any]: '560px' }}>
      {title && <span slot="header" className="md-headline-sm emph">{title}</span>}
      <div className="pt-1">{children}</div>
    </M3eDialog>
  );
}
