import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Check, CloudDownload, LoaderCircle, Pause, Play, Plus, Disc3 } from 'lucide-react';
import type { CatalogAlbum, CatalogArtist, CatalogArtistSummary, CatalogTrack, AcquireKind, AcquireJob } from '@avrmusic/shared';
import { api } from '@/lib/api';
import { fmtMs, fmtCompact } from '@/lib/format';
import { useI18n, useT } from '@/lib/i18n';
import { useAuth } from '@/stores/auth';
import { useUI } from '@/stores/ui';
import { usePreview } from '@/stores/preview';
import { Cover } from './Cover';
import { useAcquireJobs } from '@/lib/queries';

const cardBase = 'group relative w-36 sm:w-40 md:w-44 shrink-0 snap-start p-3 rounded-2xl card-hover text-left';

/** "+" button that asks the server to fetch a catalogue entity into the library. */
export function AcquireButton({ kind, id, title, done, className = '', size = 18, label }: { kind: AcquireKind; id: number; title?: string; done?: boolean; className?: string; size?: number; label?: boolean }) {
  const user = useAuth((s) => s.user);
  const info = useAuth((s) => s.info);
  const toast = useUI((s) => s.toast);
  const qc = useQueryClient();
  const t = useT();
  const { data: jobs } = useAcquireJobs();
  const [busy, setBusy] = useState(false);
  if (!user || !info || info.acquire === 'off' || (info.acquire === 'admin' && user.role !== 'admin')) return null;
  const pending = (jobs ?? []).some((j) => (j.status === 'queued' || j.status === 'running') && j.title && title && j.title === title);
  const click = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (done || pending || busy) return;
    setBusy(true);
    try {
      await api.post('/api/catalog/acquire', { kind, id });
      toast(t('acquireQueued'), 'success');
      qc.invalidateQueries({ queryKey: ['acquire-jobs'] });
    } catch (err: any) { toast(err.message, 'error'); } finally { setBusy(false); }
  };
  const icon = done ? <Check size={size} className="text-emerald-400" /> : pending || busy ? <LoaderCircle size={size} className="animate-spin text-accent" /> : <Plus size={size} />;
  const text = done ? t('inLibrary') : pending ? t('acquiring') : kind === 'track' ? t('addToLibrary') : kind === 'album' ? t('addAlbum') : t('addDiscography');
  if (label) return <button className={`btn ${done ? 'btn-ghost' : 'btn-accent'} !h-9 ${className}`} onClick={click} disabled={done || pending || busy}>{icon}{text}</button>;
  return <button className={`icon-btn ${className}`} title={text} aria-label={text} onClick={click} disabled={done || pending || busy}>{icon}</button>;
}

export function PreviewButton({ url, size = 16, className = '' }: { url: string | null; size?: number; className?: string }) {
  const cur = usePreview((s) => s.url);
  const playing = usePreview((s) => s.playing);
  const toggle = usePreview((s) => s.toggle);
  const t = useT();
  if (!url) return <span className={`w-8 h-8 inline-block ${className}`} />;
  const active = cur === url && playing;
  return (
    <button className={`w-8 h-8 rounded-full flex items-center justify-center bg-surface hover:bg-surface-2 ${active ? 'text-accent' : 'text-muted'} ${className}`} title={t('preview')} onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(url); }}>
      {active ? <Pause size={size} fill="currentColor" /> : <Play size={size} fill="currentColor" className="ml-0.5" />}
    </button>
  );
}

export function CatalogTrackRow({ track, index, showAlbum = true }: { track: CatalogTrack; index?: number; showAlbum?: boolean }) {
  const t = useT();
  return (
    <div className={`track-row ${showAlbum ? '' : 'no-album'} group`}>
      <div className="flex items-center justify-center"><PreviewButton url={track.previewUrl} /></div>
      <div className="flex items-center gap-3 min-w-0">
        {track.album?.coverUrl && showAlbum && <Cover src={track.album.coverUrl} className="w-10 h-10" />}
        <div className="min-w-0">
          <div className="font-medium line-clamp-1 flex items-center gap-1.5">
            {track.libraryTrackId ? <Link to={`/album/${''}`} onClick={(e) => e.preventDefault()} className="text-fg">{track.title}</Link> : track.title}
            {track.explicit && <span className="text-[10px] px-1 rounded bg-surface-2 text-muted">E</span>}
            {index != null && <span className="sr-only">{index + 1}</span>}
          </div>
          <div className="text-sm text-muted truncate">
            <Link to={`/catalog/artist/${track.artist.id}`} className="hover:underline hover:text-fg">{track.artist.name}</Link>
            {track.featuring.map((f, i) => <span key={i}>, {f.id ? <Link to={`/catalog/artist/${f.id}`} className="hover:underline hover:text-fg">{f.name}</Link> : f.name}</span>)}
          </div>
        </div>
      </div>
      {showAlbum && <div className="hidden md:block text-sm text-muted line-clamp-1">{track.album ? <Link to={`/catalog/album/${track.album.id}`} className="hover:underline hover:text-fg">{track.album.title}</Link> : '—'}</div>}
      <div className="hidden md:block text-sm text-muted tabular-nums text-right pr-2">{fmtMs(track.durationMs)}</div>
      <div className="flex items-center justify-end gap-0.5">
        {track.libraryTrackId && <span className="text-xs text-emerald-400 hidden sm:inline mr-1">{t('inLibrary')}</span>}
        <AcquireButton kind="track" id={track.id} title={`${track.artist.name} — ${track.title}`} done={!!track.libraryTrackId} />
      </div>
    </div>
  );
}

