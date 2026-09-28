import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminStats, Invite, Track, UploadResult, User } from '@avrmusic/shared';
import { M3eButton, M3eFilterChip, M3eFilterChipSet, M3eFormField, M3eIconButton, M3eLinearProgressIndicator, M3eOption, M3eSelect } from '@/md';
import { api } from '@/lib/api';
import { useUI } from '@/stores/ui';
import { useT } from '@/lib/i18n';
import { fmtBytes, fmtMs, fmtNumber } from '@/lib/format';
import { Cover } from '@/components/Cover';
import { useDebounced } from '@/lib/hooks';

type Tab = 'overview' | 'upload' | 'import' | 'tracks' | 'users';

export interface ImportJob { id: string; kind: 'url' | 'lyrics' | 'acquire'; url?: string; mode?: 'audio' | 'video'; title?: string; status: 'queued' | 'running' | 'done' | 'error'; progress: number; log: string[]; imported: Track[]; error?: string; createdAt: string; stats?: Record<string, number> }
interface Capabilities { ytdlp: boolean; ytdlpVersion: string | null; ffmpeg: boolean; musicDir: string | null; mediaDir: string; sources?: Array<{ name: string; label: string; enabled: boolean; ok: boolean; reason?: string }> }

export default function Admin() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'overview';
  const t = useT();
  const tabs: Array<[Tab, string, string]> = [['overview', t('overview'), 'bar_chart'], ['upload', t('upload'), 'upload'], ['import', 'Импорт по ссылке', 'link'], ['tracks', t('manageTracks'), 'queue_music'], ['users', t('users'), 'group']];
  return (
    <div className="page pt-4">
      <h1 className="md-headline-lg emph mb-4">{t('admin')}</h1>
      <M3eFilterChipSet className="mb-6" onChange={(e: Event) => { const v = (e.target as any)?.value as Tab | undefined; if (v) setParams({ tab: v }); }}>
        {tabs.map(([k, label, icon]) => <M3eFilterChip key={k} value={k} selected={tab === k || undefined}><m3e-icon variant="rounded" slot="icon" name={icon} />{label}</M3eFilterChip>)}
      </M3eFilterChipSet>
      {tab === 'overview' && <Overview />}
      {tab === 'upload' && <UploadTab />}
      {tab === 'import' && <ImportTab />}
      {tab === 'tracks' && <TracksTab />}
      {tab === 'users' && <UsersTab />}
    </div>
  );
}

