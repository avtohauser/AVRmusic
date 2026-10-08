// Shared pieces of the social pages: avatars, the friend picker (send / blend / invite an owner),
// the report dialog and the "listening together" bar above the player.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { M3eButton, M3eFormField, M3eIconButton } from '@/md';
import { Modal } from './Modal';
import { Cover } from './Cover';
import { useUI } from '@/stores/ui';
import { useJam, leaveJam, voteInJam } from '@/lib/jam';
import { stopFollow, useFollow } from '@/lib/follow';
import { sendToFriends, useFriends, useSocialUI, useTr, report, type Friend } from '@/lib/social';
import type { FriendRef } from '@avrmusic/shared';

export function Avatar({ user, className = 'w-10 h-10' }: { user: { displayName: string; avatarUrl?: string | null } | null; className?: string }) {
  if (user?.avatarUrl) return <Cover src={user.avatarUrl} round kind="artist" className={`${className} shrink-0`} />;
  return <span className={`${className} shrink-0 rounded-full bg-tertiary-container text-on-tertiary-container flex items-center justify-center md-title-sm`}>{(user?.displayName ?? '?').slice(0, 1).toUpperCase()}</span>;
}

/** "Лёша, Маша и ещё 2" */
export function namesLine(people: Array<FriendRef | null | undefined>, more: (n: number) => string): string {
  const names = people.filter(Boolean).map((p) => p!.displayName);
  return names.length <= 3 ? names.join(', ') : `${names.slice(0, 2).join(', ')} ${more(names.length - 2)}`;
}

export function FriendPickerModal() {
  const req = useSocialUI((s) => s.picker);
  const close = () => useSocialUI.setState({ picker: null });
  const { data: friends } = useFriends();
  const toast = useUI((s) => s.toast);
  const tr = useTr();
  const [chosen, setChosen] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setChosen([]); setMessage(''); }, [req]);
  const list = (friends ?? []).filter((f) => !req?.exclude?.includes(f.id));
  const toggle = (f: Friend) => setChosen((c) => (c.includes(f.id) ? c.filter((x) => x !== f.id) : req?.multi ? (c.length >= (req.max ?? 20) ? c : [...c, f.id]) : [f.id]));
  const go = async () => {
    if (!req || !chosen.length) return;
    setBusy(true);
    try { await req.run(chosen, message.trim()); close(); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal open={!!req} onClose={close} title={req?.title}>
      {!list.length && <p className="md-body-md muted">{tr('Пока здесь больше никого нет — друзья появятся, когда зарегистрируются по приглашению.', 'Nobody else is here yet — friends appear once they sign up with an invite.')}</p>}
      <div className="max-h-[45vh] overflow-y-auto -mx-2">
        {list.map((f) => {
          const on = chosen.includes(f.id);
          return (
            <button key={f.id} className={`w-full flex items-center gap-3 p-2 rounded-[20px] state-layer ${on ? 'bg-secondary-container text-on-secondary-container' : ''}`} onClick={() => toggle(f)}>
              <Avatar user={f} />
              <span className="flex-1 min-w-0 text-left"><span className="block md-title-sm line-1">{f.displayName}</span><span className="block md-body-sm muted line-1">@{f.username}</span></span>
              <m3e-icon variant="rounded" name={on ? 'check_circle' : 'add_circle'} filled={on || undefined} style={{ color: on ? 'var(--md-sys-color-primary)' : undefined }} />
            </button>
          );
        })}
      </div>
      {req?.message && (
        <M3eFormField variant="outlined" className="w-full block mt-3">
          <span slot="label">{tr('Сообщение (необязательно)', 'Message (optional)')}</span>
          <input value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} />
        </M3eFormField>
      )}
      <div className="flex justify-end gap-2 pt-4">
        <M3eButton variant="text" onClick={close}>{tr('Отмена', 'Cancel')}</M3eButton>
        <M3eButton variant="filled" disabled={busy || !chosen.length || undefined} onClick={go}><m3e-icon variant="rounded" slot="icon" name="send" />{req?.button}</M3eButton>
      </div>
    </Modal>
  );
}

