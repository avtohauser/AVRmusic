import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload, FolderSearch, Link2, Users, ListMusic, BarChart3, RefreshCw, Trash2, Pencil, Mic2, Clapperboard, CheckCircle2, XCircle, Loader2, Youtube, Sparkles } from 'lucide-react';
import type { AdminStats, Track, UploadResult, User } from '@avrmusic/shared';
import { api } from '@/lib/api';
import { useUI } from '@/stores/ui';
import { useT } from '@/lib/i18n';
import { fmtBytes, fmtMs, fmtNumber } from '@/lib/format';
import { Cover } from '@/components/Cover';
import { useDebounced } from '@/lib/hooks';

type Tab = 'overview' | 'upload' | 'import' | 'tracks' | 'users';

export interface ImportJob { id: string; kind: 'url' | 'lyrics'; url?: string; mode?: 'audio' | 'video'; status: 'queued' | 'running' | 'done' | 'error'; progress: number; log: string[]; imported: Track[]; error?: string; createdAt: string; stats?: { found: number; missing: number; checked: number } }
interface Capabilities { ytdlp: boolean; ytdlpVersion: string | null; ffmpeg: boolean; musicDir: string | null; mediaDir: string }

export default function Admin() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'overview';
  const t = useT();
  const tabs: Array<[Tab, string, React.ReactNode]> = [['overview', t('overview'), <BarChart3 size={16} />], ['upload', t('upload'), <Upload size={16} />], ['import', 'Импорт по ссылке', <Link2 size={16} />], ['tracks', t('manageTracks'), <ListMusic size={16} />], ['users', t('users'), <Users size={16} />]];
  return (
    <div className="page pt-4">
      <h1 className="text-2xl md:text-3xl font-extrabold mb-4">{t('admin')}</h1>
      <div className="flex gap-2 mb-6 overflow-x-auto no-scrollbar">
        {tabs.map(([k, label, icon]) => <button key={k} className="chip" data-active={tab === k} onClick={() => setParams({ tab: k })}>{icon}<span className="ml-1.5">{label}</span></button>)}
      </div>
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
        {cells.map(([k, v]) => <div key={k} className="card p-4"><div className="text-xs uppercase text-muted">{k}</div><div className="text-2xl font-extrabold mt-1">{v}</div></div>)}
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-outline" disabled={!!busy} onClick={() => run('scan', () => api.post('/api/admin/scan', {}), t('imported'))}>{busy === 'scan' ? <Loader2 size={16} className="animate-spin" /> : <FolderSearch size={16} />}{t('scan')}</button>
        <button className="btn btn-outline" disabled={!!busy} onClick={() => run('lyrics', () => api.post('/api/admin/lyrics/fetch-missing', {}), 'Задача запущена: см. вкладку «Импорт по ссылке»')}><Sparkles size={16} />Найти тексты для всех треков (LRCLIB)</button>
        <button className="btn btn-outline" disabled={!!busy} onClick={() => run('reindex', () => api.post('/api/admin/reindex', {}), t('saved'))}><RefreshCw size={16} />{t('reindex')}</button>
      </div>
      <p className="text-sm text-muted mt-3">{t('scanHint')}{caps?.musicDir ? `: ${caps.musicDir}` : ' (MUSIC_DIR не задан)'}</p>
      {caps && (
        <div className="card p-4 mt-6 text-sm space-y-1">
          <div className="font-semibold mb-2">Окружение сервера</div>
          <div>Файлы медиатеки: <code className="text-accent-2">{caps.mediaDir}</code></div>
          <div className="flex items-center gap-2">yt-dlp: {caps.ytdlp ? <span className="text-emerald-400 inline-flex items-center gap-1"><CheckCircle2 size={14} />{caps.ytdlpVersion}</span> : <span className="text-amber-400 inline-flex items-center gap-1"><XCircle size={14} />не установлен — импорт по ссылке недоступен</span>}</div>
          <div className="flex items-center gap-2">ffmpeg: {caps.ffmpeg ? <span className="text-emerald-400 inline-flex items-center gap-1"><CheckCircle2 size={14} />есть</span> : <span className="text-amber-400 inline-flex items-center gap-1"><XCircle size={14} />нет — аудио сохраняется в исходном контейнере без перекодирования</span>}</div>
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
      <div className={`card border-dashed p-10 text-center cursor-pointer transition-colors ${drag ? 'bg-surface-2 border-accent' : ''}`} onClick={() => inputRef.current?.click()} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}>
        <Upload size={36} className="mx-auto text-muted mb-3" />
        <p className="font-semibold">{t('dropHere')}</p>
        <p className="text-sm text-muted mt-1">{t('supported')}. Теги, обложки и встроенные тексты подхватываются автоматически; рядом с файлом можно положить .lrc и cover.jpg.</p>
        <input ref={inputRef} type="file" multiple accept="audio/*,.flac,.m4a,.opus,.ogg,.wav" hidden onChange={(e) => add(e.target.files)} />
      </div>
      <div className="grid sm:grid-cols-4 gap-3 mt-4">
        {(['artist', 'album', 'genre', 'year'] as const).map((k) => <div key={k}><label className="label">{k === 'artist' ? t('artist') : k === 'album' ? t('album') : k === 'genre' ? t('genre') : t('year')} <span className="opacity-60">(если нет тегов)</span></label><input className="input" value={meta[k]} onChange={(e) => setMeta({ ...meta, [k]: e.target.value })} /></div>)}
      </div>
      {files.length > 0 && (
        <div className="card mt-4 p-3 max-h-64 overflow-y-auto text-sm">
          {files.map((f, i) => <div key={i} className="flex items-center justify-between py-1 border-b border-line last:border-0"><span className="line-clamp-1">{f.name}</span><span className="text-muted ml-3 shrink-0">{fmtBytes(f.size)}<button className="ml-3 text-red-400" onClick={() => setFiles(files.filter((_, j) => j !== i))}>✕</button></span></div>)}
        </div>
      )}
      <div className="flex items-center gap-3 mt-4">
        <button className="btn btn-accent" disabled={!files.length || progress !== null} onClick={upload}>{progress !== null ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}{t('upload')} ({files.length})</button>
        {progress !== null && <div className="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden"><div className="h-full accent-gradient transition-[width]" style={{ width: `${progress}%` }} /></div>}
      </div>
      {result && (
        <div className="mt-6 space-y-3">
          {result.imported.length > 0 && <div><h3 className="font-bold mb-2">{t('imported')}: {result.imported.length}</h3>{result.imported.map((tr) => <TrackRowAdmin key={tr.id} track={tr} />)}</div>}
          {result.skipped.length > 0 && <div><h3 className="font-bold mb-2 text-amber-400">{t('skipped')}: {result.skipped.length}</h3>{result.skipped.map((s, i) => <div key={i} className="text-sm text-muted">{s.file} — {s.reason}</div>)}</div>}
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
      <form onSubmit={submit} className="card p-5 space-y-4">
        <div className="flex items-center gap-2 font-bold"><Youtube size={18} className="text-red-400" />YouTube · SoundCloud · Bandcamp · прямые ссылки</div>
        <p className="text-sm text-muted">Вставьте ссылку на трек, видео или плейлист. Импорт делает yt-dlp на сервере: аудио попадает в библиотеку (обложка, название и исполнитель берутся из метаданных), а в режиме «видео» файл сохраняется в mp4 для скачивания. Загружайте только то, на что у вас есть права.</p>
        {caps && !caps.ytdlp && <p className="text-sm text-amber-400">yt-dlp не найден на сервере. Установите: <code>pip install yt-dlp</code> (или используйте Docker-образ AVRmusic, там он уже есть).</p>}
        <div className="flex gap-2">
          <input className="input flex-1" placeholder="https://www.youtube.com/watch?v=… или https://soundcloud.com/…" value={url} onChange={(e) => setUrl(e.target.value)} required />
          <select className="input w-auto" value={mode} onChange={(e) => setMode(e.target.value as any)}><option value="audio">Аудио</option><option value="video">Видео (mp4)</option></select>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <input className="input" placeholder="Исполнитель (необязательно)" value={meta.artist} onChange={(e) => setMeta({ ...meta, artist: e.target.value })} />
          <input className="input" placeholder="Альбом (необязательно)" value={meta.album} onChange={(e) => setMeta({ ...meta, album: e.target.value })} />
          <input className="input" placeholder="Жанр (необязательно)" value={meta.genre} onChange={(e) => setMeta({ ...meta, genre: e.target.value })} />
        </div>
        <button className="btn btn-accent" type="submit" disabled={!url.trim() || (caps ? !caps.ytdlp : false)}><Link2 size={16} />Импортировать</button>
      </form>

      <h2 className="font-bold text-lg mt-8 mb-3">Задачи</h2>
      <div className="space-y-3">
        {(jobs ?? []).map((j) => <JobCard key={j.id} job={j} />)}
        {!jobs?.length && <p className="text-muted text-sm">Пока пусто.</p>}
      </div>
    </div>
  );
}

function JobCard({ job }: { job: ImportJob }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const icon = job.status === 'done' ? <CheckCircle2 className="text-emerald-400" size={18} /> : job.status === 'error' ? <XCircle className="text-red-400" size={18} /> : <Loader2 className="animate-spin text-accent-2" size={18} />;
  return (
    <div className="card p-4">
      <div className="flex items-center gap-3">
        {icon}
        <div className="min-w-0 flex-1">
          <div className="font-medium line-clamp-1">{job.kind === 'lyrics' ? 'Поиск текстов (LRCLIB)' : job.url}</div>
          <div className="text-xs text-muted">{job.kind === 'url' ? (job.mode === 'video' ? 'видео' : 'аудио') + ' · ' : ''}{new Date(job.createdAt).toLocaleString()}{job.stats ? ` · найдено ${job.stats.found} из ${job.stats.missing}` : ''}{job.imported.length ? ` · импортировано: ${job.imported.length}` : ''}</div>
        </div>
        <button className="text-xs text-muted hover:text-fg" onClick={() => setOpen(!open)}>лог</button>
        {(job.status === 'done' || job.status === 'error') && <button className="icon-btn" onClick={async () => { await api.del(`/api/admin/import/jobs/${job.id}`); qc.invalidateQueries({ queryKey: ['admin', 'jobs'] }); }}><Trash2 size={16} /></button>}
      </div>
      {(job.status === 'running' || job.status === 'queued') && <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden mt-3"><div className="h-full accent-gradient transition-[width]" style={{ width: `${job.progress}%` }} /></div>}
      {job.error && <p className="text-sm text-red-400 mt-2">{job.error}</p>}
      {open && <pre className="mt-3 text-xs text-muted bg-black/30 rounded-lg p-3 max-h-48 overflow-auto whitespace-pre-wrap">{job.log.slice(-40).join('\n') || '—'}</pre>}
      {job.imported.length > 0 && <div className="mt-3 space-y-1">{job.imported.slice(0, 20).map((tr) => <TrackRowAdmin key={tr.id} track={tr} />)}</div>}
    </div>
  );
}

function TrackRowAdmin({ track, onDelete }: { track: Track; onDelete?: () => void }) {
  return (
    <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-surface text-sm">
      <Cover src={track.coverUrl} className="w-10 h-10" />
      <div className="min-w-0 flex-1">
        <div className="font-medium line-clamp-1">{track.title}</div>
        <div className="text-muted line-clamp-1">{track.artist.name}{track.album ? ` · ${track.album.title}` : ''} · {fmtMs(track.durationMs)} · {track.codec ?? track.mimeType}{track.bitrate ? ` · ${Math.round(track.bitrate / 1000)} kbps` : ''}</div>
      </div>
      <div className="flex items-center gap-1 text-muted">
        {track.hasSyncedLyrics ? <Mic2 size={14} className="text-emerald-400" /> : track.hasLyrics ? <Mic2 size={14} /> : null}
        {track.hasCanvas && <Clapperboard size={14} className="text-accent-2" />}
      </div>
      <Link to={`/admin/track/${track.id}`} className="icon-btn"><Pencil size={16} /></Link>
      {onDelete && <button className="icon-btn text-red-400" onClick={onDelete}><Trash2 size={16} /></button>}
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
      <input className="input max-w-md mb-4" placeholder={t('searchPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="space-y-0.5">{(data?.items ?? []).map((tr) => <TrackRowAdmin key={tr.id} track={tr} onDelete={() => del(tr)} />)}</div>
      {data && data.total > 50 && (
        <div className="flex items-center gap-2 mt-4 text-sm">
          <button className="btn btn-ghost !h-8" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>←</button>
          <span className="text-muted">{offset + 1}–{Math.min(offset + 50, data.total)} / {data.total}</span>
          <button className="btn btn-ghost !h-8" disabled={offset + 50 >= data.total} onClick={() => setOffset(offset + 50)}>→</button>
        </div>
      )}
    </div>
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
      {(data ?? []).map((u) => (
        <div key={u.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-surface">
          <Cover src={u.avatarUrl} round kind="artist" className="w-10 h-10" />
          <div className="min-w-0 flex-1"><div className="font-medium">{u.displayName} <span className="text-muted">@{u.username}</span></div><div className="text-sm text-muted">{u.email}</div></div>
          <select className="input w-auto !h-9" value={u.role} onChange={(e) => setRole(u, e.target.value as any)}><option value="user">user</option><option value="admin">admin</option></select>
          <button className="icon-btn text-red-400" onClick={async () => { if (!confirm(t('confirmDelete'))) return; try { await api.del(`/api/admin/users/${u.id}`); qc.invalidateQueries({ queryKey: ['admin', 'users'] }); } catch (e: any) { toast(e.message, 'error'); } }}><Trash2 size={16} /></button>
        </div>
      ))}
    </div>
  );
}