function Overview() {
  const t = useT();
  const toast = useUI((s) => s.toast);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['admin', 'stats'], queryFn: () => api.get<AdminStats>('/api/admin/stats') });
  const { data: caps } = useQuery({ queryKey: ['admin', 'caps'], queryFn: () => api.get<Capabilities>('/api/admin/import/capabilities') });
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<any>, ok: string) => { setBusy(key); try { await fn(); toast(ok, 'success'); qc.invalidateQueries({ queryKey: ['admin'] }); qc.invalidateQueries({ queryKey: ['home'] }); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); } };
  if (!data) return null;
  const cells: Array<[string, string | number]> = [[t('tracks'), fmtNumber(data.tracks)], [t('albums'), fmtNumber(data.albums)], [t('artists'), fmtNumber(data.artists)], [t('playlists'), fmtNumber(data.playlists)], [t('users'), fmtNumber(data.users)], [t('history'), fmtNumber(data.plays)], [t('storage'), fmtBytes(data.storageBytes)], [t('withLyrics'), `${data.withLyrics} / ${data.tracks}`], [t('withCanvas'), `${data.withCanvas} / ${data.tracks}`]];
  return (
    <div className="fade-in">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {cells.map(([k, v]) => <div key={k} className="surface-low rounded-[24px] p-4"><div className="md-label-md muted uppercase">{k}</div><div className="md-headline-md emph mt-1">{v}</div></div>)}
      </div>
      <div className="flex flex-wrap gap-2">
        <M3eButton variant="tonal" disabled={!!busy || undefined} onClick={() => run('scan', () => api.post('/api/admin/scan', {}), t('imported'))}><m3e-icon variant="rounded" slot="icon" name={busy === 'scan' ? 'hourglass_empty' : 'folder_open'} />{t('scan')}</M3eButton>
        <M3eButton variant="tonal" disabled={!!busy || undefined} onClick={() => run('lyrics', () => api.post('/api/admin/lyrics/fetch-missing', {}), 'Задача запущена: см. вкладку «Импорт по ссылке»')}><m3e-icon variant="rounded" slot="icon" name="stars" />Найти тексты для всех треков (LRCLIB)</M3eButton>
        <M3eButton variant="tonal" disabled={!!busy || undefined} onClick={() => run('reindex', () => api.post('/api/admin/reindex', {}), t('saved'))}><m3e-icon variant="rounded" slot="icon" name="refresh" />{t('reindex')}</M3eButton>
      </div>
      <p className="md-body-sm muted mt-3">{t('scanHint')}{caps?.musicDir ? `: ${caps.musicDir}` : ' (MUSIC_DIR не задан)'}</p>
      {caps && (
        <div className="surface-low rounded-[24px] p-4 mt-6 md-body-md space-y-1">
          <div className="md-title-md emph mb-2">Окружение сервера</div>
          <div>Файлы медиатеки: <code className="text-primary">{caps.mediaDir}</code></div>
          <div className="flex items-center gap-2">yt-dlp: {caps.ytdlp ? <span className="text-tertiary inline-flex items-center gap-1"><m3e-icon variant="rounded" name="check_circle" style={{ ['--m3e-icon-size' as any]: '16px' }} />{caps.ytdlpVersion}</span> : <span className="text-error inline-flex items-center gap-1"><m3e-icon variant="rounded" name="cancel" style={{ ['--m3e-icon-size' as any]: '16px' }} />не установлен — импорт по ссылке недоступен</span>}</div>
          <div className="flex items-center gap-2">ffmpeg: {caps.ffmpeg ? <span className="text-tertiary inline-flex items-center gap-1"><m3e-icon variant="rounded" name="check_circle" style={{ ['--m3e-icon-size' as any]: '16px' }} />есть</span> : <span className="text-error inline-flex items-center gap-1"><m3e-icon variant="rounded" name="cancel" style={{ ['--m3e-icon-size' as any]: '16px' }} />нет — аудио сохраняется в исходном контейнере без перекодирования</span>}</div>
          {caps.sources && (
            <div className="pt-2">
              <div className="md-label-lg muted mb-1">Источники аудио для каталога (по приоритету)</div>
              <div className="flex flex-wrap gap-2">
                {caps.sources.map((s) => <span key={s.name} className={`px-3 py-1 rounded-full md-label-md ${!s.enabled ? 'bg-surface-container-highest muted' : s.ok ? 'bg-tertiary-container text-on-tertiary-container' : 'bg-error-container text-on-error-container'}`} title={s.reason}>{s.label}{!s.enabled ? ' · выкл' : s.ok ? '' : ` · ${s.reason}`}</span>)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function UploadTab() {
  const t = useT();
  const toast = useUI((s) => s.toast);
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [meta, setMeta] = useState({ artist: '', album: '', genre: '', year: '' });
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [drag, setDrag] = useState(false);
  const add = (list: FileList | null) => { if (!list) return; setFiles((f) => [...f, ...Array.from(list).filter((x) => /\.(mp3|flac|m4a|aac|ogg|oga|opus|wav|wma|aiff?|webm)$/i.test(x.name))]); };
  const upload = async () => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(meta)) if (v.trim()) fd.append(k, v.trim());
    files.forEach((f) => fd.append('files', f, f.name));
    setProgress(0);
    try {
      const r = await api.upload<UploadResult>('/api/admin/upload', fd, setProgress);
      setResult(r); setFiles([]);
      toast(`${t('imported')}: ${r.imported.length}`, 'success');
      qc.invalidateQueries();
    } catch (e: any) { toast(e.message, 'error'); } finally { setProgress(null); }
  };
  return (
    <div className="fade-in max-w-3xl">
      <div className={`rounded-[28px] border-2 border-dashed p-10 text-center cursor-pointer spring ${drag ? 'bg-primary-container border-primary' : 'border-outline-variant surface-low'}`} onClick={() => inputRef.current?.click()} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}>
        <m3e-icon variant="rounded" name="upload" style={{ ['--m3e-icon-size' as any]: '40px', color: 'var(--md-sys-color-primary)' }} />
        <p className="md-title-md mt-2">{t('dropHere')}</p>
        <p className="md-body-sm muted mt-1">{t('supported')}. Теги, обложки и встроенные тексты подхватываются автоматически; рядом с файлом можно положить .lrc и cover.jpg.</p>
        <input ref={inputRef} type="file" multiple accept="audio/*,.flac,.m4a,.opus,.ogg,.wav" hidden onChange={(e) => add(e.target.files)} />
      </div>
      <div className="grid sm:grid-cols-4 gap-3 mt-4">
        {(['artist', 'album', 'genre', 'year'] as const).map((k) => <M3eFormField key={k} variant="outlined" className="w-full block"><span slot="label">{k === 'artist' ? t('artist') : k === 'album' ? t('album') : k === 'genre' ? t('genre') : t('year')}</span><input value={meta[k]} onChange={(e) => setMeta({ ...meta, [k]: e.target.value })} /><span slot="hint">если нет тегов</span></M3eFormField>)}
      </div>
      {files.length > 0 && (
        <div className="surface-low rounded-[20px] mt-4 p-3 max-h-64 overflow-y-auto md-body-md">
          {files.map((f, i) => <div key={i} className="flex items-center justify-between py-1 border-b border-outline-variant last:border-0"><span className="line-1">{f.name}</span><span className="muted ml-3 shrink-0 flex items-center gap-2">{fmtBytes(f.size)}<M3eIconButton size="extra-small" onClick={() => setFiles(files.filter((_, j) => j !== i))}><m3e-icon variant="rounded" name="close" /></M3eIconButton></span></div>)}
        </div>
      )}
      <div className="flex items-center gap-3 mt-4">
        <M3eButton variant="filled" disabled={!files.length || progress !== null || undefined} onClick={upload}><m3e-icon variant="rounded" slot="icon" name={progress !== null ? 'hourglass_empty' : 'upload'} />{t('upload')} ({files.length})</M3eButton>
        {progress !== null && <M3eLinearProgressIndicator className="flex-1" variant="wavy" value={progress} max={100} />}
      </div>
      {result && (
        <div className="mt-6 space-y-3">
          {result.imported.length > 0 && <div><h3 className="md-title-md emph mb-2">{t('imported')}: {result.imported.length}</h3>{result.imported.map((tr) => <TrackRowAdmin key={tr.id} track={tr} />)}</div>}
          {result.skipped.length > 0 && <div><h3 className="md-title-md emph mb-2 text-error">{t('skipped')}: {result.skipped.length}</h3>{result.skipped.map((s, i) => <div key={i} className="md-body-sm muted">{s.file} — {s.reason}</div>)}</div>}
        </div>
      )}
    </div>
  );
}

function ImportTab() {
  const toast = useUI((s) => s.toast);
  const qc = useQueryClient();
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState<'audio' | 'video'>('audio');
  const [meta, setMeta] = useState({ artist: '', album: '', genre: '' });
  const { data: caps } = useQuery({ queryKey: ['admin', 'caps'], queryFn: () => api.get<Capabilities>('/api/admin/import/capabilities') });
  const { data: jobs } = useQuery({ queryKey: ['admin', 'jobs'], queryFn: () => api.get<ImportJob[]>('/api/admin/import/jobs'), refetchInterval: (q) => ((q.state.data ?? []).some((j) => j.status === 'queued' || j.status === 'running') ? 1500 : 10000) });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/api/admin/import/url', { url: url.trim(), mode, ...Object.fromEntries(Object.entries(meta).filter(([, v]) => v.trim())) });
      setUrl(''); toast('Задача добавлена', 'success'); qc.invalidateQueries({ queryKey: ['admin', 'jobs'] });
    } catch (err: any) { toast(err.message, 'error'); }
  };
  return (
    <div className="fade-in max-w-3xl">
      <form onSubmit={submit} className="surface-low rounded-[28px] p-5 space-y-4">
        <div className="flex items-center gap-2 md-title-md emph"><m3e-icon variant="rounded" name="link" />YouTube · SoundCloud · Bandcamp · прямые ссылки</div>
        <p className="md-body-md muted">Вставьте ссылку на трек, видео или плейлист. Импорт делает yt-dlp на сервере: аудио попадает в библиотеку (обложка, название и исполнитель берутся из метаданных), а в режиме «видео» файл сохраняется в mp4 для скачивания. Загружайте только то, на что у вас есть права.</p>
        {caps && !caps.ytdlp && <p className="md-body-md text-error">yt-dlp не найден на сервере. Установите: <code>pip install yt-dlp</code> (или используйте Docker-образ AVRmusic, там он уже есть).</p>}
        <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-start">
          <M3eFormField variant="outlined" className="w-full block"><span slot="label">URL</span><input value={url} onChange={(e) => setUrl(e.target.value)} required placeholder="https://www.youtube.com/watch?v=… или https://soundcloud.com/…" /></M3eFormField>
          <M3eFormField variant="outlined" className="block"><span slot="label">Режим</span><M3eSelect onChange={(e: Event) => setMode(((e.target as any).value ?? 'audio') as any)}><M3eOption value="audio" selected={mode === 'audio' || undefined}>Аудио</M3eOption><M3eOption value="video" selected={mode === 'video' || undefined}>Видео (mp4)</M3eOption></M3eSelect></M3eFormField>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <M3eFormField variant="outlined" className="w-full block"><span slot="label">Исполнитель (необязательно)</span><input value={meta.artist} onChange={(e) => setMeta({ ...meta, artist: e.target.value })} /></M3eFormField>
          <M3eFormField variant="outlined" className="w-full block"><span slot="label">Альбом (необязательно)</span><input value={meta.album} onChange={(e) => setMeta({ ...meta, album: e.target.value })} /></M3eFormField>
          <M3eFormField variant="outlined" className="w-full block"><span slot="label">Жанр (необязательно)</span><input value={meta.genre} onChange={(e) => setMeta({ ...meta, genre: e.target.value })} /></M3eFormField>
        </div>
        <M3eButton variant="filled" type="submit" disabled={!url.trim() || (caps ? !caps.ytdlp : false) || undefined}><m3e-icon variant="rounded" slot="icon" name="cloud_download" />Импортировать</M3eButton>
      </form>

      <h2 className="md-title-lg emph mt-8 mb-3">Задачи</h2>
      <div className="space-y-3">
        {(jobs ?? []).map((j) => <JobCard key={j.id} job={j} />)}
        {!jobs?.length && <p className="muted md-body-md">Пока пусто.</p>}
      </div>
    </div>
  );
}

function JobCard({ job }: { job: ImportJob }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const color = job.status === 'done' ? 'var(--md-sys-color-tertiary)' : job.status === 'error' ? 'var(--md-sys-color-error)' : 'var(--md-sys-color-primary)';
  return (
    <div className="surface-low rounded-[20px] p-4">
      <div className="flex items-center gap-3">
        <m3e-icon variant="rounded" name={job.status === 'done' ? 'check_circle' : job.status === 'error' ? 'error' : 'hourglass_empty'} filled style={{ color }} />
        <div className="min-w-0 flex-1">
          <div className="md-title-sm line-1">{job.kind === 'lyrics' ? 'Поиск текстов (LRCLIB)' : job.kind === 'acquire' ? job.title : job.url}</div>
          <div className="md-body-sm muted">{job.kind === 'url' ? (job.mode === 'video' ? 'видео' : 'аудио') + ' · ' : ''}{new Date(job.createdAt).toLocaleString()}{job.stats ? ` · ${JSON.stringify(job.stats).replace(/[{}"]/g, '').replace(/,/g, ', ')}` : ''}{job.imported.length ? ` · импортировано: ${job.imported.length}` : ''}</div>
        </div>
        <M3eButton variant="text" onClick={() => setOpen(!open)}>лог</M3eButton>
        {(job.status === 'done' || job.status === 'error') && <M3eIconButton size="small" onClick={async () => { await api.del(`/api/admin/import/jobs/${job.id}`); qc.invalidateQueries({ queryKey: ['admin', 'jobs'] }); }}><m3e-icon variant="rounded" name="delete" /></M3eIconButton>}
      </div>
      {(job.status === 'running' || job.status === 'queued') && <M3eLinearProgressIndicator className="mt-3" variant="wavy" mode={job.status === 'queued' ? 'indeterminate' : 'determinate'} value={job.progress} max={100} />}
      {job.error && <p className="md-body-sm text-error mt-2">{job.error}</p>}
      {open && <pre className="mt-3 md-body-sm muted surface-highest rounded-[12px] p-3 max-h-48 overflow-auto whitespace-pre-wrap">{job.log.slice(-40).join('\n') || '—'}</pre>}
      {job.imported.length > 0 && <div className="mt-3 space-y-1">{job.imported.slice(0, 20).map((tr) => <TrackRowAdmin key={tr.id} track={tr} />)}</div>}
    </div>
  );
}

function TrackRowAdmin({ track, onDelete }: { track: Track; onDelete?: () => void }) {
  return (
    <div className="flex items-center gap-3 p-2 rounded-[20px] state-layer md-body-md">
      <Cover src={track.coverUrl} className="w-11 h-11 !rounded-[12px]" />
      <div className="min-w-0 flex-1">
        <div className="md-title-sm line-1">{track.title}</div>
        <div className="muted line-1 md-body-sm">{track.artist.name}{track.album ? ` · ${track.album.title}` : ''} · {fmtMs(track.durationMs)} · {track.codec ?? track.mimeType}{track.bitrate ? ` · ${Math.round(track.bitrate / 1000)} kbps` : ''}</div>
      </div>
      <div className="flex items-center gap-1 muted">
        {track.hasSyncedLyrics ? <m3e-icon variant="rounded" name="lyrics" filled style={{ color: 'var(--md-sys-color-tertiary)', ['--m3e-icon-size' as any]: '16px' }} /> : track.hasLyrics ? <m3e-icon variant="rounded" name="lyrics" style={{ ['--m3e-icon-size' as any]: '16px' }} /> : null}
        {track.hasCanvas && <m3e-icon variant="rounded" name="movie" style={{ color: 'var(--md-sys-color-primary)', ['--m3e-icon-size' as any]: '16px' }} />}
      </div>
      <Link to={`/admin/track/${track.id}`}><M3eIconButton size="small"><m3e-icon variant="rounded" name="edit" /></M3eIconButton></Link>
      {onDelete && <M3eIconButton size="small" onClick={onDelete}><m3e-icon variant="rounded" name="delete" style={{ color: 'var(--md-sys-color-error)' }} /></M3eIconButton>}
    </div>
  );
}

function TracksTab() {
  const t = useT();
  const toast = useUI((s) => s.toast);
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 250);
  const [offset, setOffset] = useState(0);
  const { data } = useQuery({ queryKey: ['admin', 'tracks', dq, offset], queryFn: () => api.get<{ items: Track[]; total: number }>(`/api/admin/tracks?q=${encodeURIComponent(dq)}&limit=50&offset=${offset}`), placeholderData: (p) => p });
  useEffect(() => setOffset(0), [dq]);
  const del = async (tr: Track) => {
    if (!confirm(`${t('deleteTrack')}: ${tr.title}?`)) return;
    await api.del(`/api/admin/tracks/${tr.id}`);
    toast(t('removed')); qc.invalidateQueries({ queryKey: ['admin'] });
  };
  return (
    <div className="fade-in">
      <M3eFormField variant="outlined" className="block max-w-md mb-4"><span slot="label">{t('searchPlaceholder')}</span><input value={q} onChange={(e) => setQ(e.target.value)} /></M3eFormField>
      <div className="space-y-0.5">{(data?.items ?? []).map((tr) => <TrackRowAdmin key={tr.id} track={tr} onDelete={() => del(tr)} />)}</div>
      {data && data.total > 50 && (
        <div className="flex items-center gap-2 mt-4 md-body-md">
          <M3eIconButton variant="tonal" disabled={offset === 0 || undefined} onClick={() => setOffset(Math.max(0, offset - 50))}><m3e-icon variant="rounded" name="chevron_left" /></M3eIconButton>
          <span className="muted">{offset + 1}–{Math.min(offset + 50, data.total)} / {data.total}</span>
          <M3eIconButton variant="tonal" disabled={offset + 50 >= data.total || undefined} onClick={() => setOffset(offset + 50)}><m3e-icon variant="rounded" name="chevron_right" /></M3eIconButton>
        </div>
      )}
    </div>
  );
}