const REASONS: Array<[string, string, string]> = [
  ['wrong', 'Не тот трек или другая версия', 'Wrong song or another version'],
  ['quality', 'Плохое качество звука', 'Poor sound quality'],
  ['cut', 'Обрезан, тишина или не до конца', 'Cut short, silence or incomplete'],
  ['other', 'Другое', 'Something else'],
];
export const reasonLabel = (r: string, tr: (ru: string, en: string) => string) => { const x = REASONS.find((y) => y[0] === r); return x ? tr(x[1], x[2]) : r; };

export function ReportModal() {
  const track = useSocialUI((s) => s.report);
  const close = () => useSocialUI.setState({ report: null });
  const toast = useUI((s) => s.toast);
  const tr = useTr();
  const [reason, setReason] = useState('wrong');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setReason('wrong'); setNote(''); }, [track]);
  const go = async () => {
    if (!track) return;
    setBusy(true);
    try { await report(track.id, reason, note.trim()); toast(tr('Спасибо! Администратор посмотрит и перекачает трек', 'Thanks! The admin will look and fetch it again'), 'success'); close(); }
    catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal open={!!track} onClose={close} title={tr('Что не так с треком?', 'What is wrong with the track?')}>
      {track && <p className="md-body-md muted mb-3 line-1">{track.artist.name} — {track.title}</p>}
      <div className="space-y-1">
        {REASONS.map(([k, ru, en]) => (
          <button key={k} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[16px] state-layer text-left ${reason === k ? 'bg-secondary-container text-on-secondary-container' : ''}`} onClick={() => setReason(k)}>
            <m3e-icon variant="rounded" name={reason === k ? 'check_circle' : 'radio'} filled={reason === k || undefined} />
            <span className="md-body-lg">{tr(ru, en)}</span>
          </button>
        ))}
      </div>
      <M3eFormField variant="outlined" className="w-full block mt-3">
        <span slot="label">{tr('Подробности (необязательно)', 'Details (optional)')}</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      </M3eFormField>
      <div className="flex justify-end gap-2 pt-4">
        <M3eButton variant="text" onClick={close}>{tr('Отмена', 'Cancel')}</M3eButton>
        <M3eButton variant="filled" disabled={busy || undefined} onClick={go}><m3e-icon variant="rounded" slot="icon" name="flag" />{tr('Пожаловаться', 'Report')}</M3eButton>
      </div>
    </Modal>
  );
}

/** While listening together: who is here, invite more, leave. */
export function JamBar() {
  const view = useJam((s) => s.view);
  const tr = useTr();
  const [votes, setVotes] = useState(false);
  if (!view) return null;
  const last = view.lastBy && view.lastAction ? `${view.lastBy.displayName}: ${actionLabel(view.lastAction, tr)}` : null;
  return (
    <div className="jam-bar fixed left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 pl-2 pr-1 py-1 rounded-full bg-tertiary-container text-on-tertiary-container elev-2 fade-in max-w-[calc(100vw-32px)]"
      style={{ bottom: 'calc(var(--player-h) + var(--nav-h) + var(--safe-b) + 12px)' }}>
      <div className="flex -space-x-2">{view.members.slice(0, 4).map((m) => <Avatar key={m.id} user={m} className="w-7 h-7 ring-2 ring-[var(--md-sys-color-tertiary-container)]" />)}</div>
      <Link to="/friends" className="min-w-0 px-1">
        <span className="block md-label-lg line-1">{tr('Слушаете вместе', 'Listening together')} · {view.members.length}</span>
        {last && <span className="block md-body-sm opacity-80 line-1">{last}</span>}
      </Link>
      <M3eIconButton size="small" className="relative" title={tr('Предложения и голоса', 'Suggestions and votes')} onClick={() => setVotes(true)}>
        <m3e-icon variant="rounded" name="how_to_vote" />
        {!!view.suggestions?.length && <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-tertiary text-on-tertiary text-[10px] leading-4 text-center">{view.suggestions.length}</span>}
      </M3eIconButton>
      <M3eIconButton size="small" title={tr('Позвать ещё', 'Invite more')} onClick={() => sendToFriends('jam', view.id, '')}><m3e-icon variant="rounded" name="group_add" /></M3eIconButton>
      <M3eIconButton size="small" title={tr('Выйти', 'Leave')} onClick={() => void leaveJam()}><m3e-icon variant="rounded" name="exit_to_app" /></M3eIconButton>
      <Modal open={votes} onClose={() => setVotes(false)} title={tr('Предложения', 'Suggestions')}>
        <p className="md-body-md text-on-surface-variant mb-3">{tr('Голосуйте — трек с большинством голосов играет следующим. Предложить: ⋮ у любого трека.', 'Vote — the track with the most votes plays next. To suggest: ⋮ on any track.')}</p>
        {!view.suggestions?.length && <p className="md-body-md text-on-surface-variant py-4 text-center">{tr('Пока никто ничего не предложил', 'No suggestions yet')}</p>}
        {view.suggestions?.map((s) => (
          <div key={s.track.id} className="flex items-center gap-3 py-2">
            <Cover src={s.track.coverUrl} className="w-11 h-11 rounded-lg shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="md-body-lg line-1">{s.track.title}</div>
              <div className={`md-body-sm line-1 ${s.next ? 'text-tertiary' : 'text-on-surface-variant'}`}>
                {[s.next ? tr('следующий', 'next') : null, s.track.artist.name, s.by ? tr(`от ${s.by.displayName}`, `from ${s.by.displayName}`) : null].filter(Boolean).join(' · ')}
              </div>
            </div>
            <button onClick={() => void voteInJam(s.track.id, !s.voted)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full md-label-lg ${s.voted ? 'bg-tertiary text-on-tertiary' : 'bg-surface-container-high'}`}>
              <m3e-icon variant="rounded" name="thumb_up" />{s.votes}
            </button>
          </div>
        ))}
      </Modal>
    </div>
  );
}

