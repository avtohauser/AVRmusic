import { useUI } from '@/stores/ui';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';

export function Toasts() {
  const toasts = useUI((s) => s.toasts);
  const dismiss = useUI((s) => s.dismissToast);
  return (
    <div className="fixed left-1/2 -translate-x-1/2 z-[95] flex flex-col gap-2 items-center pointer-events-none" style={{ bottom: 'calc(var(--player-h) + var(--nav-h) + 16px + var(--safe-b))' }}>
      {toasts.map((t) => (
        <button key={t.id} onClick={() => dismiss(t.id)} className="pointer-events-auto glass border border-line rounded-full px-4 py-2 text-sm font-medium shadow-xl flex items-center gap-2 fade-in">
          {t.kind === 'error' ? <AlertCircle size={16} className="text-red-400" /> : t.kind === 'success' ? <CheckCircle2 size={16} className="text-emerald-400" /> : <Info size={16} className="text-accent-2" />}
          {t.text}
        </button>
      ))}
    </div>
  );
}
