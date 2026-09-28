import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Music4 } from 'lucide-react';
import { useAuth } from '@/stores/auth';
import { useLikes } from '@/stores/likes';
import { useT } from '@/lib/i18n';

export default function Auth({ mode }: { mode: 'login' | 'register' }) {
  const user = useAuth((s) => s.user);
  const info = useAuth((s) => s.info);
  const login = useAuth((s) => s.login);
  const register = useAuth((s) => s.register);
  const t = useT();
  const nav = useNavigate();
  const loc = useLocation();
  const [form, setForm] = useState({ login: '', email: '', username: '', password: '', displayName: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;
  const setup = !!info?.needsSetup;
  const regAllowed = info?.allowRegistration || setup;
  const isRegister = mode === 'register' || (setup && mode === 'login');
  const f = (k: keyof typeof form) => ({ value: form[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value }) });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      if (isRegister) await register({ email: form.email, username: form.username, password: form.password, displayName: form.displayName || undefined });
      else await login(form.login, form.password);
      useLikes.getState().load();
      nav((loc.state as any)?.from ?? '/', { replace: true });
    } catch (e: any) { setErr(e?.message ?? t('error')); } finally { setBusy(false); }
  };

  return (
    <div className="min-h-full flex items-center justify-center p-4 pt-10">
      <form onSubmit={submit} className="card w-full max-w-sm p-6 md:p-8 space-y-4 fade-in">
        <div className="flex items-center gap-2 font-extrabold text-xl"><span className="w-9 h-9 rounded-lg accent-gradient flex items-center justify-center text-white"><Music4 size={18} /></span><span className="text-gradient">AVRmusic</span></div>
        <div>
          <h1 className="text-2xl font-bold">{setup ? t('setupTitle') : isRegister ? t('createAccount') : t('login')}</h1>
          {setup && <p className="text-sm text-muted mt-1">{t('setupHint')}</p>}
        </div>
        {isRegister ? (
          <>
            <div><label className="label">{t('email')}</label><input className="input" type="email" required autoComplete="email" {...f('email')} /></div>
            <div><label className="label">{t('username')}</label><input className="input" required minLength={3} maxLength={32} pattern="[a-zA-Z0-9_.\-]+" autoComplete="username" {...f('username')} /></div>
            <div><label className="label">{t('displayName')}</label><input className="input" maxLength={60} {...f('displayName')} /></div>
          </>
        ) : (
          <div><label className="label">{t('loginOrEmail')}</label><input className="input" required autoComplete="username" autoFocus {...f('login')} /></div>
        )}
        <div><label className="label">{t('password')}</label><input className="input" type="password" required minLength={6} autoComplete={isRegister ? 'new-password' : 'current-password'} {...f('password')} /></div>
        {err && <p className="text-sm text-red-400">{err}</p>}
        <button className="btn btn-accent w-full" disabled={busy} type="submit">{isRegister ? t('createAccount') : t('login')}</button>
        {!setup && (
          <p className="text-sm text-muted text-center">
            {isRegister ? <>{t('haveAccount')} <Link to="/login" className="text-fg font-semibold hover:underline">{t('login')}</Link></> : regAllowed ? <>{t('noAccount')} <Link to="/register" className="text-fg font-semibold hover:underline">{t('register')}</Link></> : null}
          </p>
        )}
      </form>
    </div>
  );
}
