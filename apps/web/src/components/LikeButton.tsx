import { useId, useRef, useState } from 'react';
import { M3eIconButton } from '@/md';
import { useLikePrefs, useLikes } from '@/stores/likes';
import { useAuth } from '@/stores/auth';
import { useUI } from '@/stores/ui';
import { useT } from '@/lib/i18n';
import { useTr } from '@/lib/social';

interface Props { type: 'track' | 'album' | 'artist' | 'playlist'; id: string; size?: number; className?: string; alwaysVisible?: boolean; buttonSize?: 'small' | 'medium' | 'large' }

/** How long a press has to last to count as the long one (ms). */
const LONG_PRESS = 450;

/** The avr star with its pink → violet gradient: a superliked track. */
export function SuperStar({ className = 'w-6 h-6', pop = 0 }: { className?: string; pop?: number }) {
  const id = `s${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <svg key={pop} viewBox="0 0 100 100" className={`${className} ${pop ? 'super-pop' : ''}`} aria-hidden="true">
      <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#F2A5C3" /><stop offset="1" stopColor="#5A4FC8" /></linearGradient></defs>
      <path fill={`url(#${id})`} d="M50 2C53 30 70 47 98 50C70 53 53 70 50 98C47 70 30 53 2 50C30 47 47 30 50 2Z" />
    </svg>
  );
}

/**
 * The heart. On a track a long press (or a right click) gives a superlike — the heart turns into the avr
 * star and the track goes to Superlikes as well; the settings can swap what the tap and the long press do.
 */
export function LikeButton({ type, id, className = '', alwaysVisible, buttonSize = 'small' }: Props) {
  const liked = useLikes((s) => s.ids[type].has(id));
  const starred = useLikes((s) => type === 'track' && s.supers.has(id));
  const toggle = useLikes((s) => s.toggle);
  const toggleSuper = useLikes((s) => s.toggleSuper);
  const prefs = useLikePrefs();
  const user = useAuth((s) => s.user);
  const toast = useUI((s) => s.toast);
  const t = useT();
  const tr = useTr();
  const timer = useRef<number | undefined>(undefined);
  const long = useRef(false);
  const [pop, setPop] = useState(0);
  const canStar = type === 'track' && prefs.superOn;
  const onTap: 'like' | 'super' = canStar && prefs.tap === 'super' ? 'super' : 'like';
  const onLong: 'like' | 'super' = onTap === 'super' ? 'like' : 'super';

  const act = (what: 'like' | 'super') => {
    if (!user) { toast(t('signInToListen'), 'error'); return; }
    if (what === 'super') {
      toggleSuper(id)
        .then((on) => { if (on) { setPop((n) => n + 1); toast(tr('★ Суперлайк — трек в «Суперлайках»', '★ Superliked — the track is in Superlikes'), 'success'); } })
        .catch(() => toast(t('error'), 'error'));
    } else toggle(type, id).catch(() => toast(t('error'), 'error'));
  };
  const cancel = () => { window.clearTimeout(timer.current); timer.current = undefined; };
  const label = starred && prefs.superOn ? tr('Убрать суперлайк', 'Remove the superlike') : liked ? t('unlike') : t('like');
  const hint = canStar ? ` · ${onLong === 'super' ? tr('долгое нажатие — суперлайк', 'long press — superlike') : tr('долгое нажатие — обычный лайк', 'long press — a plain like')}` : '';

  return (
    <span
      className="contents"
      onPointerDown={(e) => {
        long.current = false;
        if (!canStar || e.button !== 0) return;
        cancel();
        timer.current = window.setTimeout(() => { long.current = true; timer.current = undefined; navigator.vibrate?.(15); act(onLong); }, LONG_PRESS);
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => {
        if (!canStar) return;
        // a right click, or the long press the browser also reports: the long action, once
        e.preventDefault(); e.stopPropagation();
        cancel();
        if (!long.current) { long.current = true; act(onLong); }
      }}
    >
      <M3eIconButton
        aria-label={label}
        title={label + hint}
        className={`${liked || alwaysVisible ? '' : 'row-actions'} ${className}`}
        size={buttonSize}
        variant="standard"
        onClick={(e: any) => {
          e.stopPropagation(); e.preventDefault();
          if (long.current) { long.current = false; return; }
          act(onTap);
        }}
      >
        {starred && prefs.superOn
          ? <SuperStar pop={pop} />
          : <m3e-icon variant="rounded" name="favorite" filled={liked || undefined} style={liked ? { color: 'var(--md-sys-color-primary)' } : undefined} />}
      </M3eIconButton>
    </span>
  );
}
