// "My Wave" on the home screen: one tap starts an endless stream picked for you; the mode decides
// how familiar it is. While it plays, the card shows why the current track was picked.
import { usePlayer } from '@/stores/player';
import { useUI } from '@/stores/ui';
import { WAVE_CONTEXT, WAVE_MODES, WAVE_MOODS, startWave, useWave } from '@/lib/wave';
import { useFriends } from '@/lib/social';
import type { WaveMode } from '@avrmusic/shared';
import { Mascot } from './Mascot';
import { FlowText } from './FlowText';

export function WaveCard() {
  const mode = useWave((s) => s.mode);
  const loading = useWave((s) => s.loading);
  const inWave = usePlayer((s) => s.context === WAVE_CONTEXT);
  const playing = usePlayer((s) => s.playing);
  const current = usePlayer((s) => s.queue[s.index] ?? null);
  const reason = useWave((s) => (current ? s.reasons[current.id] : undefined));
  const toast = useUI((s) => s.toast);
  const live = inWave && playing;
  const { data: friends } = useFriends();
  const friendModes = (friends ?? []).slice(0, 6).map((f) => ({ id: `friend:${f.id}` as WaveMode, label: f.displayName, icon: 'person', hint: `Волна по вкусу: ${f.displayName}` }));
  const all = [...WAVE_MODES, ...WAVE_MOODS, ...friendModes];

  const go = async (m = mode) => {
    if (inWave && m === mode) { usePlayer.getState().toggle(); return; }
    try { await startWave(m); } catch (e: any) { toast(e.message, 'error'); }
  };

  return (
    <section className="wave-card mb-8 fade-in" data-live={live || undefined}>
      <div className="wave-blob wave-blob-a" /><div className="wave-blob wave-blob-b" /><div className="wave-blob wave-blob-c" />
      <div className="relative flex items-center gap-4 md:gap-6">
        <button className="wave-play" onClick={() => void go()} aria-label={live ? 'Пауза' : 'Включить Мою волну'} disabled={loading}>
          <Mascot mood={loading ? 'think' : live ? 'dance' : 'idle'} className="w-14 h-14 md:w-16 md:h-16" />
          <span className="wave-play-icon"><m3e-icon variant="rounded" name={live ? 'pause' : 'play_arrow'} filled /></span>
        </button>
        <div className="min-w-0 flex-1">
          <FlowText as="h2" text="Моя волна" className="md-headline-md emph block" />
          <p className="md-body-md opacity-80 line-1 mt-0.5">
            {inWave && current ? <>{current.artist.name} — {current.title}{reason ? <span className="opacity-80"> · {reason}</span> : null}</> : all.find((x) => x.id === mode)?.hint}
          </p>
        </div>
      </div>
      <div className="relative flex gap-2 mt-4 overflow-x-auto no-scrollbar -mx-1 px-1">
        {all.map((m, i) => (<span key={m.id} className="contents">
          {(i === WAVE_MODES.length || (i === WAVE_MODES.length + WAVE_MOODS.length && friendModes.length > 0)) && <span className="w-px self-stretch bg-current opacity-20 mx-1 shrink-0" />}
          <button key={m.id} className="wave-mode" data-on={m.id === mode || undefined} onClick={() => void go(m.id)} title={m.hint}>
            <m3e-icon variant="rounded" name={m.icon} filled={m.id === mode || undefined} />{m.label}
          </button>
        </span>))}
      </div>
    </section>
  );
}
