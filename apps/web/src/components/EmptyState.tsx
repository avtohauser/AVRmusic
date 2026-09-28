import type { ReactNode } from 'react';

export function EmptyState({ icon, title, hint, action }: { icon?: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6 fade-in">
      {icon && <div className="w-16 h-16 rounded-2xl bg-surface flex items-center justify-center text-muted mb-4">{icon}</div>}
      <h3 className="text-lg font-semibold">{title}</h3>
      {hint && <p className="text-muted mt-1 max-w-sm">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
