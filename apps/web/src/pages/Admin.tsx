import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminActivity, AdminStats, AdminUserDetail, AdminUserRow, Invite, NewsItem, Track, UploadResult } from '@avrmusic/shared';
import { Modal } from '@/components/Modal';
import { M3eButton, M3eFilterChip, M3eFilterChipSet, M3eFormField, M3eIconButton, M3eOption, M3eSelect } from '@/md';
import { WavyProgress } from '@/components/WavyProgress';
import { api } from '@/lib/api';
import { useUI } from '@/stores/ui';
import { useT } from '@/lib/i18n';
import { fmtBytes, fmtDurationLong, fmtMs, fmtNumber } from '@/lib/format';
import { Cover } from '@/components/Cover';
import { useDebounced } from '@/lib/hooks';

type Tab = 'overview' | 'upload' | 'import' | 'tracks' | 'users';

export interface ImportJob { id: string; kind: 'url' | 'lyrics' | 'acquire' | 'canvas'; url?: string; mode?: 'audio' | 'video'; title?: string; status: 'queued' | 'running' | 'done' | 'error'; progress: number; log: string[]; imported: Track[]; error?: string; createdAt: string; stats?: Record<string, number> }
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
      {tab === 'overview' && <><NewsSection /><Overview /><ActivitySection /></>}
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
        <M3eButton variant="tonal" disabled={!!busy || undefined} onClick={() => run('canvas', () => api.post('/api/admin/canvas/fetch-missing', {}), 'Задача запущена: см. вкладку «Импорт по ссылке»')}><m3e-icon variant="rounded" slot="icon" name="movie" />{t('findCanvasAll')}</M3eButton>
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
        {progress !== null && <WavyProgress className="flex-1" value={progress} />}
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
          <div className="md-title-sm line-1">{job.kind === 'lyrics' ? 'Поиск текстов (LRCLIB)' : job.kind === 'acquire' || job.kind === 'canvas' ? job.title : job.url}</div>
          <div className="md-body-sm muted">{job.kind === 'url' ? (job.mode === 'video' ? 'видео' : 'аудио') + ' · ' : ''}{new Date(job.createdAt).toLocaleString()}{job.stats ? ` · ${JSON.stringify(job.stats).replace(/[{}"]/g, '').replace(/,/g, ', ')}` : ''}{job.imported.length ? ` · импортировано: ${job.imported.length}` : ''}</div>
        </div>
        <M3eButton variant="text" onClick={() => setOpen(!open)}>лог</M3eButton>
        {(job.status === 'done' || job.status === 'error') && <M3eIconButton size="small" onClick={async () => { await api.del(`/api/admin/import/jobs/${job.id}`); qc.invalidateQueries({ queryKey: ['admin', 'jobs'] }); }}><m3e-icon variant="rounded" name="delete" /></M3eIconButton>}
      </div>
      {(job.status === 'running' || job.status === 'queued') && <WavyProgress className="mt-3" indeterminate={job.status === 'queued'} value={job.progress} />}
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

/** YouTube cookies for yt-dlp: uploaded as a file, kept only on the server, never shown back. */
interface YtAccount {
  id: string; label: string; createdAt: string; updatedAt: string; cookies: number; loggedIn: boolean;
  busy: boolean; coolingUntil: string | null; ok: number; failed: number; lastError: string | null; lastUsedAt: string | null;
}

