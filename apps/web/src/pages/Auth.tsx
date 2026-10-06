import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { M3eButton, M3eFormField } from '@/md';
import { Mascot } from '@/components/Mascot';
import { Wordmark } from '@/components/Brand';
import { useAuth } from '@/stores/auth';
import { useLikes } from '@/stores/likes';
import { useT } from '@/lib/i18n';
import { FlowText } from '@/components/FlowText';

export default function Auth({ mode }: { mode: 'login' | 'register' }) {
  const user = useAuth((s) => s.user);
  const info = useAuth((s) => s.info);
  const login = useAuth((s) => s.login);
  const register = useAuth((s) => s.register);
  const t = useT();
  const nav = useNavigate();
  const loc = useLocation();
  const [params] = useSearchParams();
  // Invite links look like /register?invite=XXXX-XXXX
  const [form, setForm] = useState({ login: '', email: '', username: '', password: '', displayName: '', inviteCode: params.get('invite') ?? '' });
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
      if (isRegister) await register({ email: form.email, username: form.username, password: form.password, displayName: form.displayName || undefined, inviteCode: form.inviteCode || undefined });
      else await login(form.login, form.password);
      useLikes.getState().load();
      nav((loc.state as any)?.from ?? '/', { replace: true });
    } catch (e: any) { setErr(e?.message ?? t('error')); } finally { setBusy(false); }
  };

  const Field = ({ label, k, ...rest }: { label: string; k: keyof typeof form } & React.InputHTMLAttributes<HTMLInputElement>) => (
    <M3eFormField variant="outlined" className="w-full block"><span slot="label">{label}</span><input {...f(k)} {...rest} /></M3eFormField>
  );

  return (
    <div className="auth-shell text-on-surface">
      <form onSubmit={submit} className="surface-low rounded-[32px] w-full max-w-[400px] p-5 sm:p-7 space-y-3 fade-in elev-2">
        <div className="flex items-center gap-3"><Mascot mood={busy ? 'think' : 'idle'} waves className="w-14 h-10" /><Wordmark className="text-[32px]" /></div>
        <div>
          <FlowText as="h1" text={setup ? t('setupTitle') : isRegister ? t('createAccount') : t('login')} className="md-headline-sm emph" />
          {setup && <p className="md-body-md muted mt-1">{t('setupHint')}</p>}
        </div>
        {isRegister ? (
          <>
            <M3eFormField variant="outlined" className="w-full block"><span slot="label">{t('email')}</span><input type="email" required autoComplete="email" {...f('email')} /></M3eFormField>
            <M3eFormField variant="outlined" className="w-full block"><span slot="label">{t('username')}</span><input required minLength={3} maxLength={32} pattern="[a-zA-Z0-9_.\-]+" autoComplete="username" {...f('username')} /></M3eFormField>
            <M3eFormField variant="outlined" className="w-full block"><span slot="label">{t('displayName')}</span><input maxLength={60} {...f('displayName')} /></M3eFormField>
            {info?.inviteRequired && <M3eFormField variant="outlined" className="w-full block"><span slot="label">{t('inviteCode')}</span><input required autoCapitalize="characters" spellCheck={false} {...f('inviteCode')} /><span slot="hint">{t('inviteFromAdmin')}</span></M3eFormField>}
          </>
        ) : (
          <M3eFormField variant="outlined" className="w-full block"><span slot="label">{t('loginOrEmail')}</span><input required autoComplete="username" autoFocus {...f('login')} /></M3eFormField>
        )}
        <M3eFormField variant="outlined" className="w-full block"><span slot="label">{t('password')}</span><input type="password" required minLength={6} autoComplete={isRegister ? 'new-password' : 'current-password'} {...f('password')} /></M3eFormField>
        {err && <p className="md-body-md text-error">{err}</p>}
        <M3eButton variant="filled" size="large" className="w-full" disabled={busy || undefined} type="submit">{isRegister ? t('createAccount') : t('login')}</M3eButton>
        {!setup && (
          <p className="md-body-md muted text-center">
            {isRegister ? <>{t('haveAccount')} <Link to="/login" className="text-primary md-label-lg hover:underline">{t('login')}</Link></> : regAllowed ? <>{t('noAccount')} <Link to="/register" className="text-primary md-label-lg hover:underline">{t('register')}</Link></> : null}
          </p>
        )}
        <span className="hidden">{String(Field)}</span>
      </form>
    </div>
  );
}
