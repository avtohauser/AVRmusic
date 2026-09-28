import { useEffect, useState } from 'react';
import { HardDriveDownload, Trash2 } from 'lucide-react';
import type { Track } from '@avrmusic/shared';
import { listOffline, onOfflineChange, removeOffline, offlineUsage } from '@/lib/offline';
import { fmtBytes } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { TrackList } from '@/components/TrackList';
import { EmptyState } from '@/components/EmptyState';
import { PlayButton } from '@/components/PlayButton';
import { usePlayer } from '@/stores/player';
import { useUI } from '@/stores/ui';

export default function Downloads() {
  const [items, setItems] = useState<Array<{ track: Track; savedAt: number; size: number }>>([]);
  const [usage, setUsage] = useState(0);
  const t = useT();
  const toast = useUI((s) => s.toast);
  const p = usePlayer.getState();
  const refresh = () => { listOffline().then(setItems); offlineUsage().then(setUsage); };
  useEffect(() => { refresh(); return onOfflineChange(refresh); }, []);
  const tracks = items.map((i) => i.track);
  return (
    <div className="page pt-4">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center"><HardDriveDownload size={30} /></div>
        <div className="flex-1">
          <h1 className="text-2xl md:text-3xl font-extrabold">{t('downloadedTracks')}</h1>
          <p className="text-muted text-sm">{items.length} {t('tracksCount')} · {fmtBytes(usage)}</p>
        </div>
        {tracks.length > 0 && <PlayButton size="lg" onClick={() => p.playTracks(tracks, 0, 'offline')} />}
        {tracks.length > 0 && <button className="icon-btn" title={t('delete')} onClick={async () => { if (!confirm(t('confirmDelete'))) return; for (const i of items) await removeOffline(i.track.id); toast(t('removed')); }}><Trash2 size={20} /></button>}
      </div>
      {tracks.length ? <TrackList tracks={tracks} context="offline" /> : <EmptyState icon={<HardDriveDownload />} title={t('emptyDownloads')} hint={t('emptyDownloadsHint')} />}
    </div>
  );
}