/** YouTube accounts for downloads: each one fetches its own track at the same time as the others. */
function YoutubeAccountsSection() {
  const toast = useUI((s) => s.toast);
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ['admin', 'yt-accounts'], queryFn: () => api.get<YtAccount[]>('/api/admin/youtube-accounts'), refetchInterval: 5000 });
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'yt-accounts'] });
  const act = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try { await fn(); refresh(); toast(done, 'success'); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const upload = (file: File | undefined) => {
    if (!file) return;
    const form = new FormData();
    if (label.trim()) form.append('label', label.trim());
    form.append('file', file);
    void act(() => api.upload('/api/admin/youtube-accounts', form), 'Аккаунт добавлен — загрузки пойдут параллельно').then(() => setLabel(''));
  };
  return (
    <div className="surface-low rounded-[24px] p-4 mt-6">
      <h2 className="md-title-lg emph">Аккаунты YouTube · {data.length}</h2>
      <p className="md-body-sm muted mt-1">
        Каждый аккаунт качает свой трек одновременно с остальными: 3 аккаунта — 3 трека сразу. Если YouTube откажет
        аккаунту («not a bot», 429), он отдохнёт 20 минут, а загрузка перейдёт на следующий. Файл cookies.txt
        (формат Netscape) из отдельного Google-аккаунта; хранится только на сервере и назад не показывается.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {data.map((a) => {
          const state = a.busy ? 'качает' : a.coolingUntil ? `отдыхает до ${new Date(a.coolingUntil).toLocaleTimeString()}` : 'свободен';
          return (
            <div key={a.id} className="surface rounded-[18px] px-4 py-3 flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="md-title-sm">{a.label} <span className={`md-label-md ${a.coolingUntil ? 'text-error' : a.busy ? 'text-primary' : 'muted'}`}>· {state}</span></div>
                <div className="md-body-sm muted">
                  {a.cookies} cookies{a.loggedIn ? ', вход есть' : ' — входа в аккаунт нет'} · скачано {a.ok}, ошибок {a.failed}
                  {a.lastUsedAt ? ` · последний раз ${new Date(a.lastUsedAt).toLocaleString()}` : ''}
                </div>
                {a.lastError && <div className="md-body-sm text-error truncate" title={a.lastError}>{a.lastError}</div>}
              </div>
              {a.coolingUntil && <M3eButton variant="tonal" disabled={busy || undefined} onClick={() => act(() => api.post(`/api/admin/youtube-accounts/${a.id}/wake`), 'Аккаунт снова в работе')}>Вернуть в работу</M3eButton>}
              <M3eButton variant="text" disabled={busy || undefined} onClick={() => act(() => api.del(`/api/admin/youtube-accounts/${a.id}`), 'Аккаунт удалён')}>Удалить</M3eButton>
            </div>
          );
        })}
        {!data.length && <p className="md-body-sm muted">Аккаунтов нет: загрузки идут без входа, по 2 одновременно.</p>}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Название (необязательно)"
          className="h-10 px-4 rounded-full surface md-body-md outline-none min-w-0 flex-1 max-w-xs"
        />
        <label className={`inline-flex items-center gap-2 px-4 h-10 rounded-full bg-primary text-on-primary md-label-lg cursor-pointer ${busy ? 'opacity-60 pointer-events-none' : ''}`}>
          <m3e-icon variant="rounded" name="upload_file" />Добавить cookies.txt
          <input type="file" accept=".txt,text/plain" className="hidden" onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
      </div>
    </div>
  );
}

/** News to everyone: shown on top of the app and sent as a notification on Android. */
function NewsSection() {
  const t = useT();
  const toast = useUI((s) => s.toast);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['news'], queryFn: () => api.get<NewsItem[]>('/api/news') });
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const publish = async () => {
    setBusy(true);
    try { await api.post('/api/admin/news', { title, body }); setTitle(''); setBody(''); qc.invalidateQueries({ queryKey: ['news'] }); toast(t('published'), 'success'); }
    catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    try { await api.del(`/api/admin/news/${id}`); qc.invalidateQueries({ queryKey: ['news'] }); } catch (e: any) { toast(e.message, 'error'); }
  };
  return (
    <section className="surface-low rounded-[28px] p-4 md:p-5 mb-6">
      <h2 className="md-title-lg emph">{t('news')}</h2>
      <p className="md-body-sm muted mt-1">{t('newsHint')}</p>
      <div className="mt-3 flex flex-col gap-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} placeholder={t('newsTitle')} className="h-11 px-4 rounded-full surface md-body-md outline-none" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} rows={3} placeholder={t('newsBody')} className="px-4 py-3 rounded-[20px] surface md-body-md outline-none resize-y" />
        <div><M3eButton variant="filled" disabled={busy || !title.trim() || undefined} onClick={publish}><m3e-icon variant="rounded" slot="icon" name="campaign" />{t('publish')}</M3eButton></div>
      </div>
      <div className="mt-4 space-y-2">
        {(data ?? []).length === 0 && <p className="md-body-md muted px-1">{t('noNews')}</p>}
        {(data ?? []).map((n) => (
          <div key={n.id} className="surface rounded-[20px] px-4 py-3 flex gap-3 items-start">
            <div className="min-w-0 flex-1">
              <div className="md-title-sm">{n.title}</div>
              {n.body && <div className="md-body-sm muted whitespace-pre-line mt-0.5">{n.body}</div>}
              <div className="md-label-sm muted mt-1">{new Date(n.createdAt).toLocaleString()}{n.author ? ` · ${n.author}` : ''}</div>
            </div>
            <M3eIconButton aria-label="delete" onClick={() => remove(n.id)}><m3e-icon variant="rounded" name="delete" /></M3eIconButton>
          </div>
        ))}
      </div>
    </section>
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

/** Daily bars (last 30 days). */
function Bars({ data, unit }: { data: Array<{ day: string; value: number }>; unit: (v: number) => string }) {
  const days: Array<{ day: string; value: number }> = [];
  const byDay = new Map(data.map((d) => [d.day, d.value]));
  for (let i = 29; i >= 0; i--) { const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10); days.push({ day: d, value: byDay.get(d) ?? 0 }); }
  const max = Math.max(1, ...days.map((d) => d.value));
  return (
    <div className="flex items-end gap-[3px] h-28" role="img" aria-label="Активность за 30 дней">
      {days.map((d) => (
        <div key={d.day} className="flex-1 min-w-0 rounded-t-[6px] bg-primary/80 hover:bg-primary transition-colors" style={{ height: `${Math.max(3, (d.value / max) * 100)}%`, opacity: d.value ? 1 : 0.25 }} title={`${d.day}: ${unit(d.value)}`} />
      ))}
    </div>
  );
}

