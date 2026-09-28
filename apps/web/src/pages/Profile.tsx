import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Clock, Download, LogOut, Moon, Sun, Smartphone, ShieldCheck, KeyRound } from 'lucide-react';
import { useAuth } from '@/stores/auth';
import { useUI } from '@/stores/ui';
import { useLikes } from '@/stores/likes';
import { useI18n, useT } from '@/lib/i18n';
import { api } from '@/lib/api';
import { fmtDurationLong, fmtNumber } from '@/lib/format';
import { Cover } from '@/components/Cover';
import { Shelf } from '@/components/Shelf';
import { ArtistCard, TrackCard } from '@/components/Cards';
import type { ArtistSummary, Track, User } from '@avrmusic/shared';

export default function Profile() {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const setUser = useAuth((s) => s.setUser);
  const theme = useUI((s) => s.theme);
  const setTheme = useUI((s) => s.setTheme);
  const installPrompt = useUI((s) => s.installPrompt);
  const toast = useUI((s) => s.toast);
  const lang = useI18n((s) => s.lang);
  const setLang = useI18n((s) => s.setLang);
  const t = useT();
  const nav = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(user?.displayName ?? '');
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const { data: stats } = useQuery({ queryKey: ['me', 'stats', user?.id], queryFn: () => api.get<{ plays: number; msListened: number; topTracks: Track[]; topArtists: ArtistSummary[]; topGenres: Array<{ name: string; n: number }> }>('/api/me/stats'), enabled: !!user });

  const settings = (
    <section className="card p-5 space-y-5">
      <h2 className="font-bold text-lg">{t('settings')}</h2>
      <div className="flex items-center justify-between"><span>{t('theme')}</span>
        <div className="flex gap-1">
          <button className="chip" data-active={theme === 'dark'} onClick={() => setTheme('dark')}><Moon size={14} className="mr-1" />{t('dark')}</button>
          <button className="chip" data-active={theme === 'light'} onClick={() => setTheme('light')}><Sun size={14} className="mr-1" />{t('light')}</button>
        </div>
      </div>
      <div className="flex items-center justify-between"><span>{t('language')}</span>
        <div className="flex gap-1"><button className="chip" data-active={lang === 'ru'} onClick={() => setLang('ru')}>Русский</button><button className="chip" data-active={lang === 'en'} onClick={() => setLang('en')}>English</button></div>
      </div>
      {installPrompt && <button className="btn btn-outline w-full" onClick={() => installPrompt.prompt()}><Smartphone size={16} />{t('installApp')}</button>}
    </section>
  );

  if (!user) {
    return <div className="page pt-6 max-w-xl space-y-4">{settings}<Link to="/login" className="btn btn-primary w-full">{t('login')}</Link></div>;
  }

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try { setUser(await api.patch<User>('/api/auth/me', { displayName: name })); toast(t('profileSaved'), 'success'); } catch (err: any) { toast(err.message, 'error'); }
  };
  const changePw = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await api.post('/api/auth/me/password', { oldPassword: oldPw, newPassword: newPw }); setOldPw(''); setNewPw(''); toast(t('passwordChanged'), 'success'); } catch (err: any) { toast(err.message, 'error'); }
  };
  const uploadAvatar = async (f: File) => {
    const fd = new FormData(); fd.append('file', f);
    try { setUser(await api.upload<User>('/api/me/avatar', fd)); toast(t('saved'), 'success'); } catch (err: any) { toast(err.message, 'error'); }
  };

  return (
    <div className="page pt-4">
      <div className="flex items-center gap-5 mb-8">
        <button className="relative group" onClick={() => fileRef.current?.click()} title={t('avatar')}>
          <Cover src={user.avatarUrl} round kind="artist" className="w-24 h-24 md:w-32 md:h-32 shadow-xl" />
          <span className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-xs font-semibold">{t('avatar')}</span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && uploadAvatar(e.target.files[0])} />
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wider text-muted">{t('profile')}{user.role === 'admin' && <span className="ml-2 inline-flex items-center gap-1 text-accent-2"><ShieldCheck size={12} />admin</span>}</div>
          <h1 className="text-3xl md:text-4xl font-extrabold line-clamp-1">{user.displayName}</h1>
          <div className="text-muted">@{user.username} · {user.email}</div>
        </div>
        <button className="btn btn-ghost ml-auto !h-9 shrink-0" onClick={async () => { await logout(); useLikes.getState().clear(); nav('/'); }}><LogOut size={16} /><span className="hidden sm:inline">{t('logout')}</span></button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <div className="card p-4"><div className="text-muted text-xs uppercase">{t('listened')}</div><div className="text-2xl font-extrabold">{fmtDurationLong(stats.msListened, lang)}</div></div>
          <div className="card p-4"><div className="text-muted text-xs uppercase">{t('history')}</div><div className="text-2xl font-extrabold">{fmtNumber(stats.plays, lang)}</div></div>
          <Link to="/history" className="card card-hover p-4 flex items-center gap-3"><Clock className="text-accent-2" /><span className="font-semibold">{t('history')}</span></Link>
          <Link to="/downloads" className="card card-hover p-4 flex items-center gap-3"><Download className="text-emerald-400" /><span className="font-semibold">{t('downloads')}</span></Link>
        </div>
      )}
      {stats && stats.topTracks.length > 0 && <Shelf title={t('topTracks')}>{stats.topTracks.map((tr, i) => <TrackCard key={tr.id} track={tr} list={stats.topTracks} index={i} />)}</Shelf>}
      {stats && stats.topArtists.length > 0 && <Shelf title={t('topArtists')}>{stats.topArtists.map((a) => <ArtistCard key={a.id} artist={a} />)}</Shelf>}
      {stats && stats.topGenres.length > 0 && <div className="mb-8"><h2 className="text-xl font-bold mb-3">{t('topGenres')}</h2><div className="flex flex-wrap gap-2">{stats.topGenres.map((g) => <span key={g.name} className="chip">{g.name} · {g.n}</span>)}</div></div>}

      <div className="grid md:grid-cols-2 gap-4 max-w-4xl">
        {settings}
        <section className="card p-5 space-y-5">
          <form onSubmit={saveProfile} className="space-y-3">
            <h2 className="font-bold text-lg">{t('profile')}</h2>
            <div><label className="label">{t('displayName')}</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /></div>
            <button className="btn btn-primary !h-9" type="submit">{t('save')}</button>
          </form>
          <form onSubmit={changePw} className="space-y-3">
            <h2 className="font-bold flex items-center gap-2"><KeyRound size={16} />{t('changePassword')}</h2>
            <input className="input" type="password" placeholder={t('oldPassword')} value={oldPw} onChange={(e) => setOldPw(e.target.value)} autoComplete="current-password" />
            <input className="input" type="password" placeholder={t('newPassword')} value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" minLength={6} />
            <button className="btn btn-outline !h-9" type="submit" disabled={!oldPw || newPw.length < 6}>{t('changePassword')}</button>
          </form>
        </section>
      </div>
    </div>
  );
}
