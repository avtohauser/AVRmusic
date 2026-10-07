// Badges the admin makes and gives: they circle around a friend's photo on their page and line up under the
// name; the admin's tab to make them and give them out.
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { FriendRef } from '@avrmusic/shared';
import { M3eButton, M3eFormField } from '@/md';
import { Modal } from './Modal';
import { api } from '@/lib/api';
import { useFriends, useTr } from '@/lib/social';
import { useAuth } from '@/stores/auth';
import { useUI } from '@/stores/ui';

export interface Badge { id: string; title: string; emoji: string; color: string; description: string; givenAt?: string; holders?: number }

export function BadgeDot({ b, size = 36, onClick }: { b: Badge; size?: number; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} title={b.title} className="rounded-full flex items-center justify-center shadow-md border-2 border-[var(--md-sys-color-surface)] shrink-0"
      style={{ width: size, height: size, background: b.color, fontSize: size * 0.5, cursor: onClick ? 'pointer' : 'default' }}>{b.emoji}</button>
  );
}

/** A photo with the person's badges slowly circling around it. */
export function BadgeOrbit({ badges, size, children }: { badges: Badge[]; size: number; children: React.ReactNode }) {
  const [shown, setShown] = useState<Badge | null>(null);
  const tr = useTr();
  if (!badges.length) return <>{children}</>;
  const dot = 34, radius = size / 2 + 22, box = radius * 2 + dot;
  const list = badges.slice(0, 8);
  return (
    <div className="relative shrink-0" style={{ width: box, height: box }}>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
      <div className="absolute inset-0 badge-orbit">
        {list.map((b, i) => {
          const a = (i / list.length) * Math.PI * 2;
          return (
            <div key={b.id} className="absolute badge-counter" style={{ left: box / 2 + radius * Math.cos(a) - dot / 2, top: box / 2 + radius * Math.sin(a) - dot / 2, animationDelay: `${-i * 0.4}s` }}>
              <BadgeDot b={b} size={dot} onClick={() => setShown(b)} />
            </div>
          );
        })}
      </div>
      {shown && (
        <Modal open onClose={() => setShown(null)} title={`${shown.emoji} ${shown.title}`}>
          {shown.description && <p className="md-body-lg">{shown.description}</p>}
          <div className="flex justify-end pt-4"><M3eButton variant="text" onClick={() => setShown(null)}>{tr('Круто', 'Nice')}</M3eButton></div>
        </Modal>
      )}
    </div>
  );
}

export function BadgeChips({ badges }: { badges: Badge[] }) {
  if (!badges.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {badges.map((b) => (
        <span key={b.id} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full md-label-lg" style={{ background: `${b.color}38` }}>{b.emoji} {b.title}</span>
      ))}
    </div>
  );
}

/* ---------- the admin's tab ---------- */

const COLORS = ['#F2A0C4', '#8E7CFF', '#4FC3A1', '#FFB74D', '#64B5F6', '#E57373', '#A1887F', '#90A4AE'];