const ago = (iso: string | null) => {
  if (!iso) return 'ещё не заходил';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (m < 3) return 'сейчас онлайн';
  if (m < 60) return `${m} мин назад`;
  if (m < 1440) return `${Math.round(m / 60)} ч назад`;
  return `${Math.round(m / 1440)} дн назад`;
};

/** Listening across the service: per day, top tracks and artists, storage by source, queue health. */
function ActivitySection() {
  const { data } = useQuery({ queryKey: ['admin', 'activity'], queryFn: () => api.get<AdminActivity>('/api/admin/activity'), refetchInterval: 60_000 });
  if (!data) return null;
  return (
    <div className="grid gap-4 md:grid-cols-2 mt-6">
      <div className="surface-low rounded-[24px] p-4 md:col-span-2">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 mb-3">
          <h2 className="md-title-lg emph flex-1">Прослушивания за 30 дней</h2>
          <span className="md-body-md muted">активных за неделю: <b className="text-on-surface">{data.activeUsers7d}</b></span>
          <span className="md-body-md muted">задачи за сутки: <b className="text-on-surface">{data.jobs24h.done}</b> готово · <b className={data.jobs24h.error ? 'text-error' : 'text-on-surface'}>{data.jobs24h.error}</b> ошибок · <b className="text-on-surface">{data.jobs24h.queued + data.jobs24h.running}</b> в очереди</span>
        </div>
        <Bars data={data.daily.map((d) => ({ day: d.day, value: d.plays }))} unit={(v) => `${v} прослушиваний`} />
      </div>
      <div className="surface-low rounded-[24px] p-4">
        <h3 className="md-title-md emph mb-2">Топ треков (30 дней)</h3>
        {data.topTracks.map((t, i) => <div key={t.id} className="flex gap-2 md-body-md py-1"><span className="muted w-5 text-right">{i + 1}</span><span className="flex-1 min-w-0 line-1">{t.artist} — {t.title}</span><span className="muted">{t.plays}</span></div>)}
      </div>
      <div className="surface-low rounded-[24px] p-4">
        <h3 className="md-title-md emph mb-2">Топ исполнителей (30 дней)</h3>
        {data.topArtists.map((a, i) => <div key={a.id} className="flex gap-2 md-body-md py-1"><span className="muted w-5 text-right">{i + 1}</span><span className="flex-1 min-w-0 line-1">{a.name}</span><span className="muted">{a.plays}</span></div>)}
        <h3 className="md-title-md emph mt-4 mb-2">Откуда треки</h3>
        {data.sources.map((x) => <div key={x.source} className="flex gap-2 md-body-md py-0.5"><span className="flex-1">{x.source}</span><span className="muted">{x.tracks} · {fmtBytes(x.bytes)}</span></div>)}
      </div>
    </div>
  );
}

