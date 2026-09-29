import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Lyrics, Track } from '@avrmusic/shared';
import { M3eButton, M3eFormField, M3eIconButton, M3eOption, M3eSelect, M3eSwitch } from '@/md';
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

  if (!track) return <div className="page pt-8 muted">{t('loading')}</div>;
  const refresh = () => { ['track', 'lyrics', 'lyrics-raw'].forEach((k) => qc.invalidateQueries({ queryKey: [k, id] })); ['album', 'admin', 'home'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); };
  const wrap = async (key: string, fn: () => Promise<any>, ok = t('saved')) => { setBusy(key); try { await fn(); toast(ok, 'success'); refresh(); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(null); } };
  const save = () => wrap('save', () => api.patch(`/api/admin/tracks/${id}`, {
    title: form.title, artist: form.artist, album: form.album || null, genre: form.genre || null, year: form.year ? Number(form.year) : null, trackNo: form.trackNo ? Number(form.trackNo) : null, explicit: form.explicit,
    featuring: form.featuring.split(',').map((s) => s.trim()).filter(Boolean), albumType: form.albumType,
  }));
  const saveLyrics = () => wrap('lyrics', () => api.patch(`/api/admin/tracks/${id}`, { lyricsSynced: lrc.trim() || null, lyricsPlain: plain.trim() || null }));
  const uploadFile = (path: string, f: File) => { const fd = new FormData(); fd.append('file', f); return api.upload(path, fd); };
  const field = (k: keyof typeof form, label: string, type = 'text') => <M3eFormField variant="outlined" className="w-full block"><span slot="label">{label}</span><input type={type} value={form[k] as string} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></M3eFormField>;

  return (
    <div className="page pt-4 max-w-5xl">
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <Cover src={track.coverUrl} className="w-24 h-24 elev-2 !rounded-[20px]" />
        <div className="min-w-0 flex-1">
          <div className="md-label-lg muted uppercase tracking-wider">{t('editTrack')}</div>
          <h1 className="md-headline-md emph line-1">{track.title}</h1>
          <div className="md-body-md muted">{track.artist.name} · {fmtMs(track.durationMs)} · {track.codec ?? track.mimeType}{track.bitrate ? ` · ${Math.round(track.bitrate / 1000)} kbps` : ''}{track.sampleRate ? ` · ${track.sampleRate} Hz` : ''}</div>
        </div>
        <M3eIconButton variant="tonal" onClick={() => usePlayer.getState().playTrack(track)}><m3e-icon variant="rounded" name="play_arrow" filled /></M3eIconButton>
        <M3eButton variant="tonal" onClick={() => coverRef.current?.click()}><m3e-icon variant="rounded" slot="icon" name="image" />{t('uploadCover')}</M3eButton>
        <input ref={coverRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && wrap('cover', () => uploadFile(`/api/admin/tracks/${id}/cover`, e.target.files![0]))} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="surface-low rounded-[28px] p-5 space-y-3">
          <h2 className="md-title-lg emph">Метаданные</h2>
          {field('title', t('title'))}
          {field('artist', t('artist'))}
          {field('featuring', t('featuring'))}
          <div className="grid grid-cols-2 gap-3">{field('album', t('album'))}<M3eFormField variant="outlined" className="w-full block"><span slot="label">Тип релиза</span><M3eSelect onChange={(e: Event) => setForm({ ...form, albumType: (e.target as any).value ?? 'album' })}><M3eOption value="album" selected={form.albumType === 'album' || undefined}>{t('album')}</M3eOption><M3eOption value="single" selected={form.albumType === 'single' || undefined}>{t('single')}</M3eOption><M3eOption value="ep" selected={form.albumType === 'ep' || undefined}>{t('ep')}</M3eOption><M3eOption value="compilation" selected={form.albumType === 'compilation' || undefined}>{t('compilation')}</M3eOption></M3eSelect></M3eFormField></div>
          <div className="grid grid-cols-3 gap-3">{field('genre', t('genre'))}{field('year', t('year'), 'number')}{field('trackNo', t('trackNo'), 'number')}</div>
          <label className="flex items-center justify-between md-body-lg"><span>{t('explicit')}</span><M3eSwitch checked={form.explicit || undefined} onChange={(e: Event) => setForm({ ...form, explicit: !!(e.target as any).checked })} /></label>
          <div className="flex gap-2 pt-2">
            <M3eButton variant="filled" disabled={busy === 'save' || undefined} onClick={save}><m3e-icon variant="rounded" slot="icon" name={busy === 'save' ? 'hourglass_empty' : 'check'} />{t('save')}</M3eButton>
            <M3eButton variant="tonal" disabled={busy === 'refetch' || undefined} onClick={() => wrap('refetch', () => api.post(`/api/admin/tracks/${id}/refetch`, {}), t('refetchQueued'))}><m3e-icon variant="rounded" slot="icon" name="sync" />{t('refetchAudio')}</M3eButton>
            <M3eButton variant="text" className="ml-auto" style={{ color: 'var(--md-sys-color-error)' }} onClick={() => { if (confirm(t('confirmDelete'))) wrap('del', () => api.del(`/api/admin/tracks/${id}`), t('removed')).then(() => nav('/admin?tab=tracks')); }}><m3e-icon variant="rounded" slot="icon" name="delete" />{t('deleteTrack')}</M3eButton>
          </div>
        </section>

        <section className="surface-low rounded-[28px] p-5 space-y-3">
          <h2 className="md-title-lg emph flex items-center gap-2"><m3e-icon variant="rounded" name="movie" />{t('canvas')}</h2>
          <p className="md-body-md muted">{t('canvasHint')}</p>
          {track.hasCanvas && (
            <div className="w-40 aspect-[9/16] rounded-[20px] overflow-hidden bg-black elev-2">
              {track.canvasKind === 'video' ? <video src={canvasUrl(track.id)} className="w-full h-full object-cover" muted loop autoPlay playsInline /> : <img src={canvasUrl(track.id)} className="w-full h-full object-cover" alt="" />}
            </div>
          )}
          <div className="flex gap-2 flex-wrap">
            <M3eButton variant="filled" disabled={busy === 'canvas' || undefined} onClick={() => wrap('canvas', () => api.post(`/api/admin/tracks/${id}/canvas/fetch`, {}), t('canvasQueued'))}><m3e-icon variant="rounded" slot="icon" name="movie" />{t('findCanvas')}</M3eButton>
            <M3eButton variant="tonal" disabled={busy === 'canvas' || undefined} onClick={() => canvasRef.current?.click()}><m3e-icon variant="rounded" slot="icon" name={busy === 'canvas' ? 'hourglass_empty' : 'upload'} />{t('uploadCanvas')}</M3eButton>
            {track.hasCanvas && <M3eButton variant="text" style={{ color: 'var(--md-sys-color-error)' }} onClick={() => wrap('canvas', () => api.del(`/api/admin/tracks/${id}/canvas`), t('removed'))}><m3e-icon variant="rounded" slot="icon" name="delete" />{t('removeCanvas')}</M3eButton>}
          </div>
          <input ref={canvasRef} type="file" accept="video/mp4,video/webm,video/quicktime,image/gif,image/webp,image/png,image/jpeg,image/svg+xml" hidden onChange={(e) => e.target.files?.[0] && wrap('canvas', () => uploadFile(`/api/admin/tracks/${id}/canvas`, e.target.files![0]))} />
        </section>

        <section className="surface-low rounded-[28px] p-5 space-y-3 lg:col-span-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="md-title-lg emph flex items-center gap-2"><m3e-icon variant="rounded" name="lyrics" />{t('lyrics')}</h2>
            <span className="md-label-md muted">{lyrics?.source ? `источник: ${lyrics.source}` : ''}</span>
            <div className="ml-auto flex gap-2">
              <M3eButton variant="tonal" disabled={busy === 'fetch' || undefined} onClick={() => wrap('fetch', () => api.post(`/api/admin/tracks/${id}/lyrics/fetch`, {}), 'Текст найден')}><m3e-icon variant="rounded" slot="icon" name={busy === 'fetch' ? 'hourglass_empty' : 'stars'} />Найти в LRCLIB</M3eButton>
              <M3eButton variant="tonal" onClick={() => lrcRef.current?.click()}><m3e-icon variant="rounded" slot="icon" name="upload" />{t('uploadLrc')}</M3eButton>
              <input ref={lrcRef} type="file" accept=".lrc,.txt" hidden onChange={(e) => e.target.files?.[0] && wrap('lrc', () => uploadFile(`/api/admin/tracks/${id}/lyrics`, e.target.files![0]))} />
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <M3eFormField variant="outlined" className="w-full block"><span slot="label">{t('syncedLyrics')}</span><textarea className="font-mono" rows={14} value={lrc} onChange={(e) => setLrc(e.target.value)} placeholder={'[00:12.50]Первая строка\n[00:17.20]Вторая строка'} /></M3eFormField>
            <M3eFormField variant="outlined" className="w-full block"><span slot="label">{t('plainLyrics')}</span><textarea rows={14} value={plain} onChange={(e) => setPlain(e.target.value)} /></M3eFormField>
          </div>
          <M3eButton variant="filled" disabled={busy === 'lyrics' || undefined} onClick={saveLyrics}><m3e-icon variant="rounded" slot="icon" name={busy === 'lyrics' ? 'hourglass_empty' : 'check'} />{t('save')}</M3eButton>
        </section>
      </div>
    </div>
  );
}
