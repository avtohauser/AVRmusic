// "Guess the melody": friends hear the same 15 seconds of a song and pick its title out of four — the
// faster a right answer, the more points. The server runs the game; this page follows it with a long poll
// and plays each round's piece at the same moment (the music pauses meanwhile).
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { create } from 'zustand';
import { M3eButton } from '@/md';
import { Avatar } from '@/components/Social';
import { Cover } from '@/components/Cover';
import { TrackList } from '@/components/TrackList';
import { getMediaToken } from '@/lib/api';
import { game, type GameView } from '@/lib/features';
import { sendToFriends, trNow, useTr } from '@/lib/social';
import { usePlayer } from '@/stores/player';
import { useUI } from '@/stores/ui';
import { useAuth } from '@/stores/auth';

/** The game this listener is in, followed with a long poll; each round's piece plays on time. */
const useGame = create<{ view: GameView | null; skew: number }>(() => ({ view: null, skew: 0 }));
let polling = 0;
let clip: HTMLAudioElement | null = null;
let clipTimer: ReturnType<typeof setTimeout> | null = null;
let playedRound = -1;
const serverNow = () => Date.now() + useGame.getState().skew;

function stopClip() {
  if (clipTimer) clearTimeout(clipTimer);
  clipTimer = null;
  clip?.pause();
}

function update(v: GameView | null) {
  if (!v) { polling++; stopClip(); playedRound = -1; useGame.setState({ view: null }); return; }
  useGame.setState({ view: v, skew: v.serverNow ? v.serverNow - Date.now() : useGame.getState().skew });
  if (v.state === 'round' && v.round !== playedRound && v.clipUrl) {
    playedRound = v.round;
    stopClip();
    usePlayer.getState().pause();
    const a = clip ?? (clip = new Audio());
    a.src = `${v.clipUrl}?t=${encodeURIComponent(getMediaToken() ?? '')}`;
    a.preload = 'auto';
    a.load();
    const start = () => {
      if (v.clipOffsetMs) a.currentTime = v.clipOffsetMs / 1000;
      void a.play().catch(() => {});
      clipTimer = setTimeout(stopClip, v.clipMs + 300);
    };
    clipTimer = setTimeout(start, Math.max(0, Math.min(5000, (v.startsAt ?? 0) - serverNow())));
  }
  if (v.state !== 'round') stopClip();
}