/** One user: activity, what they listen to, what they added and downloaded; management actions. */
function UserDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const toast = useUI((s) => s.toast);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['admin', 'user', id], queryFn: () => api.get<AdminUserDetail>(`/api/admin/users/${id}`) });
  const [password, setPassword] = useState<string | null>(null);
  const patch = async (body: Record<string, unknown>) => {
    try { await api.patch(`/api/admin/users/${id}`, body); qc.invalidateQueries({ queryKey: ['admin', 'users'] }); qc.invalidateQueries({ queryKey: ['admin', 'user', id] }); }
    catch (e: any) { toast(e.message, 'error'); }
  };
  const u = data?.user;
  const kinds: Record<string, string> = { file: 'файл', album: 'альбом', playlist: 'плейлист', offline: 'офлайн' };
  return (
    <Modal open onClose={onClose} title={u ? u.displayName : 'Пользователь'} width="max-w-3xl">
      {!data || !u ? <div className="h-40" /> : (
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <Cover src={u.avatarUrl} round kind="artist" className="w-14 h-14" />
            <div className="min-w-0 flex-1">
              <div className="md-title-md">@{u.username} <span className="muted">· {u.email}</span></div>
              <div className="md-body-sm muted">с {new Date(u.createdAt).toLocaleDateString()} · {ago(u.lastSeenAt)}{u.disabled ? ' · заблокирован' : ''}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {([['Прослушиваний', fmtNumber(u.plays)], ['Время', fmtDurationLong(u.msListened)], ['За 7 дней', fmtNumber(u.plays7d)], ['Лайков', fmtNumber(u.likes)], ['Добавил треков', fmtNumber(u.added)], ['Скачиваний', fmtNumber(u.downloads)], ['Скачано', fmtBytes(u.downloadBytes)], ['Плейлистов', fmtNumber(u.playlists)]] as Array<[string, string]>).map(([k, v]) => (
              <div key={k} className="surface-low rounded-[18px] p-3"><div className="md-label-sm muted uppercase">{k}</div><div className="md-title-lg emph">{v}</div></div>
            ))}
          </div>
          <div><div className="md-label-lg muted mb-2">Прослушивания по дням</div><Bars data={data.daily.map((d) => ({ day: d.day, value: d.plays }))} unit={(v) => `${v} прослушиваний`} /></div>
          <div className="grid md:grid-cols-2 gap-4">
            <div><div className="md-label-lg muted mb-1">Любимые исполнители</div>{data.topArtists.map((a) => <div key={a.id} className="flex md-body-md py-0.5"><span className="flex-1 line-1">{a.name}</span><span className="muted">{a.plays}</span></div>)}</div>
            <div><div className="md-label-lg muted mb-1">Любимые треки</div>{data.topTracks.map((t) => <div key={t.id} className="flex md-body-md py-0.5"><span className="flex-1 line-1">{t.artist} — {t.title}</span><span className="muted">{t.plays}</span></div>)}</div>
            <div><div className="md-label-lg muted mb-1">Недавно слушал</div>{data.recentPlays.slice(0, 12).map((p, i) => <div key={i} className="flex gap-2 md-body-sm py-0.5"><span className="flex-1 line-1">{p.artist} — {p.title}</span><span className="muted">{new Date(p.playedAt).toLocaleString()}</span></div>)}</div>
            <div>
              <div className="md-label-lg muted mb-1">Добавил на сервер {data.jobs.error ? <span className="text-error">· {data.jobs.error} ошибок загрузки</span> : null}</div>
              {data.added.length ? data.added.slice(0, 8).map((a) => <div key={a.trackId} className="md-body-sm py-0.5 line-1">{a.artist} — {a.title}</div>) : <div className="md-body-sm muted">ничего</div>}
              <div className="md-label-lg muted mt-3 mb-1">Скачивал</div>
              {data.downloads.length ? data.downloads.slice(0, 8).map((d, i) => <div key={i} className="flex gap-2 md-body-sm py-0.5"><span className="flex-1 line-1">{d.title ?? d.refId}</span><span className="muted">{kinds[d.kind] ?? d.kind}{d.bytes ? ` · ${fmtBytes(d.bytes)}` : ''}</span></div>) : <div className="md-body-sm muted">ничего</div>}
            </div>
          </div>
          {password && <div className="rounded-[18px] p-3 bg-tertiary-container text-on-tertiary-container md-body-md">Новый пароль: <b className="select-all font-mono">{password}</b> — передайте его пользователю, больше он не покажется.</div>}
          <div className="flex flex-wrap gap-2 pt-1">
            <M3eButton variant={u.role === 'admin' ? 'filled' : 'outlined'} onClick={() => void patch({ role: u.role === 'admin' ? 'user' : 'admin' })}><m3e-icon variant="rounded" slot="icon" name="shield" />{u.role === 'admin' ? 'Администратор' : 'Сделать администратором'}</M3eButton>
            <M3eButton variant={u.canAcquire ? 'tonal' : 'outlined'} onClick={() => void patch({ canAcquire: !u.canAcquire })}><m3e-icon variant="rounded" slot="icon" name={u.canAcquire ? 'cloud_download' : 'cloud_off'} />{u.canAcquire ? 'Может добавлять треки' : 'Добавление запрещено'}</M3eButton>
            <M3eButton variant="tonal" onClick={async () => { if (!confirm('Сбросить пароль? Пользователь выйдет со всех устройств.')) return; try { setPassword((await api.post<{ password: string }>(`/api/admin/users/${id}/reset-password`)).password); } catch (e: any) { toast(e.message, 'error'); } }}><m3e-icon variant="rounded" slot="icon" name="key" />Сбросить пароль</M3eButton>
            <M3eButton variant={u.disabled ? 'filled' : 'outlined'} onClick={() => void patch({ disabled: !u.disabled })}><m3e-icon variant="rounded" slot="icon" name={u.disabled ? 'lock_open' : 'block'} />{u.disabled ? 'Разблокировать' : 'Заблокировать'}</M3eButton>
            <M3eButton variant="text" onClick={async () => { if (!confirm('Удалить пользователя со всеми его лайками и плейлистами?')) return; try { await api.del(`/api/admin/users/${id}`); qc.invalidateQueries({ queryKey: ['admin', 'users'] }); onClose(); } catch (e: any) { toast(e.message, 'error'); } }}><m3e-icon variant="rounded" slot="icon" name="delete" style={{ color: 'var(--md-sys-color-error)' }} />Удалить</M3eButton>
          </div>
        </div>
      )}
    </Modal>
  );
}