/** While listening along with a friend: whose music this is, and a way out. */
export function FollowBar() {
  const friend = useFollow((s) => s.friend);
  const jam = useJam((s) => s.view);
  const tr = useTr();
  if (!friend || jam) return null;
  return (
    <div className="jam-bar fixed left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 pl-2 pr-1 py-1 rounded-full bg-tertiary-container text-on-tertiary-container elev-2 fade-in max-w-[calc(100vw-32px)]"
      style={{ bottom: 'calc(var(--player-h) + var(--nav-h) + var(--safe-b) + 12px)' }}>
      <Avatar user={friend} className="w-7 h-7" />
      <Link to={`/user/${friend.id}`} className="min-w-0 px-1 md-label-lg line-1">{tr(`Слушаете вместе с ${friend.displayName}`, `Listening along with ${friend.displayName}`)}</Link>
      <M3eIconButton size="small" title={tr('Выйти', 'Leave')} onClick={() => stopFollow()}><m3e-icon variant="rounded" name="close" /></M3eIconButton>
    </div>
  );
}

function actionLabel(a: string, tr: (ru: string, en: string) => string): string {
  const m: Record<string, [string, string]> = {
    started: ['начал(а) сессию', 'started the session'], joined: ['присоединился(ась)', 'joined'], left: ['вышел(ла)', 'left'],
    play: ['включил(а)', 'pressed play'], pause: ['поставил(а) на паузу', 'paused'], seek: ['перемотал(а)', 'seeked'],
    skip: ['переключил(а) трек', 'switched the track'], next: ['следующий трек', 'next track'], prev: ['предыдущий трек', 'previous track'],
    add: ['добавил(а) в очередь', 'added to the queue'], remove: ['убрал(а) из очереди', 'removed from the queue'], move: ['поменял(а) порядок', 'reordered'],
    replace: ['включил(а) новое', 'put on something new'],
  };
  const x = m[a];
  return x ? tr(x[0], x[1]) : a;
}