export function AdminBadges() {
  const tr = useTr();
  const { data = [] } = useQuery({ queryKey: ['badges'], queryFn: () => api.get<Badge[]>('/api/badges') });
  const [edit, setEdit] = useState<Badge | 'new' | null>(null);
  const [give, setGive] = useState<Badge | null>(null);
  return (
    <div className="max-w-2xl">
      <p className="md-body-md text-on-surface-variant mb-3">{tr('Свои ачивки: эмодзи, название и цвет. Выдайте их друзьям — они появятся в профиле и будут летать вокруг аватарки.', 'Your own badges: an emoji, a name and a colour. Give them to friends — they show on profiles and circle around the photo.')}</p>
      <M3eButton variant="filled" onClick={() => setEdit('new')}><m3e-icon variant="rounded" slot="icon" name="add" />{tr('Новая ачивка', 'New badge')}</M3eButton>
      <div className="flex flex-col gap-2 mt-4">
        {data.map((b) => (
          <div key={b.id} className="flex items-center gap-3 p-3 rounded-3xl surface-low">
            <BadgeDot b={b} size={44} />
            <div className="min-w-0 flex-1">
              <div className="md-title-md">{b.title}</div>
              <div className="md-body-sm text-on-surface-variant line-1">{[b.description, tr(`выдано: ${b.holders ?? 0}`, `given: ${b.holders ?? 0}`)].filter(Boolean).join(' · ')}</div>
            </div>
            <M3eButton variant="tonal" onClick={() => setGive(b)}>{tr('Выдать', 'Give')}</M3eButton>
            <M3eButton variant="text" onClick={() => setEdit(b)}>{tr('Изменить', 'Edit')}</M3eButton>
          </div>
        ))}
      </div>
      {edit && <BadgeEditor b={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
      {give && <GiveDialog b={give} onClose={() => setGive(null)} />}
    </div>
  );
}

function BadgeEditor({ b, onClose }: { b: Badge | null; onClose: () => void }) {
  const tr = useTr();
  const qc = useQueryClient();
  const [emoji, setEmoji] = useState(b?.emoji ?? '🐞');
  const [title, setTitle] = useState(b?.title ?? '');
  const [desc, setDesc] = useState(b?.description ?? '');
  const [color, setColor] = useState(b?.color ?? COLORS[0]);
  const done = async (work: () => Promise<unknown>) => {
    try { await work(); await qc.invalidateQueries({ queryKey: ['badges'] }); onClose(); } catch (e: any) { useUI.getState().toast(e.message, 'error'); }
  };
  const body = { title, emoji, color, description: desc };
  return (
    <Modal open onClose={onClose} title={b ? tr('Ачивка', 'Badge') : tr('Новая ачивка', 'New badge')}>
      <div className="flex items-center gap-3 mb-3">
        <BadgeDot b={{ id: '', title, emoji: emoji || '?', color, description: '' }} size={52} />
        <M3eFormField variant="outlined" className="w-28 block"><span slot="label">{tr('Эмодзи', 'Emoji')}</span><input value={emoji} maxLength={8} onChange={(e) => setEmoji(e.target.value)} /></M3eFormField>
      </div>
      <M3eFormField variant="outlined" className="w-full block"><span slot="label">{tr('Название', 'Name')}</span><input value={title} maxLength={40} onChange={(e) => setTitle(e.target.value)} /></M3eFormField>
      <M3eFormField variant="outlined" className="w-full block mt-2"><span slot="label">{tr('За что (необязательно)', 'What for (optional)')}</span><input value={desc} maxLength={200} onChange={(e) => setDesc(e.target.value)} /></M3eFormField>
      <div className="flex gap-2 mt-3">
        {COLORS.map((c) => <button key={c} onClick={() => setColor(c)} className="w-8 h-8 rounded-full" style={{ background: c, outline: c === color ? '3px solid var(--md-sys-color-on-surface)' : 'none', outlineOffset: 2 }} />)}
      </div>
      <div className="flex justify-between gap-2 pt-5">
        {b ? <M3eButton variant="text" onClick={() => void done(() => api.del(`/api/admin/badges/${b.id}`))}>{tr('Удалить', 'Delete')}</M3eButton> : <span />}
        <div className="flex gap-2">
          <M3eButton variant="text" onClick={onClose}>{tr('Отмена', 'Cancel')}</M3eButton>
          <M3eButton variant="filled" disabled={!title.trim() || !emoji.trim() || undefined}
            onClick={() => void done(() => (b ? api.put(`/api/admin/badges/${b.id}`, body) : api.post('/api/admin/badges', body)))}>{tr('Сохранить', 'Save')}</M3eButton>
        </div>
      </div>
    </Modal>
  );
}

function GiveDialog({ b, onClose }: { b: Badge; onClose: () => void }) {
  const tr = useTr();
  const qc = useQueryClient();
  const me = useAuth((s) => s.user);
  const { data: friends = [] } = useFriends();
  const holders = useQuery({ queryKey: ['badge-holders', b.id], queryFn: () => api.get<FriendRef[]>(`/api/admin/badges/${b.id}/holders`) });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  useEffect(() => setPicked(new Set()), [b.id]);
  const has = new Set((holders.data ?? []).map((h) => h.id));
  const people = [...(me ? [{ id: me.id, displayName: me.displayName || me.username }] : []), ...friends.map((f) => ({ id: f.id, displayName: f.displayName }))];
  const give = async () => {
    try {
      await api.post(`/api/admin/badges/${b.id}/give`, { userIds: [...picked] });
      useUI.getState().toast(tr('Выдано — придёт во «Входящие»', 'Given — it arrives in their inbox'), 'success');
      await qc.invalidateQueries({ queryKey: ['badges'] });
      onClose();
    } catch (e: any) { useUI.getState().toast(e.message, 'error'); }
  };
  const take = async (uid: string) => { await api.del(`/api/admin/badges/${b.id}/give/${uid}`).catch(() => {}); await holders.refetch(); void qc.invalidateQueries({ queryKey: ['badges'] }); };
  return (
    <Modal open onClose={onClose} title={tr(`Выдать «${b.title}»`, `Give “${b.title}”`)}>
      <div className="max-h-80 overflow-auto">
        {people.map((p) => {
          const owned = has.has(p.id);
          return (
            <label key={p.id} className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-surface-container-high">
              <input type="checkbox" disabled={owned} checked={owned || picked.has(p.id)} onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} />
              <span className="flex-1">{p.displayName}</span>
              {owned && <M3eButton variant="text" onClick={() => void take(p.id)}>{tr('Забрать', 'Take back')}</M3eButton>}
            </label>
          );
        })}
      </div>
      <div className="flex justify-end gap-2 pt-4">
        <M3eButton variant="text" onClick={onClose}>{tr('Закрыть', 'Close')}</M3eButton>
        <M3eButton variant="filled" disabled={!picked.size || undefined} onClick={() => void give()}>{tr('Выдать', 'Give')}</M3eButton>
      </div>
    </Modal>
  );
}
