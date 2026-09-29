import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { M3eButton, M3eButtonSegment, M3eFormField, M3eSegmentedButton, M3eSwitch, M3eThemeIcon } from '@/md';
import { useAuth } from '@/stores/auth';
import { useUI } from '@/stores/ui';
import { useLikes } from '@/stores/likes';
import { PRESET_COLORS, useTheme } from '@/stores/theme';
import { useI18n, useT } from '@/lib/i18n';
import { api } from '@/lib/api';
import { fmtDurationLong, fmtNumber } from '@/lib/format';
import { Cover } from '@/components/Cover';
import { AvatarEditor } from '@/components/AvatarEditor';
import { Shelf } from '@/components/Shelf';
import { ArtistCard, TrackCard } from '@/components/Cards';
import type { ArtistSummary, Track, User } from '@avrmusic/shared';

const VARIANTS: Array<[string, string]> = [['expressive', 'Expressive'], ['vibrant', 'Vibrant'], ['tonal-spot', 'Tonal Spot'], ['fidelity', 'Fidelity'], ['content', 'Content'], ['rainbow', 'Rainbow'], ['fruit-salad', 'Fruit Salad'], ['neutral', 'Neutral'], ['monochrome', 'Monochrome']];

/** Material You theme controls: seed colour, scheme variant, light/dark, contrast, colour from cover art. */
function ThemeSettings() {
  const th = useTheme();
  const t = useT();
  const lang = useI18n((s) => s.lang);
  const setLang = useI18n((s) => s.setLang);
  return (
    <section className="surface-low rounded-[28px] p-5 space-y-5">
      <h2 className="md-title-lg emph flex items-center gap-2"><m3e-icon variant="rounded" name="palette" />{t('theme')}</h2>
      <div>
        <div className="md-label-lg muted mb-2">{t('scheme')}</div>
        <M3eSegmentedButton onChange={(e: Event) => { const v = (e.target as any)?.value; if (v) th.set({ scheme: v }); }}>
          <M3eButtonSegment value="auto" checked={th.scheme === 'auto' || undefined}><m3e-icon variant="rounded" slot="icon" name="stars" />{t('auto')}</M3eButtonSegment>
          <M3eButtonSegment value="light" checked={th.scheme === 'light' || undefined}><m3e-icon variant="rounded" slot="icon" name="light_mode" />{t('light')}</M3eButtonSegment>
          <M3eButtonSegment value="dark" checked={th.scheme === 'dark' || undefined}><m3e-icon variant="rounded" slot="icon" name="dark_mode" />{t('dark')}</M3eButtonSegment>
        </M3eSegmentedButton>
      </div>
      <label className="flex items-center justify-between gap-3 md-body-lg">
        <span className="flex items-center gap-2"><m3e-icon variant="rounded" name="format_color_fill" />{t('colorFromCover')}</span>
        <M3eSwitch checked={th.fromCover || undefined} icons="selected" onChange={(e: Event) => th.set({ fromCover: !!(e.target as any).checked })} />
      </label>
      <div>
        <div className="md-label-lg muted mb-2">{t('seedColor')}</div>
        <div className="flex flex-wrap gap-2 items-center">
          {PRESET_COLORS.map((c) => (
            <button key={c} className={`rounded-full p-0.5 spring ${th.color === c ? 'ring-2 ring-primary' : ''}`} onClick={() => th.set({ color: c, fromCover: false })} aria-label={c}>
              <M3eThemeIcon color={c} variant={th.variant} scheme={th.scheme} style={{ ['--m3e-theme-icon-size' as any]: '36px' }} />
            </button>
          ))}
          <label className="w-10 h-10 rounded-full overflow-hidden border border-outline-variant cursor-pointer flex items-center justify-center bg-surface-container-highest" title="custom">
            <input type="color" value={th.color} onChange={(e) => th.set({ color: e.target.value, fromCover: false })} className="w-14 h-14 -m-2 cursor-pointer" />
          </label>
        </div>
      </div>
      <div>
        <div className="md-label-lg muted mb-2">{t('variant')}</div>
        <div className="flex flex-wrap gap-2">
          {VARIANTS.map(([v, label]) => <M3eButton key={v} variant={th.variant === v ? 'filled' : 'tonal'} size="small" onClick={() => th.set({ variant: v as any })}>{label}</M3eButton>)}
        </div>
      </div>
      <div>
        <div className="md-label-lg muted mb-2">{t('contrast')}</div>
        <M3eSegmentedButton onChange={(e: Event) => { const v = (e.target as any)?.value; if (v) th.set({ contrast: v }); }}>
          <M3eButtonSegment value="standard" checked={th.contrast === 'standard' || undefined}>{t('standard')}</M3eButtonSegment>
          <M3eButtonSegment value="medium" checked={th.contrast === 'medium' || undefined}>{t('medium')}</M3eButtonSegment>
          <M3eButtonSegment value="high" checked={th.contrast === 'high' || undefined}>{t('high')}</M3eButtonSegment>
        </M3eSegmentedButton>
      </div>
      <div>
        <div className="md-label-lg muted mb-2">{t('language')}</div>
        <M3eSegmentedButton onChange={(e: Event) => { const v = (e.target as any)?.value; if (v) setLang(v); }}>
          <M3eButtonSegment value="ru" checked={lang === 'ru' || undefined}><m3e-icon variant="rounded" slot="icon" name="translate" />Русский</M3eButtonSegment>
          <M3eButtonSegment value="en" checked={lang === 'en' || undefined}>English</M3eButtonSegment>
        </M3eSegmentedButton>
      </div>
    </section>
  );
}