function UsersTab() {
  const t = useT();
  const { data } = useQuery({ queryKey: ['admin', 'users'], queryFn: () => api.get<AdminUserRow[]>('/api/admin/users'), refetchInterval: 60_000 });
  const [open, setOpen] = useState<string | null>(null);
  const [sort, setSort] = useState<'seen' | 'plays' | 'added' | 'downloads'>('seen');
  const rows = [...(data ?? [])].sort((a, b) => sort === 'plays' ? b.plays - a.plays : sort === 'added' ? b.added - a.added : sort === 'downloads' ? b.downloads - a.downloads : (b.lastSeenAt ?? '').localeCompare(a.lastSeenAt ?? ''));
  return (
    <div className="fade-in max-w-4xl space-y-1">
      <InvitesSection />
      <YoutubeAccountsSection />
      <div className="flex flex-wrap items-center gap-2 px-2 pt-6 pb-2">
        <h2 className="md-title-lg emph flex-1">{t('users')} · {rows.length}</h2>
        {([['seen', 'Активность'], ['plays', 'Прослушивания'], ['added', 'Добавили'], ['downloads', 'Скачивания']] as const).map(([k, l]) => (
          <button key={k} className="wave-mode !bg-[var(--md-sys-color-surface-container-high)]" data-on={sort === k || undefined} onClick={() => setSort(k)}>{l}</button>
        ))}
      </div>
      {rows.map((u) => (
        <button key={u.id} onClick={() => setOpen(u.id)} className="w-full text-left flex items-center gap-3 p-2 rounded-[20px] state-layer">
          <Cover src={u.avatarUrl} round kind="artist" className="w-11 h-11" />
          <div className="min-w-0 flex-1">
            <div className="md-title-sm line-1">{u.displayName} <span className="muted">@{u.username}</span>{u.role === 'admin' && <m3e-icon variant="rounded" name="shield" style={{ fontSize: 16, verticalAlign: '-3px', marginLeft: 4, color: 'var(--md-sys-color-primary)' }} />}{u.disabled && <span className="text-error md-label-md ml-2">заблокирован</span>}{!u.canAcquire && <span className="muted md-label-md ml-2">без добавления</span>}</div>
            <div className="md-body-sm muted line-1">{ago(u.lastSeenAt)} · {fmtNumber(u.plays)} прослушиваний · {fmtDurationLong(u.msListened)} · добавил {u.added} · скачал {u.downloads}{u.downloadBytes ? ` (${fmtBytes(u.downloadBytes)})` : ''}</div>
          </div>
          <span className="hidden sm:block md-label-lg text-primary">{u.plays7d ? `+${u.plays7d} за неделю` : ''}</span>
          <m3e-icon variant="rounded" name="chevron_right" />
        </button>
      ))}
      {open && <UserDetail id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