/** One-time invite codes: the only way to register after the first (admin) account. */
function InvitesSection() {
  const t = useT();
  const toast = useUI((s) => s.toast);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['admin', 'invites'], queryFn: () => api.get<Invite[]>('/api/admin/invites') });
  const [busy, setBusy] = useState(false);
  const link = (code: string) => `${location.origin}/register?invite=${code}`;
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast(`${t('copied')}: ${text}`, 'success'); }
    catch { window.prompt(t('copyCode'), text); }
  };
  const create = async () => {
    setBusy(true);
    try { const inv = await api.post<Invite>('/api/admin/invites', {}); qc.invalidateQueries({ queryKey: ['admin', 'invites'] }); await copy(link(inv.code)); }
    catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const remove = async (code: string) => {
    try { await api.del(`/api/admin/invites/${code}`); qc.invalidateQueries({ queryKey: ['admin', 'invites'] }); } catch (e: any) { toast(e.message, 'error'); }
  };
  const status = (i: Invite): 'used' | 'expired' | 'active' => (i.usedBy ? 'used' : i.expiresAt && i.expiresAt < new Date().toISOString() ? 'expired' : 'active');
  return (
    <section className="surface-low rounded-[28px] p-4 md:p-5 mb-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0"><h2 className="md-title-lg emph">{t('invites')}</h2><p className="md-body-sm muted mt-1">{t('inviteHint')}</p></div>
        <M3eButton variant="filled" disabled={busy || undefined} onClick={create}><m3e-icon variant="rounded" slot="icon" name="person_add" />{t('newInvite')}</M3eButton>
      </div>
      <div className="mt-3 space-y-1">
        {(data ?? []).length === 0 && <p className="md-body-md muted px-2">{t('noInvites')}</p>}
        {(data ?? []).map((i) => {
          const st = status(i);
          return (
            <div key={i.code} className={`flex items-center gap-3 p-2 rounded-[20px] ${st === 'active' ? 'state-layer' : 'opacity-60'}`}>
              <span className={`w-10 h-10 rounded-[14px] flex items-center justify-center shrink-0 ${st === 'active' ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container-highest'}`}>
                <m3e-icon variant="rounded" name={st === 'used' ? 'how_to_reg' : st === 'expired' ? 'timer_off' : 'key'} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="md-title-md font-mono tracking-wider">{i.code}</div>
                <div className="md-body-sm muted line-1">
                  {st === 'used' && i.usedBy ? `${t('used')}: @${i.usedBy.username}` : st === 'expired' ? t('expired') : t('active')}{i.note ? ` · ${i.note}` : ''} · {new Date(i.createdAt).toLocaleDateString()}
                </div>
              </div>
              {st === 'active' && (
                <>
                  <M3eIconButton size="small" aria-label={t('copyCode')} title={t('copyCode')} onClick={() => copy(i.code)}><m3e-icon variant="rounded" name="content_copy" /></M3eIconButton>
                  <M3eIconButton size="small" aria-label={t('copyInviteLink')} title={t('copyInviteLink')} onClick={() => copy(link(i.code))}><m3e-icon variant="rounded" name="link" /></M3eIconButton>
                </>
              )}
              <M3eIconButton size="small" aria-label={t('deleteCode')} title={t('deleteCode')} onClick={() => remove(i.code)}><m3e-icon variant="rounded" name="delete" style={{ color: 'var(--md-sys-color-error)' }} /></M3eIconButton>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function UsersTab() {
  const t = useT();
  const toast = useUI((s) => s.toast);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['admin', 'users'], queryFn: () => api.get<User[]>('/api/admin/users') });
  const setRole = async (u: User, role: 'admin' | 'user') => { try { await api.patch(`/api/admin/users/${u.id}`, { role }); qc.invalidateQueries({ queryKey: ['admin', 'users'] }); } catch (e: any) { toast(e.message, 'error'); } };
  return (
    <div className="fade-in max-w-3xl space-y-1">
      <InvitesSection />
      <h2 className="md-title-lg emph px-2 pb-2">{t('users')}</h2>
      {(data ?? []).map((u) => (
        <div key={u.id} className="flex items-center gap-3 p-2 rounded-[20px] state-layer">
          <Cover src={u.avatarUrl} round kind="artist" className="w-11 h-11" />
          <div className="min-w-0 flex-1"><div className="md-title-sm">{u.displayName} <span className="muted">@{u.username}</span></div><div className="md-body-sm muted">{u.email}</div></div>
          <M3eButton variant={u.role === 'admin' ? 'filled' : 'outlined'} size="small" onClick={() => setRole(u, u.role === 'admin' ? 'user' : 'admin')}><m3e-icon variant="rounded" slot="icon" name="shield" />{u.role}</M3eButton>
          <M3eIconButton size="small" onClick={async () => { if (!confirm(t('confirmDelete'))) return; try { await api.del(`/api/admin/users/${u.id}`); qc.invalidateQueries({ queryKey: ['admin', 'users'] }); } catch (e: any) { toast(e.message, 'error'); } }}><m3e-icon variant="rounded" name="delete" style={{ color: 'var(--md-sys-color-error)' }} /></M3eIconButton>
        </div>
      ))}
    </div>
  );
}
