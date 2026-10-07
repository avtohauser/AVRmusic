// Invitations that just came (to play "guess the melody", to listen together): a card over the page —
// and a browser notification when notifications are allowed — checked every 20 s while the site is open.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { M3eButton, M3eIconButton } from '@/md';
import { api } from '@/lib/api';
import { joinJam } from '@/lib/jam';
import { useTr, type Share } from '@/lib/social';
import { useAuth } from '@/stores/auth';

export function InviteBanner() {
  const tr = useTr();
  const nav = useNavigate();
  const user = useAuth((s) => s.user);
  const [invite, setInvite] = useState<Share | null>(null);
  const since = useRef(new Date().toISOString());
  useEffect(() => {
    if (!user) return;
    let alive = true;
    const tick = async () => {
      if (document.visibilityState !== 'visible') return;
      const fresh = await api.get<Share[]>(`/api/shares?after=${encodeURIComponent(since.current)}`).catch(() => null);
      if (!alive || !fresh?.length) return;
      since.current = fresh[0].createdAt;
      const inv = fresh.find((s) => s.kind === 'game' || s.kind === 'jam');
      if (!inv) return;
      setInvite(inv);
      const who = inv.from?.displayName ?? tr('Друг', 'A friend');
      const text = inv.kind === 'game' ? tr(`${who} зовёт в «Угадай мелодию»`, `${who} invites you to “Guess the song”`) : tr(`${who} зовёт слушать вместе`, `${who} invites you to listen together`);
      if ('Notification' in window && Notification.permission === 'granted' && !document.hasFocus()) {
        const n = new Notification('avr music', { body: text, icon: '/icons/icon-192.png', tag: inv.id });
        n.onclick = () => { window.focus(); open(inv); n.close(); };
      }
    };
    const t = setInterval(() => void tick(), 20_000);
    return () => { alive = false; clearInterval(t); };
  }, [user?.id]);
  useEffect(() => { if (!invite) return; const t = setTimeout(() => setInvite(null), 60_000); return () => clearTimeout(t); }, [invite?.id]);
  const open = (s: Share) => { setInvite(null); if (s.kind === 'game') nav(`/game?join=${s.refId}`); else void joinJam(s.refId); };
  if (!invite) return null;
  const who = invite.from?.displayName ?? tr('Друг', 'A friend');
  const game = invite.kind === 'game';
  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[80] w-[min(560px,calc(100vw-24px))] flex items-center gap-3 pl-4 pr-1 py-2 rounded-3xl bg-tertiary-container text-on-tertiary-container elev-3 fade-in"
      style={{ top: 'calc(var(--safe-t) + 12px)' }}>
      <m3e-icon variant="rounded" name={game ? 'quiz' : 'groups'} />
      <span className="flex-1 md-body-md">{game ? tr(`${who} зовёт в «Угадай мелодию»`, `${who} invites you to “Guess the song”`) : tr(`${who} зовёт слушать вместе`, `${who} invites you to listen together`)}</span>
      <M3eButton variant="filled" onClick={() => open(invite)}>{game ? tr('Играть', 'Play') : tr('Войти', 'Join')}</M3eButton>
      <M3eIconButton aria-label={tr('Закрыть', 'Close')} onClick={() => setInvite(null)}><m3e-icon variant="rounded" name="close" /></M3eIconButton>
    </div>
  );
}
