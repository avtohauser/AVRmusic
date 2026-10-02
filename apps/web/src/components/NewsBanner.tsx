import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { NewsItem } from '@avrmusic/shared';
import { M3eButton } from '@/md';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useAuth } from '@/stores/auth';

const KEY = 'avr.news.seen';
const seenAt = () => { try { return localStorage.getItem(KEY) ?? ''; } catch { return ''; } };

/** News from the admin that this browser has not seen yet; "Got it" marks them read. */
export function NewsBanner() {
  const t = useT();
  const user = useAuth((s) => s.user);
  const [seen, setSeen] = useState(seenAt);
  const { data } = useQuery({ queryKey: ['news'], queryFn: () => api.get<NewsItem[]>('/api/news'), enabled: !!user, refetchInterval: 5 * 60_000 });
  const unread = (data ?? []).filter((n) => n.createdAt > seen);
  if (!unread.length) return null;
  const read = () => {
    const newest = unread[0].createdAt;
    try { localStorage.setItem(KEY, newest); } catch { /* private mode */ }
    setSeen(newest);
  };
  return (
    <div className="mx-4 md:mx-6 mt-3 rounded-[24px] bg-primary-container text-on-primary-container px-4 py-3 flex gap-3 items-start">
      <m3e-icon variant="rounded" name="campaign" />
      <div className="min-w-0 flex-1 space-y-2">
        {unread.slice(0, 3).map((n) => (
          <div key={n.id}>
            <div className="md-title-sm">{n.title}</div>
            {n.body && <div className="md-body-sm whitespace-pre-line opacity-90">{n.body}</div>}
          </div>
        ))}
      </div>
      <M3eButton variant="text" onClick={read}>{t('gotIt')}</M3eButton>
    </div>
  );
}