async function follow(id: string) {
  const me = ++polling;
  while (me === polling) {
    try {
      const v = await game.get(id, useGame.getState().view?.version);
      if (me !== polling) return;
      if (!v) { update(null); useUI.getState().toast(trNow('Игра закончилась', 'The game is over')); return; }
      update(v);
    } catch (e: any) {
      if (e?.status === 404 || e?.status === 403) { update(null); return; }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

async function enterGame(p: Promise<GameView>) {
  try { const v = await p; update(v); void follow(v.id); }
  catch (e: any) { useUI.getState().toast(e.message, 'error'); }
}

const act = (p: Promise<GameView>) => p.then(update).catch((e) => useUI.getState().toast(e.message, 'error'));

export default function Game() {
  const tr = useTr();
  const v = useGame((s) => s.view);
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    // an invitation from the inbox: /game?join=<id>
    const join = params.get('join');
    if (join) { setParams({}, { replace: true }); void enterGame(game.join(join)); return; }
    if (!useGame.getState().view) void game.mine().then((g) => { if (g) { update(g); void follow(g.id); } }).catch(() => {});
  }, []);
  return (
    <div className="page pt-4 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <span className="w-12 h-12 rounded-2xl bg-tertiary text-on-tertiary flex items-center justify-center"><m3e-icon variant="rounded" name="quiz" /></span>
        <div>
          <h1 className="md-headline-md emph">{tr('Угадай мелодию', 'Guess the song')}</h1>
          {v && v.state !== 'lobby' && <div className="md-body-md text-on-surface-variant">{tr(`Раунд ${v.round} из ${v.rounds}`, `Round ${v.round} of ${v.rounds}`)}</div>}
        </div>
      </div>
      {!v ? <NewGame /> : v.state === 'lobby' ? <Lobby v={v} /> : v.state === 'round' ? <Round v={v} /> : <Reveal v={v} />}
    </div>
  );
}

function Chip({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) {
  return <button onClick={onClick} className={`px-4 h-9 rounded-lg md-label-lg border ${on ? 'bg-secondary-container text-on-secondary-container border-transparent' : 'border-[var(--md-sys-color-outline-variant)]'}`}>{children}</button>;
}

function NewGame() {
  const tr = useTr();
  const [source, setSource] = useState('ours');
  const [rounds, setRounds] = useState(10);
  return (
    <div className="fade-in">
      <p className="md-body-lg text-on-surface-variant mb-5">{tr('Все слышат один и тот же отрывок и выбирают название из четырёх. Чем быстрее верный ответ — тем больше очков.', 'Everyone hears the same piece and picks the title out of four. The faster the right answer, the more points.')}</p>
      <div className="md-title-sm mb-2">{tr('Какая музыка', 'Which music')}</div>
      <div className="flex gap-2 mb-4">
        <Chip on={source === 'ours'} onClick={() => setSource('ours')}>{tr('Что мы слушаем', 'What we listen to')}</Chip>
        <Chip on={source === 'library'} onClick={() => setSource('library')}>{tr('Вся библиотека', 'The whole library')}</Chip>
      </div>
      <div className="md-title-sm mb-2">{tr('Раундов', 'Rounds')}</div>
      <div className="flex gap-2 mb-6">{[5, 10, 15, 20].map((n) => <Chip key={n} on={rounds === n} onClick={() => setRounds(n)}>{n}</Chip>)}</div>
      <M3eButton variant="filled" size="large" onClick={() => void enterGame(game.create(source, rounds))}><m3e-icon variant="rounded" slot="icon" name="play_arrow" />{tr('Создать игру', 'Create a game')}</M3eButton>
      <p className="md-body-sm text-on-surface-variant mt-3">{tr('Друзья заходят по приглашению — оно придёт им во «Входящие».', 'Friends join by invitation — it arrives in their inbox.')}</p>
    </div>
  );
}

function Players({ v, points }: { v: GameView; points: boolean }) {
  const tr = useTr();
  const me = useAuth((s) => s.user?.id);
  return (
    <div className="flex flex-col gap-1">
      {v.players.map((p, i) => (
        <div key={p.user.id} className="flex items-center gap-3 py-1.5">
          <span className="w-5 md-title-sm text-on-surface-variant">{i + 1}</span>
          <Avatar user={p.user} className="w-9 h-9" />
          <span className="flex-1 min-w-0 line-1">{p.user.displayName}{p.user.id === me ? tr(' (вы)', ' (you)') : ''}</span>
          {points && p.points !== null && <span className={`md-label-lg ${p.correct ? 'text-tertiary' : 'text-error'}`}>{p.correct ? `+${p.points}` : '✕'}</span>}
          {!points && v.state === 'round' && <m3e-icon variant="rounded" name={p.answered ? 'check_circle' : 'more_horiz'} className={p.answered ? 'text-tertiary' : 'text-outline'} />}
          <span className="md-title-md emph w-14 text-right">{p.score}</span>
        </div>
      ))}
    </div>
  );
}

function Lobby({ v }: { v: GameView }) {
  const tr = useTr();
  const me = useAuth((s) => s.user?.id);
  return (
    <div className="fade-in">
      <div className="md-title-md mb-2">{tr('Игроки', 'Players')}</div>
      <Players v={v} points={false} />
      <div className="flex flex-wrap gap-2 mt-5">
        {v.host?.id === me
          ? <M3eButton variant="filled" onClick={() => void act(game.next(v.id))}><m3e-icon variant="rounded" slot="icon" name="play_arrow" />{tr('Начать', 'Start')}</M3eButton>
          : <span className="md-body-md text-on-surface-variant self-center">{tr(`Ждём, когда ${v.host?.displayName ?? ''} начнёт игру`, `Waiting for ${v.host?.displayName ?? ''} to start`)}</span>}
        <M3eButton variant="tonal" onClick={() => sendToFriends('game', v.id, tr('Угадай мелодию', 'Guess the song'))}><m3e-icon variant="rounded" slot="icon" name="group_add" />{tr('Позвать', 'Invite')}</M3eButton>
        <M3eButton variant="outlined" onClick={() => { void game.leave(v.id); update(null); }}>{tr('Выйти', 'Leave')}</M3eButton>
      </div>
    </div>
  );
}

function Round({ v }: { v: GameView }) {
  const tr = useTr();
  const [now, setNow] = useState(serverNow());
  useEffect(() => { const t = setInterval(() => setNow(serverNow()), 100); return () => clearInterval(t); }, [v.round]);
  const starts = v.startsAt ?? now, ends = v.endsAt ?? now;
  if (now < starts) return <div className="h-48 flex items-center justify-center md-display-lg text-tertiary emph">{Math.floor((starts - now) / 1000) + 1}</div>;
  const left = Math.max(0, ends - now) / Math.max(1, ends - starts);
  return (
    <div className="fade-in">
      <div className="h-2 rounded-full bg-surface-container-high overflow-hidden mb-4"><div className="h-full bg-tertiary transition-[width] duration-100" style={{ width: `${left * 100}%` }} /></div>
      <div className="md-title-lg mb-3">{tr('Что это за песня?', 'What song is it?')}</div>
      <div className="grid sm:grid-cols-2 gap-2">
        {v.options.map((o) => {
          const mine = v.myChoice === o.n;
          return (
            <button key={o.n} disabled={v.myChoice !== null} onClick={() => void act(game.answer(v.id, o.n))}
              className={`text-left px-4 py-3 rounded-2xl spring ${mine ? 'bg-primary text-on-primary' : 'bg-surface-container-high hover:bg-surface-container-highest'} disabled:cursor-default`}>
              <div className="md-title-md line-2">{o.title}</div>
              <div className={`md-body-md line-1 ${mine ? 'opacity-80' : 'text-on-surface-variant'}`}>{o.artist}</div>
            </button>
          );
        })}
      </div>
      {v.myChoice !== null && <p className="md-body-md text-on-surface-variant mt-3">{tr('Ответ принят — ждём остальных', 'Answer taken — waiting for the others')}</p>}
      <div className="mt-6"><Players v={v} points={false} /></div>
    </div>
  );
}

function Reveal({ v }: { v: GameView }) {
  const tr = useTr();
  const done = v.state === 'done';
  const t = v.answer?.track;
  return (
    <div className="fade-in">
      {t && (
        <div className="flex items-center gap-4 p-4 rounded-3xl bg-tertiary-container text-on-tertiary-container">
          <Cover src={t.coverUrl} className="w-16 h-16 rounded-xl shrink-0" />
          <div className="min-w-0">
            <div className="md-label-lg opacity-80">{tr('Это было', 'It was')}</div>
            <div className="md-title-lg line-2">{t.title}</div>
            <div className="md-body-md opacity-80 line-1">{t.artist.name}</div>
          </div>
        </div>
      )}
      {v.myChoice !== null && v.answer && (
        <div className={`md-headline-sm emph text-center mt-4 ${v.myChoice === v.answer.n ? 'text-tertiary' : 'text-error'}`}>{v.myChoice === v.answer.n ? tr('Верно!', 'Right!') : tr('Мимо', 'Missed')}</div>
      )}
      <div className="md-title-md mt-6 mb-2">{done ? tr('Итог', 'Result') : tr('Счёт', 'Score')}</div>
      <Players v={v} points={!done} />
      {done ? (
        <>
          {v.played.length > 0 && <><div className="md-title-md mt-6 mb-2">{tr('Звучало в игре', 'Played in the game')}</div><TrackList tracks={v.played} context="game" header={false} /></>}
          <div className="flex gap-2 mt-5">
            <M3eButton variant="filled" onClick={() => { const s = v.source, n = v.rounds; void game.leave(v.id); update(null); void enterGame(game.create(s, n)); }}>{tr('Ещё игра', 'Another game')}</M3eButton>
            <M3eButton variant="outlined" onClick={() => { void game.leave(v.id); update(null); }}>{tr('Выйти', 'Leave')}</M3eButton>
          </div>
        </>
      ) : (
        <M3eButton variant="tonal" className="mt-5" onClick={() => void act(game.next(v.id))}>{tr('Дальше', 'Next')}</M3eButton>
      )}
    </div>
  );
}
