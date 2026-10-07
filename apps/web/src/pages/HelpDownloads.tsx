// "Помочь с загрузками": a friend gives a spare YouTube account (its cookies.txt) — every account adds
// downloads at the same time, on each of the servers. Theirs to see and take back; kept only on the server.
import { useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { M3eButton } from '@/md';
import { api } from '@/lib/api';
import { useTr } from '@/lib/social';
import { useUI } from '@/stores/ui';

interface Given { max: number; accounts: Array<{ id: string; label: string; loggedIn: boolean; coolingUntil: string | null; ok: number; failed: number }> }

export default function HelpDownloads() {
  const tr = useTr();
  const qc = useQueryClient();
  const file = useRef<HTMLInputElement>(null);
  const { data } = useQuery({ queryKey: ['given-accounts'], queryFn: () => api.get<Given>('/api/me/youtube-accounts') });
  const upload = async (f: File) => {
    const form = new FormData();
    form.append('file', f);
    try { await api.upload('/api/me/youtube-accounts', form); useUI.getState().toast(tr('Спасибо! Аккаунт уже помогает качать', 'Thanks! The account is already helping'), 'success'); }
    catch (e: any) { useUI.getState().toast(e.message, 'error'); }
    await qc.invalidateQueries({ queryKey: ['given-accounts'] });
  };
  const take = async (id: string) => { await api.del(`/api/me/youtube-accounts/${id}`).catch(() => {}); await qc.invalidateQueries({ queryKey: ['given-accounts'] }); };
  return (
    <div className="page pt-4 max-w-2xl">
      <h1 className="md-headline-lg emph mb-3">{tr('Помочь с загрузками', 'Help with downloads')}</h1>
      <p className="md-body-lg text-on-surface-variant mb-4">{tr('Треки качаются с YouTube. Каждый аккаунт — это ещё две загрузки одновременно на каждом сервере и меньше «докажите, что вы не робот». Дайте запасной (не основной!) аккаунт Google — его cookies хранятся только на сервере, забрать можно в любой момент.', 'Tracks come from YouTube. Each account adds two downloads at once on every server and fewer “prove you are not a robot” checks. Give a spare (not your main!) Google account — its cookies stay on the server only, and you can take it back any time.')}</p>
      <h2 className="md-title-md mb-1">{tr('Как получить cookies.txt', 'How to get cookies.txt')}</h2>
      <ol className="md-body-md list-decimal pl-5 mb-4 space-y-1">
        <li>{tr('Войдите в запасной аккаунт на youtube.com.', 'Sign in to the spare account on youtube.com.')}</li>
        <li>{tr('Поставьте расширение «Get cookies.txt LOCALLY».', 'Install the “Get cookies.txt LOCALLY” extension.')}</li>
        <li>{tr('На youtube.com нажмите его и сохраните файл.', 'On youtube.com click it and save the file.')}</li>
        <li>{tr('Выберите файл здесь. Потом из браузера можно просто выйти — не нажимайте «выйти на всех устройствах».', 'Pick the file here. Afterwards just sign out in the browser — not “sign out everywhere”.')}</li>
      </ol>
      <input ref={file} type="file" accept=".txt,text/plain" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
      <M3eButton variant="filled" disabled={(data && data.accounts.length >= data.max) || undefined} onClick={() => file.current?.click()}><m3e-icon variant="rounded" slot="icon" name="upload_file" />{tr('Выбрать cookies.txt', 'Pick cookies.txt')}</M3eButton>
      <div className="flex flex-col gap-2 mt-4">
        {data?.accounts.map((a) => (
          <div key={a.id} className="flex items-center gap-3 p-3 rounded-3xl surface-low">
            <div className="flex-1 min-w-0">
              <div className="md-title-md">{a.label}</div>
              <div className={`md-body-sm ${a.loggedIn ? 'text-on-surface-variant' : 'text-error'}`}>{a.loggedIn ? tr('вход есть', 'signed in') : tr('входа нет — пересохраните cookies', 'not signed in — save the cookies again')} · {tr(`скачано ${a.ok}, ошибок ${a.failed}`, `downloaded ${a.ok}, failed ${a.failed}`)}{a.coolingUntil ? tr(' · отдыхает', ' · resting') : ''}</div>
            </div>
            <M3eButton variant="text" onClick={() => void take(a.id)}>{tr('Забрать', 'Take back')}</M3eButton>
          </div>
        ))}
      </div>
      {data && <p className="md-body-sm text-on-surface-variant mt-3">{tr(`Можно дать до ${data.max} аккаунтов.`, `Up to ${data.max} accounts.`)}</p>}
    </div>
  );
}
