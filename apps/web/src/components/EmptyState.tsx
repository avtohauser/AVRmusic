import type { ReactNode } from 'react';

export function EmptyState({ icon, title, hint, action }: { icon?: ReactNode | string; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6 fade-in">
      {icon && (
        <div className="w-20 h-20 rounded-[28px] bg-secondary-container text-on-secondary-container flex items-center justify-center mb-5 spring">
          {typeof icon === 'string' ? <m3e-icon variant="rounded" name={icon} style={{ ['--m3e-icon-size' as any]: '36px' }} /> : icon}
        </div>
      )}
      <h3 className="md-title-lg emph flow-soft">{title}</h3>
      {hint && <p className="md-body-md muted mt-1 max-w-sm">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
