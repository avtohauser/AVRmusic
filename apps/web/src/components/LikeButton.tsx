import { Heart } from 'lucide-react';
import { useLikes } from '@/stores/likes';
import { useAuth } from '@/stores/auth';
import { useUI } from '@/stores/ui';
import { useT } from '@/lib/i18n';

interface Props { type: 'track' | 'album' | 'artist' | 'playlist'; id: string; size?: number; className?: string; alwaysVisible?: boolean }

export function LikeButton({ type, id, size = 18, className = '', alwaysVisible }: Props) {
  const liked = useLikes((s) => s.ids[type].has(id));
  const toggle = useLikes((s) => s.toggle);
  const user = useAuth((s) => s.user);
  const toast = useUI((s) => s.toast);
  const t = useT();
  return (
    <button
      type="button"
      aria-label={liked ? t('unlike') : t('like')}
      title={liked ? t('unlike') : t('like')}
      data-active={liked}
      className={`icon-btn ${liked || alwaysVisible ? '' : 'row-actions'} ${className}`}
      onClick={(e) => {
        e.stopPropagation(); e.preventDefault();
        if (!user) { toast(t('signInToListen'), 'error'); return; }
        toggle(type, id).catch(() => toast(t('error'), 'error'));
      }}
    >
      <Heart size={size} fill={liked ? 'currentColor' : 'none'} className={liked ? 'text-accent' : ''} />
    </button>
  );
}
