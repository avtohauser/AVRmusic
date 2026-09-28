import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function Modal({ open, onClose, title, children, width = 'max-w-md' }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; width?: string }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className={`relative w-full ${width} bg-bg-elev border border-line rounded-t-2xl sm:rounded-2xl shadow-2xl slide-up max-h-[90vh] flex flex-col`} role="dialog" aria-modal="true">
        {title && (
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <h2 className="text-lg font-bold">{title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label="close"><X size={18} /></button>
          </div>
        )}
        <div className="px-5 pb-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
