import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Track } from '@avrmusic/shared';
import { M3eFilterChip, M3eFilterChipSet, M3eIconButton } from '@/md';
import { listOffline, onOfflineChange, removeOffline, offlineUsage } from '@/lib/offline';
import { fmtBytes } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { TrackList } from '@/components/TrackList';
import { EmptyState } from '@/components/EmptyState';
import { PlayButton } from '@/components/PlayButton';
import { AcquireQueue } from '@/components/Catalog';
import { usePlayer } from '@/stores/player';
import { useUI } from '@/stores/ui';
import { useAuth } from '@/stores/auth';

export default function Downloads() {
  const [items, setItems] = useState<Array<{ track: Track; savedAt: number; size: number }>>([]);
  const [usage, setUsage] = useState(0);
  const t = useT();
  const toast = useUI((s) => s.toast);
  const p = usePlayer.getState();
  const [params, setParams] = useSearchParams();
  const info = useAuth((s) => s.info);
  const tab = params.get('tab') === 'queue' ? 'queue' : 'offline';
  const refresh = () => { listOffline().then(setItems); offlineUsage().then(setUsage); };
  useEffect(() => { refresh(); return onOfflineChange(refresh); }, []);
  const tracks = items.map((i) => i.track);
  return (
    <div className="page pt-4">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-16 h-16 rounded-[22px] bg-tertiary-container text-on-tertiary-container flex items-center justify-center"><m3e-icon variant="rounded" name="offline_pin" filled style={{ ['--m3e-icon-size' as any]: '32px' }} /></div>
        <div className="flex-1">
          <h1 className="md-headline-md emph">{t('downloadedTracks')}</h1>
          <p className="md-body-md muted">{items.length} {t('tracksCount')} · {fmtBytes(usage)}</p>
        </div>
        {tracks.length > 0 && <PlayButton size="lg" onClick={() => p.playTracks(tracks, 0, 'offline')} />}
        {tracks.length > 0 && <M3eIconButton size="medium" title={t('delete')} onClick={async () => { if (!confirm(t('confirmDelete'))) return; for (const i of items) await removeOffline(i.track.id); toast(t('removed')); }}><m3e-icon variant="rounded" name="delete" /></M3eIconButton>}
      </div>
      {info?.catalog && (
        <M3eFilterChipSet className="mb-4" onChange={(e: Event) => { const v = (e.target as any)?.value; if (v === 'queue') setParams({ tab: 'queue' }); else if (v === 'offline') setParams({}); }}>
          <M3eFilterChip value="offline" selected={tab === 'offline' || undefined}><m3e-icon variant="rounded" slot="icon" name="offline_pin" />{t('downloadedTracks')}</M3eFilterChip>
          <M3eFilterChip value="queue" selected={tab === 'queue' || undefined}><m3e-icon variant="rounded" slot="icon" name="cloud_download" />{t('libraryQueue')}</M3eFilterChip>
        </M3eFilterChipSet>
      )}
      {tab === 'queue' ? <AcquireQueue /> : tracks.length ? <TrackList tracks={tracks} context="offline" /> : <EmptyState icon="offline_pin" title={t('emptyDownloads')} hint={t('emptyDownloadsHint')} />}
    </div>
  );
}
