// Reactions at a moment of a song: friends' emoji pop up when playback reaches them, marks sit on
// the seek bar, and one tap leaves your own at the current second.
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Track } from '@avrmusic/shared';
import { M3eButton, M3eIconButton } from '@/md';
import { usePlayer } from '@/stores/player';
import { useAuth } from '@/stores/auth';
import { useUI } from '@/stores/ui';
import { fmtTime } from '@/lib/format';
import { REACTIONS, react, useReactions, useTr } from '@/lib/social';
import { Avatar } from './Social';

/** Bubbles for reactions the song has just reached. */
export function ReactionBubbles({ track }: { track: Track }) {
  const { data } = useReactions(track.id);
  const ms = usePlayer((s) => Math.floor(s.position * 2) * 500);
  const live = (data ?? []).filter((r) => ms >= r.atMs && ms - r.atMs < 5000).slice(-3);
  if (!live.length) return null;
  return (
    <div className="absolute left-3 bottom-3 right-3 flex flex-col items-start gap-1.5 pointer-events-none z-10">
      {live.map((r) => (
        <div key={r.id} className="fade-in flex items-center gap-2 pl-1 pr-3 py-1 rounded-full bg-black/55 text-white backdrop-blur-sm max-w-full">
          <Avatar user={r.user} className="w-7 h-7 md-label-sm" />
          <span className="text-xl leading-none">{r.emoji}</span>
          {r.text && <span className="md-body-md line-1">{r.text}</span>}
        </div>
      ))}
    </div>
  );
}

/** Where in the song reactions were left. */
export function ReactionMarks({ track, duration }: { track: Track; duration: number }) {
  const { data } = useReactions(track.id);
  if (!data?.length || !duration) return null;
  return (
    <div className="relative h-4 mx-2 -mb-1" aria-hidden>
      {data.map((r) => <span key={r.id} className="absolute -translate-x-1/2 text-[11px] leading-none" style={{ left: `${Math.min(100, (r.atMs / 1000 / duration) * 100)}%` }} title={`${r.user?.displayName ?? ''} · ${fmtTime(r.atMs / 1000)}`}>{r.emoji}</span>)}
    </div>
  );
}

export function ReactButton({ track }: { track: Track }) {
  const user = useAuth((s) => s.user);
  const qc = useQueryClient();
  const tr = useTr();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  if (!user || track.id.startsWith('dz:')) return null;
  const send = async (emoji: string) => {
    const at = usePlayer.getState().position * 1000;
    setOpen(false);
    try {
      await react(track.id, at, emoji, text.trim());
      setText('');
      qc.invalidateQueries({ queryKey: ['reactions', track.id] });
      useUI.getState().toast(tr(`Реакция на ${fmtTime(at / 1000)} — друзья увидят её в этот момент`, `Reaction at ${fmtTime(at / 1000)} — friends will see it right there`), 'success');
    } catch (e: any) { useUI.getState().toast(e.message, 'error'); }
  };
  return (
    <div className="relative">
      <M3eIconButton aria-label={tr('Реакция', 'React')} title={tr('Реакция на этот момент', 'React to this moment')} onClick={() => setOpen(!open)}><m3e-icon variant="rounded" name="add_reaction" /></M3eIconButton>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 bottom-full mb-2 z-20 w-72 rounded-[24px] p-3 bg-surface-container-high text-on-surface elev-3 fade-in">
            <div className="grid grid-cols-5 gap-1">
              {REACTIONS.map((e) => <button key={e} className="text-2xl h-11 rounded-[14px] state-layer" onClick={() => void send(e)}>{e}</button>)}
            </div>
            <input className="md-input md-body-md w-full mt-2 px-3 py-2 rounded-[14px] bg-surface-container-highest" placeholder={tr('Подпись (необязательно)', 'Caption (optional)')} maxLength={140} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void send('💬'); }} />
            {text.trim() && <M3eButton variant="text" className="mt-1" onClick={() => void send('💬')}>{tr('Только текст', 'Text only')}</M3eButton>}
          </div>
        </>
      )}
    </div>
  );
}
