import { useState } from 'react';
import { CircleArrowDown, CircleCheck, LoaderCircle } from 'lucide-react';
import type { Track } from '@avrmusic/shared';
import { useOfflineIds } from '@/lib/hooks';
import { removeOffline, saveOffline } from '@/lib/offline';
import { useAuth } from '@/stores/auth';
import { useUI } from '@/stores/ui';
import { useT } from '@/lib/i18n';

/** Spotify-style "Download" switch for a collection: saves every track for offline playback, or removes them all. */
export function OfflineToggle({ tracks, size = 24 }: { tracks: Track[]; size?: number }) {
  const user = useAuth((s) => s.user);
  const toast = useUI((s) => s.toast);
  const t = useT();
  const offline = useOfflineIds();
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  if (!user || !tracks.length) return null;
  const saved = tracks.filter((x) => offline.has(x.id)).length;
  const all = saved === tracks.length;

  const run = async () => {
    if (busy) return;
    if (all) {
      for (const x of tracks) await removeOffline(x.id);
      toast(t('removed'));
      return;
    }
    const missing = tracks.filter((x) => !offline.has(x.id));
    setBusy({ done: 0, total: missing.length });
    let failed = 0;
    for (let i = 0; i < missing.length; i++) {
      try { await saveOffline(missing[i]); } catch { failed++; }
      setBusy({ done: i + 1, total: missing.length });
    }
    setBusy(null);
    toast(failed ? `${t('error')}: ${failed}` : t('savedOffline'), failed ? 'error' : 'success');
  };

  const label = all ? t('removeOffline') : t('saveOffline');
  return (
    <button className="icon-btn relative" data-active={all} title={label} aria-label={label} onClick={run} disabled={!!busy}>
      {busy ? <LoaderCircle size={size} className="animate-spin text-accent" /> : all ? <CircleCheck size={size} className="text-emerald-400" /> : <CircleArrowDown size={size} />}
      {busy && <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[10px] tabular-nums text-muted">{busy.done}/{busy.total}</span>}
      {!busy && !all && saved > 0 && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400" />}
    </button>
  );
}