export default function Profile() {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const setUser = useAuth((s) => s.setUser);
  const installPrompt = useUI((s) => s.installPrompt);
  const toast = useUI((s) => s.toast);
  const lang = useI18n((s) => s.lang);
  const t = useT();
  const nav = useNavigate();
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [name, setName] = useState(user?.displayName ?? '');
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const { data: stats } = useQuery({ queryKey: ['me', 'stats', user?.id], queryFn: () => api.get<{ plays: number; msListened: number; topTracks: Track[]; topArtists: ArtistSummary[]; topGenres: Array<{ name: string; n: number }> }>('/api/me/stats'), enabled: !!user });

  if (!user) {
    return <div className="page pt-6 max-w-xl space-y-4"><ThemeSettings />{installPrompt && <M3eButton variant="tonal" onClick={() => installPrompt.prompt()}><m3e-icon variant="rounded" slot="icon" name="download_for_offline" />{t('installApp')}</M3eButton>}<M3eButton variant="filled" size="large" className="w-full" href="/login"><m3e-icon variant="rounded" slot="icon" name="login" />{t('login')}</M3eButton></div>;
  }

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try { setUser(await api.patch<User>('/api/auth/me', { displayName: name })); toast(t('profileSaved'), 'success'); } catch (err: any) { toast(err.message, 'error'); }
  };
  const changePw = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await api.post('/api/auth/me/password', { oldPassword: oldPw, newPassword: newPw }); setOldPw(''); setNewPw(''); toast(t('passwordChanged'), 'success'); } catch (err: any) { toast(err.message, 'error'); }
  };

  return (
    <div className="page pt-4">
      <div className="flex items-center gap-5 mb-8">
        <button className="relative group shrink-0" onClick={() => setAvatarOpen(true)} title={t('changePhoto')} aria-label={t('changePhoto')}>
          <Cover src={user.avatarUrl} round kind="artist" className="w-24 h-24 md:w-32 md:h-32 spring group-hover:scale-105" />
          <span className="absolute right-0 bottom-0 w-9 h-9 rounded-full bg-primary text-on-primary flex items-center justify-center elev-2 spring group-hover:rotate-12"><m3e-icon variant="rounded" name="photo_camera" style={{ ['--m3e-icon-size' as any]: '20px' }} /></span>
        </button>
        <AvatarEditor open={avatarOpen} onClose={() => setAvatarOpen(false)} />
        <div className="min-w-0">
          <div className="md-label-lg muted uppercase tracking-wider">{t('profile')}{user.role === 'admin' && <span className="ml-2 inline-flex items-center gap-1 text-primary"><m3e-icon variant="rounded" name="shield" style={{ ['--m3e-icon-size' as any]: '14px' }} />admin</span>}</div>
          <h1 className="emph line-2" style={{ fontSize: 'clamp(24px, 6.4vw, 45px)', lineHeight: 1.15, hyphens: 'auto', overflowWrap: 'break-word' }}>{user.displayName}</h1>
          <div className="md-body-md muted">@{user.username} · {user.email}</div>
        </div>
        <M3eButton variant="tonal" className="ml-auto shrink-0" onClick={async () => { await logout(); useLikes.getState().clear(); nav('/'); }}><m3e-icon variant="rounded" slot="icon" name="logout" /><span className="hidden sm:inline">{t('logout')}</span></M3eButton>
      </div>

      {user.role === 'admin' && (
        <Link to="/admin" className="mb-4 flex items-center gap-4 rounded-[28px] p-4 bg-primary-container text-on-primary-container spring hover:rounded-[36px] state-layer">
          <span className="w-12 h-12 rounded-[16px] bg-primary text-on-primary flex items-center justify-center shrink-0"><m3e-icon variant="rounded" name="shield" filled /></span>
          <span className="min-w-0 flex-1"><span className="block md-title-md emph">{t('admin')}</span><span className="block md-body-sm opacity-80">{t('adminHint')}</span></span>
          <m3e-icon variant="rounded" name="chevron_right" />
        </Link>
      )}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <div className="surface-low rounded-[24px] p-4"><div className="md-label-md muted uppercase">{t('listened')}</div><div className="md-headline-md emph">{fmtDurationLong(stats.msListened, lang)}</div></div>
          <div className="surface-low rounded-[24px] p-4"><div className="md-label-md muted uppercase">{t('history')}</div><div className="md-headline-md emph">{fmtNumber(stats.plays, lang)}</div></div>
          <Link to="/history" className="surface-low rounded-[24px] hover:rounded-[32px] spring p-4 flex items-center gap-3 state-layer"><m3e-icon variant="rounded" name="history" style={{ color: 'var(--md-sys-color-primary)' }} /><span className="md-title-sm">{t('history')}</span></Link>
          <Link to="/downloads" className="surface-low rounded-[24px] hover:rounded-[32px] spring p-4 flex items-center gap-3 state-layer"><m3e-icon variant="rounded" name="offline_pin" style={{ color: 'var(--md-sys-color-tertiary)' }} /><span className="md-title-sm">{t('downloads')}</span></Link>
        </div>
      )}
      {stats && stats.topTracks.length > 0 && <Shelf title={t('topTracks')}>{stats.topTracks.map((tr, i) => <TrackCard key={tr.id} track={tr} list={stats.topTracks} index={i} />)}</Shelf>}
      {stats && stats.topArtists.length > 0 && <Shelf title={t('topArtists')}>{stats.topArtists.map((a) => <ArtistCard key={a.id} artist={a} />)}</Shelf>}
      {stats && stats.topGenres.length > 0 && <div className="mb-8"><h2 className="md-headline-sm emph mb-3">{t('topGenres')}</h2><div className="flex flex-wrap gap-2">{stats.topGenres.map((g) => <span key={g.name} className="px-3 py-1.5 rounded-full bg-secondary-container text-on-secondary-container md-label-lg">{g.name} · {g.n}</span>)}</div></div>}

      <div className="grid md:grid-cols-2 gap-4 max-w-5xl">
        <ThemeSettings />
        <section className="surface-low rounded-[28px] p-5 space-y-6">
          <form onSubmit={saveProfile} className="space-y-3">
            <h2 className="md-title-lg emph">{t('profile')}</h2>
            <M3eFormField variant="outlined" className="w-full block"><span slot="label">{t('displayName')}</span><input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /></M3eFormField>
            <M3eButton variant="filled" type="submit"><m3e-icon variant="rounded" slot="icon" name="check" />{t('save')}</M3eButton>
          </form>
          <form onSubmit={changePw} className="space-y-3">
            <h2 className="md-title-md emph flex items-center gap-2"><m3e-icon variant="rounded" name="key" />{t('changePassword')}</h2>
            <M3eFormField variant="outlined" className="w-full block"><span slot="label">{t('oldPassword')}</span><input type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} autoComplete="current-password" /></M3eFormField>
            <M3eFormField variant="outlined" className="w-full block"><span slot="label">{t('newPassword')}</span><input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" minLength={6} /></M3eFormField>
            <M3eButton variant="tonal" type="submit" disabled={!oldPw || newPw.length < 6 || undefined}>{t('changePassword')}</M3eButton>
          </form>
          {installPrompt && <M3eButton variant="outlined" className="w-full" onClick={() => installPrompt.prompt()}><m3e-icon variant="rounded" slot="icon" name="download_for_offline" />{t('installApp')}</M3eButton>}
        </section>
      </div>
    </div>
  );
}
