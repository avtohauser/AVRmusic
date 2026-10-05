import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { CatalogAlbum, CatalogArtist, CatalogArtistSummary, CatalogTrack, AcquireKind, AcquireJob } from '@avrmusic/shared';
import { M3eAssistChip, M3eButton, M3eCard, M3eIconButton } from '@/md';
import { WavyProgress } from './WavyProgress';
import { api } from '@/lib/api';
import { fmtMs, fmtCompact } from '@/lib/format';
import { useI18n, useT } from '@/lib/i18n';
import { useAuth } from '@/stores/auth';
import { useUI } from '@/stores/ui';
import { usePreview } from '@/stores/preview';
import { Cover } from './Cover';
import { Mascot } from './Mascot';
import { useAcquireJobs } from '@/lib/queries';
import { usePlayer } from '@/stores/player';
import { playCatalog } from '@/lib/instant';

const cardBase = 'group relative w-36 sm:w-40 md:w-44 shrink-0 snap-start';

/** "+" button that asks the server to fetch a catalogue entity into the library. */
export function AcquireButton({ kind, id, title, done, className = '', label }: { kind: AcquireKind; id: number; title?: string; done?: boolean; className?: string; size?: number; label?: boolean }) {
  const user = useAuth((s) => s.user);
  const info = useAuth((s) => s.info);
  const toast = useUI((s) => s.toast);
  const qc = useQueryClient();
  const t = useT();
  const { data: jobs } = useAcquireJobs();
  const [busy, setBusy] = useState(false);
  if (!user || !info || info.acquire === 'off' || (info.acquire === 'admin' && user.role !== 'admin')) return null;
  const pending = (jobs ?? []).some((j) => (j.status === 'queued' || j.status === 'running') && j.title && title && j.title === title);
  const click = async (e: any) => {
    e.preventDefault(); e.stopPropagation();
    if (done || pending || busy) return;
    setBusy(true);
    try {
      await api.post('/api/catalog/acquire', { kind, id });
      toast(t('acquireQueued'), 'success');
      qc.invalidateQueries({ queryKey: ['acquire-jobs'] });
    } catch (err: any) { toast(err.message, 'error'); } finally { setBusy(false); }
  };
  const icon = done ? 'check' : pending || busy ? 'hourglass_empty' : 'add';
  const text = done ? t('inLibrary') : pending ? t('acquiring') : kind === 'track' ? t('addToLibrary') : kind === 'album' ? t('addAlbum') : t('addDiscography');
  const working = !done && (pending || busy);
  if (label) return <M3eButton variant={done ? 'tonal' : 'filled'} className={className} onClick={click} disabled={done || pending || busy || undefined}>{working ? <Mascot mood="think" slot="icon" className="w-[18px] h-[18px]" /> : <m3e-icon variant="rounded" slot="icon" name={icon} />}{text}</M3eButton>;
  return <M3eIconButton size="small" variant={done ? 'tonal' : 'standard'} className={className} title={text} aria-label={text} onClick={click} disabled={done || pending || busy || undefined}>{working ? <Mascot mood="think" className="w-5 h-5" /> : <m3e-icon variant="rounded" name={icon} style={done ? { color: 'var(--md-sys-color-tertiary)' } : undefined} />}</M3eIconButton>;
}

export function PreviewButton({ url, className = '' }: { url: string | null; size?: number; className?: string }) {
  const cur = usePreview((s) => s.url);
  const playing = usePreview((s) => s.playing);
  const toggle = usePreview((s) => s.toggle);
  const t = useT();
  if (!url) return <span className={`w-10 h-10 inline-block ${className}`} />;
  const active = cur === url && playing;
  return (
    <M3eIconButton size="small" variant="tonal" className={className} title={t('preview')} onClick={(e: any) => { e.preventDefault(); e.stopPropagation(); toggle(url); }}>
      <m3e-icon variant="rounded" name={active ? 'pause' : 'play_arrow'} filled />
    </M3eIconButton>
  );
}

