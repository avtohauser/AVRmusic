// The outside services a listener connects: the Telegram bot (songs by name or link, what friends send),
// Last.fm (every play scrobbled), and their city — for concerts of the artists they love.
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { M3eButton, M3eFormField } from '@/md';
import { Modal } from '@/components/Modal';
import { Cover } from '@/components/Cover';
import { api } from '@/lib/api';
import { useCities, useConcerts, useIntegrations } from '@/lib/features';
import { useTr } from '@/lib/social';
import { useUI } from '@/stores/ui';

function Block({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <section className="surface-low rounded-[28px] p-5 mb-3">
      <div className="flex items-center gap-3 mb-2">
        <span className="w-10 h-10 rounded-2xl bg-primary-container text-on-primary-container flex items-center justify-center"><m3e-icon variant="rounded" name={icon} /></span>
        <h2 className="md-title-lg">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default function Services() {
  const tr = useTr();
  const qc = useQueryClient();
  const { data: s } = useIntegrations();
  const concerts = useConcerts();
  const [cityOpen, setCityOpen] = useState(false);
  const toast = useUI.getState().toast;
  const run = async (work: () => Promise<unknown>, ok?: string) => {
    try { await work(); if (ok) toast(ok, 'success'); await qc.invalidateQueries({ queryKey: ['integrations'] }); }
    catch (e: any) { toast(e.message, 'error'); }
  };
  // the bot's and Last.fm's pages open in a new tab; the window is opened at once (pop-up blockers)
  const openFrom = (path: string, method: 'GET' | 'POST') => {
    const w = window.open('', '_blank');
    void (method === 'GET' ? api.get<{ url: string }>(path) : api.post<{ url: string }>(path, {}))
      .then((r) => { if (w) w.location.href = r.url; else location.href = r.url; })
      .catch((e) => { w?.close(); toast(e.message, 'error'); });
  };
  return (
    <div className="page pt-4 max-w-3xl">
      <h1 className="md-headline-lg emph mb-5">{tr('Сервисы', 'Services')}</h1>
      <Block icon="send" title="Telegram">
        <p className="md-body-md text-on-surface-variant mb-3">
          {!s?.telegram.available ? tr('Администратор ещё не подключил бота', "The admin hasn't connected the bot yet")
            : s.telegram.linked ? tr(`Привязан${s.telegram.linked.username ? ` (@${s.telegram.linked.username})` : ''}. Пишите боту название песни или ссылку — он скачает её; туда же придёт то, что присылают друзья.`, `Linked${s.telegram.linked.username ? ` (@${s.telegram.linked.username})` : ''}. Send the bot a song name or a link — it fetches it; what friends send arrives there too.`)
              : tr('Бот скачивает песни по названию или ссылке, присылает новинки, итоги недели и то, что отправили друзья.', 'The bot fetches songs by name or link and sends new releases, the weekly digest and what friends share.')}
        </p>
        <div className="flex gap-2">
          {s?.telegram.linked
            ? <M3eButton variant="outlined" onClick={() => void run(() => api.del('/api/me/telegram'), tr('Бот отвязан', 'Bot unlinked'))}>{tr('Отвязать', 'Unlink')}</M3eButton>
            : <M3eButton variant="filled" disabled={!s?.telegram.available || undefined} onClick={() => openFrom('/api/me/telegram/link', 'POST')}>{tr('Привязать', 'Link')}</M3eButton>}
          {s?.telegram.available && !s.telegram.linked && <M3eButton variant="text" onClick={() => void qc.invalidateQueries({ queryKey: ['integrations'] })}>{tr('Я привязал(а)', "I've linked it")}</M3eButton>}
        </div>
      </Block>
      <TgProfileBlock state={s?.tgProfile} />
      <Block icon="graphic_eq" title="Last.fm">
        <p className="md-body-md text-on-surface-variant mb-3">
          {!s?.lastfm.available ? tr('Администратор ещё не подключил Last.fm', "The admin hasn't connected Last.fm yet")
            : s.lastfm.linked ? tr(`Скробблинг включён: ${s.lastfm.linked.username ?? ''}`, `Scrobbling on: ${s.lastfm.linked.username ?? ''}`)
              : tr('Всё, что вы слушаете здесь, будет попадать в ваш профиль Last.fm.', 'Everything you play here will go to your Last.fm profile.')}
        </p>
        <div className="flex gap-2">
          {s?.lastfm.linked
            ? <M3eButton variant="outlined" onClick={() => void run(() => api.del('/api/me/lastfm'), tr('Last.fm отключён', 'Last.fm disconnected'))}>{tr('Отключить', 'Disconnect')}</M3eButton>
            : <M3eButton variant="filled" disabled={!s?.lastfm.available || undefined} onClick={() => openFrom('/api/me/lastfm/start', 'GET')}>{tr('Подключить', 'Connect')}</M3eButton>}
          {s?.lastfm.available && !s.lastfm.linked && <M3eButton variant="text" onClick={() => void qc.invalidateQueries({ queryKey: ['integrations'] })}>{tr('Я подключил(а)', "I've connected it")}</M3eButton>}
        </div>
      </Block>
      <Block icon="event" title={tr('Концерты', 'Concerts')}>
        <div className="flex items-center gap-2 mb-3">
          <p className="md-body-md text-on-surface-variant flex-1">
            {concerts.data?.city ? tr('Ваших исполнителей ищем в афише города — новые концерты приходят во «Входящие».', "We look for your artists in the city's listings — new concerts arrive in your inbox.")
              : tr('Выберите город — и мы найдём концерты ваших исполнителей', "Pick your city and we'll find your artists' concerts")}
          </p>
          <M3eButton variant="tonal" onClick={() => setCityOpen(true)}>{concerts.data?.city ? tr('Сменить город', 'Change city') : tr('Выбрать город', 'Pick a city')}</M3eButton>
        </div>
        {concerts.data?.city && !concerts.data.concerts.length && (
          <p className="md-body-md text-on-surface-variant">{concerts.data.checkedAt ? tr('Пока ничего — как только ваши исполнители приедут, концерт появится здесь.', 'Nothing yet — once your artists come, the concert shows up here.') : tr('Ищем в афише… загляните через минуту', 'Searching the listings… look in a minute')}</p>
        )}
        <div className="flex flex-col gap-1">
          {(concerts.data?.concerts ?? []).map((c) => (
            <a key={c.id} href={c.url ?? undefined} target="_blank" rel="noreferrer" className="flex items-center gap-3 p-2 rounded-2xl hover:bg-surface-container-high">
              <Cover src={c.imageUrl} className="w-16 h-16 rounded-xl shrink-0" />
              <div className="min-w-0">
                <div className="md-label-lg text-primary">{c.artist}</div>
                <div className="md-title-md line-2">{c.title}</div>
                <div className="md-body-sm text-on-surface-variant line-1">{[c.date, c.place].filter(Boolean).join(' · ')}</div>
              </div>
            </a>
          ))}
        </div>
      </Block>
      {cityOpen && <CityDialog onClose={() => setCityOpen(false)} />}
    </div>
  );
}

function CityDialog({ onClose }: { onClose: () => void }) {
  const tr = useTr();
  const qc = useQueryClient();
  const cities = useCities(true);
  const [q, setQ] = useState('');
  const pick = async (city: string | null) => {
    try {
      await api.put('/api/me/city', { city });
      await Promise.all([qc.invalidateQueries({ queryKey: ['concerts'] }), qc.invalidateQueries({ queryKey: ['integrations'] })]);
      useUI.getState().toast(city ? tr('Город сохранён', 'City saved') : tr('Город убран', 'City removed'), 'success');
      onClose();
    } catch (e: any) { useUI.getState().toast(e.message, 'error'); }
  };
  const list = (cities.data ?? []).filter((c) => !q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Modal open onClose={onClose} title={tr('Ваш город', 'Your city')}>
      <M3eFormField variant="outlined" className="w-full block">
        <span slot="label">{tr('Поиск', 'Search')}</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </M3eFormField>
      <div className="max-h-80 overflow-auto mt-2">
        {list.map((c) => <button key={c.slug} className="block w-full text-left px-3 py-2.5 rounded-xl hover:bg-surface-container-high md-body-lg" onClick={() => void pick(c.slug)}>{c.name}</button>)}
      </div>
      <div className="flex justify-end gap-2 pt-3">
        <M3eButton variant="text" onClick={() => void pick(null)}>{tr('Не искать', "Don't search")}</M3eButton>
        <M3eButton variant="text" onClick={onClose}>{tr('Отмена', 'Cancel')}</M3eButton>
      </div>
    </Modal>
  );
}

/** What plays now, in the listener's Telegram profile: linking (phone → code → cloud password), on/off, unlink. */
function TgProfileBlock({ state }: { state?: { available: boolean; linked: { username: string | null; enabled: boolean } | null } }) {
  const tr = useTr();
  const qc = useQueryClient();
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const reload = () => qc.invalidateQueries({ queryKey: ['integrations'] });
  const go = async (work: () => Promise<unknown>) => {
    setBusy(true);
    try { await work(); } catch (e: any) { useUI.getState().toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const next = () => go(async () => {
    const v = value.trim();
    if (step === 1) { await api.post('/api/me/tg-profile/start', { phone: v }); setStep(2); setValue(''); return; }
    if (step === 2) {
      const r = await api.post<{ needPassword: boolean }>('/api/me/tg-profile/code', { code: v });
      setValue('');
      if (r.needPassword) { setStep(3); return; }
    } else await api.post('/api/me/tg-profile/password', { password: value });
    setStep(0); setValue('');
    useUI.getState().toast(tr('Готово — теперь в Telegram видно, что вы слушаете', 'Done — Telegram now shows what you listen to'), 'success');
    await reload();
  });
  const linked = state?.linked;
  return (
    <Block icon="badge" title={tr('Статус в Telegram', 'Telegram status')}>
      <p className="md-body-md text-on-surface-variant mb-3">
        {!state?.available ? tr('Администратор ещё не подключил Telegram API', "The admin hasn't connected the Telegram API yet")
          : linked ? tr(`В описании профиля${linked.username ? ` @${linked.username}` : ''} показывается, что играет: «🎧 Исполнитель — Трек». Когда музыка стоит, возвращается ваше описание.`, `Your profile${linked.username ? ` @${linked.username}` : ''} shows what plays: “🎧 Artist — Track”. When the music stops, your own bio comes back.`)
            : tr('В описании вашего профиля Telegram будет видно, что вы сейчас слушаете. Нужно один раз войти: номер, код из Telegram и облачный пароль, если он есть. Вход используется только для этой строчки.', 'Your Telegram bio will show what you are listening to. Sign in once: your number, the code from Telegram and the cloud password if you have one. It is used only for that line.')}
      </p>
      {linked ? (
        <div className="flex flex-wrap gap-2">
          <M3eButton variant="tonal" disabled={busy || undefined} onClick={() => void go(async () => { await api.put('/api/me/tg-profile', { enabled: !linked.enabled }); await reload(); })}>{linked.enabled ? tr('Не показывать', 'Hide') : tr('Показывать', 'Show')}</M3eButton>
          <M3eButton variant="outlined" disabled={busy || undefined} onClick={() => void go(async () => { await api.del('/api/me/tg-profile'); await reload(); })}>{tr('Отвязать', 'Unlink')}</M3eButton>
        </div>
      ) : step === 0 ? (
        <M3eButton variant="filled" disabled={!state?.available || undefined} onClick={() => { setStep(1); setValue(''); }}>{tr('Подключить', 'Connect')}</M3eButton>
      ) : (
        <div>
          <M3eFormField variant="outlined" className="w-full block">
            <span slot="label">{step === 1 ? tr('Номер телефона (+7…)', 'Phone number (+…)') : step === 2 ? tr('Код из Telegram', 'Code from Telegram') : tr('Облачный пароль', 'Cloud password')}</span>
            <input type={step === 3 ? 'password' : 'text'} inputMode={step === 2 ? 'numeric' : undefined} value={value} autoFocus onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && value.trim()) void next(); }} />
          </M3eFormField>
          {step === 2 && <p className="md-body-sm text-on-surface-variant mt-1">{tr('Код пришёл в Telegram (чат «Telegram»). Не пересылайте его никому.', 'The code came to Telegram (the “Telegram” chat). Never forward it.')}</p>}
          <div className="flex gap-2 mt-3">
            <M3eButton variant="text" onClick={() => { setStep(0); setValue(''); }}>{tr('Отмена', 'Cancel')}</M3eButton>
            <M3eButton variant="filled" disabled={!value.trim() || busy || undefined} onClick={() => void next()}>{step === 1 ? tr('Получить код', 'Get the code') : tr('Войти', 'Sign in')}</M3eButton>
          </div>
        </div>
      )}
    </Block>
  );
}
