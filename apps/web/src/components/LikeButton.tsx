import { M3eIconButton } from '@/md';
import { useLikes } from '@/stores/likes';
import { useAuth } from '@/stores/auth';
import { useUI } from '@/stores/ui';
import { useT } from '@/lib/i18n';

interface Props { type: 'track' | 'album' | 'artist' | 'playlist'; id: string; size?: number; className?: string; alwaysVisible?: boolean; buttonSize?: 'small' | 'medium' | 'large' }

export function LikeButton({ type, id, className = '', alwaysVisible, buttonSize = 'small' }: Props) {
  const liked = useLikes((s) => s.ids[type].has(id));
  const toggle = useLikes((s) => s.toggle);
  const user = useAuth((s) => s.user);
  const toast = useUI((s) => s.toast);
  const t = useT();
  return (
    <M3eIconButton
      aria-label={liked ? t('unlike') : t('like')}
      title={liked ? t('unlike') : t('like')}
      className={`${liked || alwaysVisible ? '' : 'row-actions'} ${className}`}
      size={buttonSize}
      variant="standard"
      onClick={(e: any) => {
        e.stopPropagation(); e.preventDefault();
        if (!user) { toast(t('signInToListen'), 'error'); return; }
        toggle(type, id).catch(() => toast(t('error'), 'error'));
      }}
    >
      <m3e-icon variant="rounded" name="favorite" filled={liked || undefined} style={liked ? { color: 'var(--md-sys-color-primary)' } : undefined} />
    </M3eIconButton>
  );
}