/** Plays a catalogue song in full at once (the server fetches it meanwhile); the rest of [list] follows it. */
export function CatalogPlayButton({ track, list, index = 0, context }: { track: CatalogTrack; list?: CatalogTrack[]; index?: number; context?: string }) {
  const user = useAuth((s) => s.user);
  const active = usePlayer((s) => { const c = s.queue[s.index]; return !!c && (c.id === `dz:${track.id}` || (!!track.libraryTrackId && c.id === track.libraryTrackId)); });
  const playing = usePlayer((s) => s.playing);
  const t = useT();
  if (!user) return <PreviewButton url={track.previewUrl} />;
  return (
    <M3eIconButton size="small" variant={active ? 'filled' : 'tonal'} title={t('play')} onClick={(e: any) => {
      e.preventDefault(); e.stopPropagation();
      if (active) usePlayer.getState().toggle(); else void playCatalog(list ?? [track], list ? index : 0, context);
    }}>
      {active && playing ? <span className="eq"><i /><i /><i /></span> : <m3e-icon variant="rounded" name="play_arrow" filled />}
    </M3eIconButton>
  );
}

export function CatalogTrackRow({ track, index, showAlbum = true, list, context }: { track: CatalogTrack; index?: number; showAlbum?: boolean; list?: CatalogTrack[]; context?: string }) {
  const t = useT();
  return (
    <div className={`track-row ${showAlbum ? '' : 'no-album'} group`} onDoubleClick={() => void playCatalog(list ?? [track], list ? index ?? 0 : 0, context)}>
      <div className="flex items-center justify-center"><CatalogPlayButton track={track} list={list} index={index} context={context} /></div>
      <div className="flex items-center gap-3 min-w-0">
        {track.album?.coverUrl && showAlbum && <Cover src={track.album.coverUrl} className="w-11 h-11 !rounded-[12px]" />}
        <div className="min-w-0">
          <div className="md-title-sm line-1">
            {track.title}
            {track.explicit && <span className="ml-1.5 md-label-sm px-1 rounded bg-surface-container-highest muted">E</span>}
            {index != null && <span className="sr-only">{index + 1}</span>}
          </div>
          <div className="md-body-sm muted truncate">
            <Link to={`/catalog/artist/${track.artist.id}`} className="hover:underline hover:text-on-surface">{track.artist.name}</Link>
            {track.featuring.map((f, i) => <span key={i}>, {f.id ? <Link to={`/catalog/artist/${f.id}`} className="hover:underline hover:text-on-surface">{f.name}</Link> : f.name}</span>)}
          </div>
        </div>
      </div>
      {showAlbum && <div className="hidden md:block md-body-md muted line-1">{track.album ? <Link to={`/catalog/album/${track.album.id}`} className="hover:underline hover:text-on-surface">{track.album.title}</Link> : '—'}</div>}
      <div className="hidden md:block md-body-md muted tabular-nums text-right pr-2">{fmtMs(track.durationMs)}</div>
      <div className="flex items-center justify-end gap-1">
        {track.libraryTrackId && <span className="md-label-sm text-tertiary hidden sm:inline">{t('inLibrary')}</span>}
        <AcquireButton kind="track" id={track.id} title={`${track.artist.name} — ${track.title}`} done={!!track.libraryTrackId} />
      </div>
    </div>
  );
}

export function CatalogArtistCard({ artist }: { artist: CatalogArtist | CatalogArtistSummary }) {
  const t = useT();
  const lang = useI18n((s) => s.lang);
  const fans = 'fans' in artist ? artist.fans : null;
  const inLib = 'libraryArtistId' in artist && !!artist.libraryArtistId;
  return (
    <Link to={`/catalog/artist/${artist.id}`} className={cardBase}>
    <M3eCard variant="filled" actionable className="media-card block w-full">
      <div className="p-3">
        <Cover src={artist.imageUrl} shape="cookie" kind="artist" className="w-full aspect-square spring group-hover:rotate-6" />
        <div className="mt-3 md-title-sm line-1 text-center">{artist.name}</div>
        <div className="md-body-sm muted line-1 text-center">{fans != null && fans > 0 ? `${fmtCompact(fans, lang)} ${t('fans')}` : t('artist')}</div>
        {inLib && <span className="absolute top-4 right-4 w-6 h-6 rounded-full bg-tertiary text-on-tertiary flex items-center justify-center"><m3e-icon variant="rounded" name="check" style={{ ['--m3e-icon-size' as any]: '14px' }} /></span>}
      </div>
    </M3eCard>
    </Link>
  );
}