export function CatalogArtistCard({ artist }: { artist: CatalogArtist | CatalogArtistSummary }) {
  const t = useT();
  const lang = useI18n((s) => s.lang);
  const fans = 'fans' in artist ? artist.fans : null;
  return (
    <Link to={`/catalog/artist/${artist.id}`} className={`${cardBase} text-center`}>
      <Cover src={artist.imageUrl} round kind="artist" className="w-full aspect-square shadow-lg shadow-black/30" />
      <div className="mt-3 font-semibold line-clamp-1">{artist.name}</div>
      <div className="text-sm text-muted line-clamp-1">{fans != null && fans > 0 ? `${fmtCompact(fans, lang)} ${t('fans')}` : t('artist')}</div>
      {'libraryArtistId' in artist && artist.libraryArtistId && <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center"><Check size={12} /></span>}
    </Link>
  );
}

export function CatalogAlbumCard({ album }: { album: CatalogAlbum }) {
  const t = useT();
  const sub = album.type === 'single' ? t('single') : album.type === 'ep' ? t('ep') : album.type === 'compilation' ? t('compilation') : album.year ? String(album.year) : t('album');
  const full = album.trackCount > 0 && album.inLibrary >= album.trackCount;
  return (
    <Link to={`/catalog/album/${album.id}`} className={cardBase}>
      <div className="relative">
        <Cover src={album.coverUrl} alt={album.title} className="w-full aspect-square shadow-lg shadow-black/30" />
        {full ? <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow"><Check size={14} /></span>
          : album.inLibrary > 0 ? <span className="absolute top-2 right-2 px-1.5 h-6 rounded-full bg-black/60 text-emerald-300 text-xs flex items-center">{album.inLibrary}/{album.trackCount}</span> : null}
        <AcquireButton kind="album" id={album.id} title={`${album.artist.name} — ${album.title} (альбом)`} done={full} className="absolute right-2 bottom-2 glass opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <div className="mt-3 font-semibold line-clamp-1">{album.title}</div>
      <div className="text-sm text-muted line-clamp-1">{sub} · {album.artist.name}</div>
    </Link>
  );
}

/** Live list of acquisition jobs (queue), shown in Downloads and the top bar. */
export function AcquireQueue({ compact = false }: { compact?: boolean }) {
  const { data: jobs } = useAcquireJobs();
  const qc = useQueryClient();
  const t = useT();
  const [open, setOpen] = useState<string | null>(null);
  const list = (jobs ?? []).slice(0, compact ? 5 : 50);
  if (!list.length) return compact ? null : <p className="text-muted text-sm">{t('queueEmpty')}</p>;
  return (
    <div className="space-y-2">
      {list.map((j: AcquireJob) => (
        <div key={j.id} className="card p-3">
          <div className="flex items-center gap-3">
            {j.status === 'done' ? <Check size={18} className="text-emerald-400 shrink-0" /> : j.status === 'error' ? <span className="text-red-400 shrink-0">✕</span> : <LoaderCircle size={18} className="animate-spin text-accent shrink-0" />}
            <div className="min-w-0 flex-1">
              <div className="font-medium line-clamp-1 text-sm">{j.title}</div>
              <div className="text-xs text-muted">
                {j.stats ? `${j.stats.imported ?? 0} ${t('acquiredN')}${j.stats.exists ? `, ${j.stats.exists} ${t('alreadyN')}` : ''}${j.stats.failed ? `, ${j.stats.failed} ${t('failedN')}` : ''} / ${j.stats.total}` : j.status === 'queued' ? t('queued') : t('acquiring')}
                {j.error ? ` · ${j.error}` : ''}
              </div>
            </div>
            {!compact && <button className="text-xs text-muted hover:text-fg" onClick={() => setOpen(open === j.id ? null : j.id)}>лог</button>}
            {(j.status === 'done' || j.status === 'error') && !compact && <button className="icon-btn" onClick={async () => { await api.del(`/api/catalog/jobs/${j.id}`); qc.invalidateQueries({ queryKey: ['acquire-jobs'] }); }}>✕</button>}
          </div>
          {(j.status === 'running' || j.status === 'queued') && <div className="h-1 rounded-full bg-surface-2 overflow-hidden mt-2"><div className="h-full accent-gradient transition-[width]" style={{ width: `${j.progress}%` }} /></div>}
          {open === j.id && <pre className="mt-2 text-xs text-muted bg-black/30 rounded-lg p-2 max-h-40 overflow-auto whitespace-pre-wrap">{j.log.slice(-30).join('\n') || '—'}</pre>}
          {!compact && j.imported.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{j.imported.slice(0, 12).map((tr) => <Link key={tr.id} to={tr.album ? `/album/${tr.album.id}` : `/artist/${tr.artist.id}`} className="chip !h-7 text-xs"><Disc3 size={12} className="mr-1" />{tr.title}</Link>)}</div>}
        </div>
      ))}
    </div>
  );
}

export function TopBarQueueIndicator() {
  const { data: jobs } = useAcquireJobs();
  const active = (jobs ?? []).filter((j) => j.status === 'queued' || j.status === 'running').length;
  const t = useT();
  if (!active) return null;
  return (
    <Link to="/downloads?tab=queue" className="btn btn-ghost !h-9 !px-3" title={t('acquiring')}>
      <CloudDownload size={16} className="text-accent" /><LoaderCircle size={14} className="animate-spin" /><span className="text-sm">{active}</span>
    </Link>
  );
}
