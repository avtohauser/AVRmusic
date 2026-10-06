// Moving a library here: Spotify (sign in — liked songs, every playlist, followed artists), a link to one
// playlist, or a pasted list / CSV. Yandex Music is moved in the app (it reads the library on the phone).
import { useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { M3eButton, M3eButtonSegment, M3eFormField, M3eSegmentedButton } from '@/md';
import { api } from '@/lib/api';
import { useAuth } from '@/stores/auth';
import { useUI } from '@/stores/ui';
import { useTr } from '@/lib/social';


const started = (tr: (ru: string, en: string) => string, qc: ReturnType<typeof useQueryClient>) => {
  useUI.getState().toast(tr('Перенос начат — ход виден в «Загрузках»', 'The transfer has started — see Downloads'), 'success');
  qc.invalidateQueries({ queryKey: ['acquire-jobs'] });
};

export default function Transfer() {
  const tr = useTr();
  return (
    <div className="page pt-4 max-w-3xl">
      <h1 className="md-headline-lg emph">{tr('Перенести музыку', 'Move your music')}</h1>
      <p className="md-body-lg muted mt-1 mb-5">{tr('Любимые треки станут лайками, плейлисты — плейлистами, исполнители — подписками на новинки. Чего нет на сервере — скачается само.', 'Liked songs become likes, playlists stay playlists, artists become release follows. What is missing gets fetched by itself.')}</p>
      <SpotifyCard />
      <YandexCard />
      <LinkCard />
      <ListCard />
      <p className="md-body-sm muted mt-4"><Link to="/downloads?tab=queue" className="underline">{tr('Ход переноса — в «Загрузках»', 'Progress — in Downloads')}</Link></p>
    </div>
  );
}

function Card({ title, subtitle, color, children }: { title: string; subtitle: string; color: string; children: ReactNode }) {
  return (
    <section className="surface-low rounded-[28px] p-5 mb-3">
      <div className="flex items-center gap-3 mb-4">
        <span className="w-10 h-10 rounded-[14px] flex items-center justify-center text-white shrink-0" style={{ background: color }}><m3e-icon variant="rounded" name="swap_horiz" /></span>
        <div className="min-w-0"><div className="md-title-md emph">{title}</div><div className="md-body-sm muted">{subtitle}</div></div>
      </div>
      {children}
    </section>
  );
}

function SpotifyCard() {
  const tr = useTr();
  const user = useAuth((s) => s.user);
  const { data } = useQuery({ queryKey: ['transfer-status'], queryFn: () => api.get<{ spotify: boolean }>('/api/transfer/status') });
  const go = async () => {
    try { location.href = (await api.get<{ url: string }>('/api/transfer/spotify/start')).url; }
    catch (e: any) { useUI.getState().toast(e.message, 'error'); }
  };
  return (
    <Card title="Spotify" subtitle={tr('Любимые треки, все плейлисты, исполнители — треки находятся точно по ISRC', 'Liked songs, every playlist, artists — tracks are matched exactly by ISRC')} color="#1DB954">
      {data?.spotify ? (
        <M3eButton variant="filled" onClick={go}><m3e-icon variant="rounded" slot="icon" name="login" />{tr('Войти в Spotify и перенести всё', 'Sign in to Spotify and move everything')}</M3eButton>
      ) : data ? (
        <>
          <p className="md-body-md">{tr('Администратор ещё не подключил Spotify. Пока можно перенести плейлисты по ссылкам или списком.', 'The admin has not connected Spotify yet. Meanwhile, move playlists by link or as a list.')}</p>
          {user?.role === 'admin' && <M3eButton variant="tonal" className="mt-2" href="/admin?tab=reports"><m3e-icon variant="rounded" slot="icon" name="settings" />{tr('Подключить в админке', 'Connect in the admin panel')}</M3eButton>}
        </>
      ) : <p className="md-body-md muted">…</p>}
    </Card>
  );
}

/** Yandex keeps its music closed to the server abroad, and a browser page cannot read it either:
 *  the move is made in the app on the phone (sign in with a code — the phone reads the library). */
function YandexCard() {
  const tr = useTr();
  return (
    <Card title={tr('Яндекс Музыка', 'Yandex Music')} subtitle={tr('«Мне нравится», все плейлисты (и закрытые), исполнители и альбомы', 'Liked songs, every playlist (private ones too), artists and albums')} color="#E5B800">
      <p className="md-body-md">{tr('Яндекс не пускает к музыке сервер за границей, поэтому перенос из Яндекс Музыки делается в приложении AVRmusic на телефоне:', 'Yandex keeps its music closed to servers abroad, so the move from Yandex Music is made in the AVRmusic app on the phone:')}</p>
      <ol className="md-body-md list-decimal pl-5 mt-2 space-y-1">
        <li>{tr('Профиль → «Перенести музыку» → «Войти через Яндекс».', 'Profile → “Move your music” → “Sign in with Yandex”.')}</li>
        <li>{tr('Откройте ya.ru/device, войдите в Яндекс и введите показанный код.', 'Open ya.ru/device, sign in to Yandex and enter the code shown.')}</li>
        <li>{tr('Отметьте, что перенести, — телефон прочитает библиотеку и отправит её сюда.', 'Pick what to move — the phone reads the library and sends it here.')}</li>
      </ol>
      <p className="md-body-sm muted mt-2">{tr('Пароль никуда не передаётся, доступ к Яндексу не сохраняется. Ссылки на плейлисты Яндекса тоже открываются только в приложении.', 'Your password goes nowhere, and the access to Yandex is not kept. Yandex playlist links also open only in the app.')}</p>
    </Card>
  );
}

function LinkCard() {
  const tr = useTr();
  const qc = useQueryClient();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { await api.post('/api/import/link', { url: url.trim() }); setUrl(''); started(tr, qc); }
    catch (e: any) { useUI.getState().toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <Card title={tr('Один плейлист по ссылке', 'One playlist by link')} subtitle={tr('Ссылка на плейлист или альбом Spotify (Яндекс — в приложении)', 'A Spotify playlist or album link (Yandex — in the app)')} color="#7D5260">
      <div className="flex gap-2 items-start flex-wrap">
        <M3eFormField variant="outlined" className="flex-1 min-w-56 block"><span slot="label">{tr('Ссылка', 'Link')}</span><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://open.spotify.com/playlist/…" /></M3eFormField>
        <M3eButton variant="filled" disabled={busy || !/^https?:\/\//.test(url.trim()) || undefined} onClick={go}><m3e-icon variant="rounded" slot="icon" name="link" />{tr('Перенести', 'Move')}</M3eButton>
      </div>
    </Card>
  );
}

function ListCard() {
  const tr = useTr();
  const qc = useQueryClient();
  const file = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [target, setTarget] = useState<'playlist' | 'likes'>('playlist');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { const r = await api.post<{ tracks: number }>('/api/transfer/list', { text, target, title: title.trim() || tr('Перенесённый плейлист', 'Moved playlist') }); setText(''); started(tr, qc); useUI.getState().toast(tr(`Треков в списке: ${r.tracks}`, `Tracks in the list: ${r.tracks}`)); }
    catch (e: any) { useUI.getState().toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <Card title={tr('Списком или файлом', 'As a list or a file')} subtitle={tr('Строки «Исполнитель — Название» или CSV-выгрузка из любого сервиса', 'Lines “Artist — Title” or a CSV export from any service')} color="#6750A4">
      <M3eFormField variant="outlined" className="w-full block"><span slot="label">{tr('Список треков', 'Track list')}</span><textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} /></M3eFormField>
      <div className="flex flex-wrap items-center gap-2 mt-3">
        <M3eButton variant="tonal" onClick={() => file.current?.click()}><m3e-icon variant="rounded" slot="icon" name="folder_open" />{tr('Выбрать файл (CSV, TXT)', 'Pick a file (CSV, TXT)')}</M3eButton>
        <input ref={file} type="file" accept=".csv,.txt,text/csv,text/plain" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; setText(await f.text()); if (!title) setTitle(f.name.replace(/\.[^.]+$/, '')); e.target.value = ''; }} />
        <M3eSegmentedButton onChange={(e: Event) => { const v = (e.target as any)?.value; if (v) setTarget(v); }}>
          <M3eButtonSegment value="playlist" checked={target === 'playlist' || undefined}>{tr('Новый плейлист', 'New playlist')}</M3eButtonSegment>
          <M3eButtonSegment value="likes" checked={target === 'likes' || undefined}>{tr('В любимые', 'To liked')}</M3eButtonSegment>
        </M3eSegmentedButton>
      </div>
      {target === 'playlist' && <M3eFormField variant="outlined" className="w-full block mt-3"><span slot="label">{tr('Название плейлиста', 'Playlist title')}</span><input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} /></M3eFormField>}
      <M3eButton variant="filled" className="mt-3" disabled={busy || text.trim().length < 3 || undefined} onClick={go}><m3e-icon variant="rounded" slot="icon" name="swap_horiz" />{tr('Перенести', 'Move')}</M3eButton>
    </Card>
  );
}