export function CatalogAlbumCard({ album }: { album: CatalogAlbum }) {
  const t = useT();
  const sub = album.type === 'single' ? t('single') : album.type === 'ep' ? t('ep') : album.type === 'compilation' ? t('compilation') : album.year ? String(album.year) : t('album');
  const full = album.trackCount > 0 && album.inLibrary >= album.trackCount;
  return (
    <Link to={`/catalog/album/${album.id}`} className={cardBase}>
    <M3eCard variant="filled" actionable className="media-card block w-full">
      <div className="p-3">
        <div className="relative">
          <Cover src={album.coverUrl} alt={album.title} className="w-full aspect-square !rounded-[20px] elev-1" />
          {full ? <span className="absolute top-2 right-2 w-7 h-7 rounded-full bg-tertiary text-on-tertiary flex items-center justify-center elev-1"><m3e-icon variant="rounded" name="check" style={{ ['--m3e-icon-size' as any]: '16px' }} /></span>
            : album.inLibrary > 0 ? <span className="absolute top-2 right-2 px-2 h-7 rounded-full bg-surface-container-highest text-tertiary md-label-sm flex items-center">{album.inLibrary}/{album.trackCount}</span> : null}
          <AcquireButton kind="album" id={album.id} title={`${album.artist.name} — ${album.title} (альбом)`} done={full} className="absolute right-2 bottom-2 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        <div className="mt-3 md-title-sm line-1">{album.title}</div>
        <div className="md-body-sm muted line-1">{sub} · {album.artist.name}</div>
      </div>
    </M3eCard>
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
  if (!list.length) return compact ? null : <p className="muted md-body-md">{t('queueEmpty')}</p>;
  return (
    <div className="space-y-2">
      {list.map((j: AcquireJob) => (
        <div key={j.id} className="surface-low rounded-[20px] p-3">
          <div className="flex items-center gap-3">
            <m3e-icon variant="rounded" name={j.status === 'done' ? 'check_circle' : j.status === 'error' ? 'error' : 'cloud_download'} filled style={{ color: j.status === 'done' ? 'var(--md-sys-color-tertiary)' : j.status === 'error' ? 'var(--md-sys-color-error)' : 'var(--md-sys-color-primary)' }} />
            <div className="min-w-0 flex-1">
              <div className="md-title-sm line-1">{j.title}</div>
              <div className="md-body-sm muted">
                {j.stats ? `${j.stats.imported ?? 0} ${t('acquiredN')}${j.stats.exists ? `, ${j.stats.exists} ${t('alreadyN')}` : ''}${j.stats.failed ? `, ${j.stats.failed} ${t('failedN')}` : ''} / ${j.stats.total}` : j.status === 'queued' ? `${t('queued')}${j.position && j.position > 1 ? ` · ${t('aheadN')} ${j.position - 1}` : j.position === 1 ? ` · ${t('nextUp')}` : ''}` : t('acquiring')}
                {j.error ? ` · ${j.error}` : ''}
              </div>
            </div>
            {!compact && <M3eButton variant="text" onClick={() => setOpen(open === j.id ? null : j.id)}>лог</M3eButton>}
            {(j.status === 'done' || j.status === 'error') && !compact && <M3eIconButton size="small" aria-label="remove" onClick={async () => { await api.del(`/api/catalog/jobs/${j.id}`); qc.invalidateQueries({ queryKey: ['acquire-jobs'] }); }}><m3e-icon variant="rounded" name="close" /></M3eIconButton>}
          </div>
          {(j.status === 'running' || j.status === 'queued') && <WavyProgress className="mt-2" indeterminate={j.status === 'queued'} value={j.progress} />}
          {open === j.id && <pre className="mt-2 md-body-sm muted surface-highest rounded-[12px] p-2 max-h-40 overflow-auto whitespace-pre-wrap">{j.log.slice(-30).join('\n') || '—'}</pre>}
          {!compact && j.imported.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{j.imported.slice(0, 12).map((tr) => <M3eAssistChip key={tr.id} href={tr.album ? `/album/${tr.album.id}` : `/artist/${tr.artist.id}`}><m3e-icon variant="rounded" slot="icon" name="album" />{tr.title}</M3eAssistChip>)}</div>}
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
    <M3eButton variant="tonal" href="/downloads?tab=queue" title={t('acquiring')}>
      <Mascot mood="think" slot="icon" className="w-[18px] h-[18px]" /><span className="md-label-lg">{active}</span>
    </M3eButton>
  );
}
