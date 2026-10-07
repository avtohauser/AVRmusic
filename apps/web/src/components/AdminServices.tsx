// The admin's outside services: the Telegram bot's token, the Last.fm app, nightly copies of the database.
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { M3eButton, M3eFormField } from '@/md';
import { api } from '@/lib/api';
import { useBackups, useLastfmAdmin, useTelegramAdmin } from '@/lib/features';
import { useTr } from '@/lib/social';
import { useUI } from '@/stores/ui';

const size = (b: number) => (b > 1 << 20 ? `${(b / (1 << 20)).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);

function Block({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <section className="surface-low rounded-[28px] p-5 mb-3 max-w-2xl">
      <div className="flex items-center gap-3 mb-2"><m3e-icon variant="rounded" name={icon} /><h2 className="md-title-lg">{title}</h2></div>
      {children}
    </section>
  );
}

export function AdminServices() {
  const tr = useTr();
  const qc = useQueryClient();
  const toast = useUI.getState().toast;
  const tg = useTelegramAdmin();
  const lf = useLastfmAdmin();
  const bk = useBackups();
  const [token, setToken] = useState('');
  const [key, setKey] = useState('');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (lf.data) setKey(lf.data.key); }, [lf.data?.key]);
  const run = async (work: () => Promise<unknown>, ok: string, keys: string[]) => {
    setBusy(true);
    try { await work(); toast(ok, 'success'); await Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [k] }))); }
    catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <div>
      <Block icon="send" title={tr('Telegram-бот', 'Telegram bot')}>
        <p className="md-body-md text-on-surface-variant mb-3">
          {tg.data?.bot ? tr(`Подключён: @${tg.data.bot}. Пользователи привязывают его в Профиль → Сервисы.`, `Connected: @${tg.data.bot}. People link it in Profile → Services.`)
            : tr('Создайте бота у @BotFather (/newbot) и вставьте его токен. Токен хранится только на сервере.', 'Create a bot with @BotFather (/newbot) and paste its token. The token stays on the server only.')}
        </p>
        <M3eFormField variant="outlined" className="w-full block">
          <span slot="label">{tr('Токен бота', 'Bot token')}</span>
          <input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value.trim())} />
        </M3eFormField>
        <div className="flex gap-2 mt-3">
          <M3eButton variant="filled" disabled={!token || busy || undefined} onClick={() => void run(async () => { await api.put('/api/admin/telegram', { token }); setToken(''); }, tr('Бот подключён', 'Bot connected'), ['admin-telegram'])}>{tr('Сохранить', 'Save')}</M3eButton>
          {tg.data?.configured && <M3eButton variant="outlined" disabled={busy || undefined} onClick={() => void run(() => api.put('/api/admin/telegram', { token: null }), tr('Бот отключён', 'Bot disconnected'), ['admin-telegram'])}>{tr('Отключить', 'Disconnect')}</M3eButton>}
        </div>
        <p className="md-body-sm text-on-surface-variant mt-3">{tr('Сторож на сервере-хранилище тоже пишет через этого бота — всем админам, кто его привязал.', 'The watchdog on the storage server writes through this bot too — to every admin who linked it.')}</p>
      </Block>
      <Block icon="graphic_eq" title="Last.fm">
        <p className="md-body-md text-on-surface-variant mb-3">
          {lf.data?.hasSecret ? tr('Подключён — пользователи включают скробблинг в Профиль → Сервисы.', 'Connected — people turn scrobbling on in Profile → Services.')
            : tr('Создайте API-аккаунт на last.fm/api/account/create и вставьте API key и Shared secret.', 'Create an API account at last.fm/api/account/create and paste the API key and the shared secret.')}
        </p>
        <M3eFormField variant="outlined" className="w-full block"><span slot="label">API key</span><input value={key} onChange={(e) => setKey(e.target.value.trim())} /></M3eFormField>
        <M3eFormField variant="outlined" className="w-full block mt-2">
          <span slot="label">{lf.data?.hasSecret ? tr('Shared secret (пусто — не менять)', 'Shared secret (empty — keep it)') : 'Shared secret'}</span>
          <input type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value.trim())} />
        </M3eFormField>
        <M3eButton variant="filled" className="mt-3" disabled={key.length !== 32 || busy || undefined} onClick={() => void run(async () => { await api.put('/api/admin/lastfm', { key, secret }); setSecret(''); }, tr('Сохранено', 'Saved'), ['admin-lastfm'])}>{tr('Сохранить', 'Save')}</M3eButton>
      </Block>
      <TgAppBlock />
      <AutofetchBlock />
      <Block icon="backup" title={tr('Резервные копии', 'Backups')}>
        <p className="md-body-md text-on-surface-variant mb-2">
          {tr('Каждую ночь база (и входы YouTube) копируется на сервер-хранилище, хранятся последние 14 копий.', 'Every night the database (and the YouTube sign-ins) is copied to the storage server; the last 14 copies are kept.')}
          {bk.data?.last && <> {tr('Последняя:', 'Latest:')} {new Date(bk.data.last).toLocaleString()}</>}
        </p>
        {(bk.data?.files ?? []).slice(0, 5).map((f) => <div key={f.name} className="md-body-sm">{f.name} · {size(f.size)}</div>)}
        <M3eButton variant="tonal" className="mt-3" disabled={busy || undefined} onClick={() => void run(() => api.post('/api/admin/backups', {}), tr('Копия сделана', 'Backup made'), ['admin-backups'])}>{tr('Сделать копию сейчас', 'Back up now')}</M3eButton>
      </Block>
    </div>
  );
}

function TgAppBlock() {
  const tr = useTr();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['admin-tg-app'], queryFn: () => api.get<{ apiId: number | null; hasHash: boolean }>('/api/admin/tg-app') });
  const [id, setId] = useState('');
  const [hash, setHash] = useState('');
  useEffect(() => { if (data?.apiId) setId(String(data.apiId)); }, [data?.apiId]);
  const save = async () => {
    try { await api.put('/api/admin/tg-app', { apiId: Number(id), apiHash: hash }); setHash(''); useUI.getState().toast(tr('Сохранено', 'Saved'), 'success'); await qc.invalidateQueries({ queryKey: ['admin-tg-app'] }); }
    catch (e: any) { useUI.getState().toast(e.message, 'error'); }
  };
  return (
    <Block icon="badge" title={tr('Статус в Telegram', 'Telegram status')}>
      <p className="md-body-md text-on-surface-variant mb-3">{tr('Чтобы друзья могли показывать в профиле Telegram, что сейчас играет, нужны API ID и API hash: my.telegram.org → API development tools. Хранятся только на сервере.', 'For friends to show what plays in their Telegram profile, an API ID and API hash are needed: my.telegram.org → API development tools. Kept on the server only.')}</p>
      <M3eFormField variant="outlined" className="w-full block"><span slot="label">API ID</span><input inputMode="numeric" value={id} onChange={(e) => setId(e.target.value.replace(/\D/g, ''))} /></M3eFormField>
      <M3eFormField variant="outlined" className="w-full block mt-2">
        <span slot="label">{data?.hasHash ? tr('API hash (пусто — не менять)', 'API hash (empty — keep it)') : 'API hash'}</span>
        <input type="password" autoComplete="off" value={hash} onChange={(e) => setHash(e.target.value.trim())} />
      </M3eFormField>
      <M3eButton variant="filled" className="mt-3" disabled={!id || undefined} onClick={() => void save()}>{tr('Сохранить', 'Save')}</M3eButton>
    </Block>
  );
}

function AutofetchBlock() {
  const tr = useTr();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['admin-autofetch'], queryFn: () => api.get<{ on: boolean; next: string[] }>('/api/admin/autofetch') });
  const set = async (on: boolean) => { await api.put('/api/admin/autofetch', { on }).catch((e) => useUI.getState().toast(e.message, 'error')); await qc.invalidateQueries({ queryKey: ['admin-autofetch'] }); };
  return (
    <Block icon="library_add" title={tr('Дискографии любимых исполнителей', "Loved artists' discographies")}>
      <p className="md-body-md text-on-surface-variant mb-3">{tr('Сервер сам докачивает дискографии тех, кого лайкают, на кого подписаны и кого много слушают — по одной за раз, после ваших загрузок.', 'The server tops up the discographies of artists people like, follow and play a lot — one at a time, after your own downloads.')}</p>
      {data && <>
        <M3eButton variant={data.on ? 'tonal' : 'filled'} onClick={() => void set(!data.on)}>{data.on ? tr('Выключить', 'Turn off') : tr('Включить', 'Turn on')}</M3eButton>
        {data.on && !!data.next.length && <p className="md-body-sm text-on-surface-variant mt-2">{tr('Следующие:', 'Next:')} {data.next.join(', ')}</p>}
      </>}
    </Block>
  );
}
