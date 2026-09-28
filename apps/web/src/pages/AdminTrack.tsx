import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Clapperboard, Loader2, Mic2, Save, Sparkles, Trash2, Upload, Play } from 'lucide-react';
import type { Lyrics, Track } from '@avrmusic/shared';
import { api, canvasUrl } from '@/lib/api';
import { useUI } from '@/stores/ui';
import { usePlayer } from '@/stores/player';
import { useT } from '@/lib/i18n';
import { Cover } from '@/components/Cover';
import { fmtMs } from '@/lib/format';

export default function AdminTrack() {
  const { id } = useParams();
  const t = useT();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useUI((s) => s.toast);
  const { data: track } = useQuery({ queryKey: ['track', id], queryFn: () => api.get<Track>(`/api/tracks/${id}`), enabled: !!id });
  const { data: lyrics } = useQuery({ queryKey: ['lyrics', id], queryFn: () => api.get<Lyrics>(`/api/tracks/${id}/lyrics`), enabled: !!id });
  const { data: lrcRaw } = useQuery({ queryKey: ['lyrics-raw', id], queryFn: () => api.get<{ lyricsSynced: string | null; lyricsPlain: string | null }>(`/api/admin/tracks/${id}/lyrics`), enabled: !!id });
  const [form, setForm] = useState({ title: '', artist: '', album: '', genre: '', year: '', trackNo: '', explicit: false, featuring: '', albumType: 'album' });
  const [plain, setPlain] = useState('');
  const [lrc, setLrc] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const coverRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLInputElement>(null);
  const lrcRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (track) setForm({ title: track.title, artist: track.artist.name, album: track.album?.title ?? '', genre: track.genre ?? '', year: String(track.album?.year ?? ''), trackNo: String(track.trackNo ?? ''), explicit: track.explicit, featuring: track.featuring.map((f) => f.name).join(', '), albumType: 'album' });
  }, [track?.id]);
  useEffect(() => { if (lrcRaw) { setLrc(lrcRaw.lyricsSynced ?? ''); setPlain(lrcRaw.lyricsPlain ?? ''); } }, [lrcRaw]);

  if (!track) return <div className="page pt-8 text-muted">{t('loading')}</div>;
  const refresh = () => { qc.invalidateQueries({ queryKey: ['track', id] }); qc.invalidateQueries({ queryKey: ['lyrics', id] }); qc.invalidateQueries({ queryKey: ['lyrics-raw', id] }); qc.invalidateQueries({ queryKey: ['album'] }); qc.invalidateQueries({ queryKey: ['admin'] }); qc.invalidateQueries({ queryKey: ['home'] }); };
  const wrap = async (key: string, fn: () => Promise<any>, ok = t('saved')) => { setBusy(key); try { await fn(); toast(ok, 'success'); refresh(); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); } };
  const save = () => wrap('save', () => api.patch(`/api/admin/tracks/${id}`, {
    title: form.title, artist: form.artist, album: form.album || null, genre: form.genre || null, year: form.year ? Number(form.year) : null, trackNo: form.trackNo ? Number(form.trackNo) : null, explicit: form.explicit,
    featuring: form.featuring.split(',').map((s) => s.trim()).filter(Boolean), albumType: form.albumType,
  }));
  const saveLyrics = () => wrap('lyrics', () => api.patch(`/api/admin/tracks/${id}`, { lyricsSynced: lrc.trim() || null, lyricsPlain: plain.trim() || null }));
  const uploadFile = (path: string, f: File) => { const fd = new FormData(); fd.append('file', f); return api.upload(path, fd); };
  const field = (k: keyof typeof form, label: string, type = 'text') => <div><label className="label">{label}</label><input className="input" type={type} value={form[k] as string} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></div>;

  return (
    <div className="page pt-4 max-w-5xl">
      <div className="flex items-center gap-4 mb-6">
        <Cover src={track.coverUrl} className="w-24 h-24 shadow-xl" />
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wider text-muted">{t('editTrack')}</div>
          <h1 className="text-2xl md:text-3xl font-extrabold line-clamp-1">{track.title}</h1>
          <div className="text-muted text-sm">{track.artist.name} · {fmtMs(track.durationMs)} · {track.codec ?? track.mimeType}{track.bitrate ? ` · ${Math.round(track.bitrate / 1000)} kbps` : ''}{track.sampleRate ? ` · ${track.sampleRate} Hz` : ''}</div>
        </div>
        <button className="icon-btn" onClick={() => usePlayer.getState().playTrack(track)}><Play size={20} /></button>
        <button className="btn btn-ghost !h-9" onClick={() => coverRef.current?.click()}><Upload size={16} />{t('uploadCover')}</button>
        <input ref={coverRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && wrap('cover', () => uploadFile(`/api/admin/tracks/${id}/cover`, e.target.files![0]))} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="card p-5 space-y-3">
          <h2 className="font-bold">Метаданные</h2>
          {field('title', t('title'))}
          {field('artist', t('artist'))}
          {field('featuring', t('featuring'))}
          <div className="grid grid-cols-2 gap-3">{field('album', t('album'))}<div><label className="label">Тип релиза</label><select className="input" value={form.albumType} onChange={(e) => setForm({ ...form, albumType: e.target.value })}><option value="album">{t('album')}</option><option value="single">{t('single')}</option><option value="ep">{t('ep')}</option><option value="compilation">{t('compilation')}</option></select></div></div>
          <div className="grid grid-cols-3 gap-3">{field('genre', t('genre'))}{field('year', t('year'), 'number')}{field('trackNo', t('trackNo'), 'number')}</div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.explicit} onChange={(e) => setForm({ ...form, explicit: e.target.checked })} />{t('explicit')}</label>
          <div className="flex gap-2 pt-2">
            <button className="btn btn-primary" disabled={busy === 'save'} onClick={save}>{busy === 'save' ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}{t('save')}</button>
            <button className="btn btn-ghost text-red-400 ml-auto" onClick={() => { if (confirm(t('confirmDelete'))) wrap('del', () => api.del(`/api/admin/tracks/${id}`), t('removed')).then(() => nav('/admin?tab=tracks')); }}><Trash2 size={16} />{t('deleteTrack')}</button>
          </div>
        </section>

        <section className="card p-5 space-y-3">
          <h2 className="font-bold flex items-center gap-2"><Clapperboard size={16} />{t('canvas')}</h2>
          <p className="text-sm text-muted">{t('canvasHint')}</p>
          {track.hasCanvas && (
            <div className="w-40 aspect-[9/16] rounded-xl overflow-hidden bg-black">
              {track.canvasKind === 'video' ? <video src={canvasUrl(track.id)} className="w-full h-full object-cover" muted loop autoPlay playsInline /> : <img src={canvasUrl(track.id)} className="w-full h-full object-cover" alt="" />}
            </div>
          )}
          <div className="flex gap-2">
            <button className="btn btn-outline" disabled={busy === 'canvas'} onClick={() => canvasRef.current?.click()}>{busy === 'canvas' ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}{t('uploadCanvas')}</button>
            {track.hasCanvas && <button className="btn btn-ghost text-red-400" onClick={() => wrap('canvas', () => api.del(`/api/admin/tracks/${id}/canvas`), t('removed'))}><Trash2 size={16} />{t('removeCanvas')}</button>}
          </div>
          <input ref={canvasRef} type="file" accept="video/mp4,video/webm,video/quicktime,image/gif,image/webp,image/png,image/jpeg,image/svg+xml" hidden onChange={(e) => e.target.files?.[0] && wrap('canvas', () => uploadFile(`/api/admin/tracks/${id}/canvas`, e.target.files![0]))} />
        </section>

        <section className="card p-5 space-y-3 lg:col-span-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-bold flex items-center gap-2"><Mic2 size={16} />{t('lyrics')}</h2>
            <span className="text-xs text-muted">{lyrics?.source ? `источник: ${lyrics.source}` : ''}</span>
            <div className="ml-auto flex gap-2">
              <button className="btn btn-outline !h-9" disabled={busy === 'fetch'} onClick={() => wrap('fetch', () => api.post(`/api/admin/tracks/${id}/lyrics/fetch`, {}), 'Текст найден')}>{busy === 'fetch' ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}Найти в LRCLIB</button>
              <button className="btn btn-outline !h-9" onClick={() => lrcRef.current?.click()}><Upload size={16} />{t('uploadLrc')}</button>
              <input ref={lrcRef} type="file" accept=".lrc,.txt" hidden onChange={(e) => e.target.files?.[0] && wrap('lrc', () => uploadFile(`/api/admin/tracks/${id}/lyrics`, e.target.files![0]))} />
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div><label className="label">{t('syncedLyrics')}</label><textarea className="input font-mono text-sm" rows={14} value={lrc} onChange={(e) => setLrc(e.target.value)} placeholder={'[00:12.50]Первая строка\n[00:17.20]Вторая строка'} /></div>
            <div><label className="label">{t('plainLyrics')}</label><textarea className="input text-sm" rows={14} value={plain} onChange={(e) => setPlain(e.target.value)} /></div>
          </div>
          <button className="btn btn-primary" disabled={busy === 'lyrics'} onClick={saveLyrics}>{busy === 'lyrics' ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}{t('save')}</button>
        </section>
      </div>
    </div>
  );
}
