// A smart playlist's rules: genres, years, liked only, not played for a while, played often … — the
// server keeps the playlist matching them and refills it every few hours.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { SmartRules } from '@avrmusic/shared';
import { M3eButton, M3eFormField } from '@/md';
import { Modal } from './Modal';
import { useGenres } from '@/lib/queries';
import { createSmart, setSmartRules } from '@/lib/features';
import { useTr } from '@/lib/social';
import { useUI } from '@/stores/ui';

function Chip({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={`px-3 h-8 rounded-lg md-label-lg border spring ${on ? 'bg-secondary-container text-on-secondary-container border-transparent' : 'border-[var(--md-sys-color-outline-variant)] hover:bg-surface-container-high'}`}>
      {on && <m3e-icon variant="rounded" name="check" style={{ ['--m3e-icon-size' as any]: '16px', marginRight: 4, verticalAlign: '-3px' }} />}{children}
    </button>
  );
}

function Choice<T>({ options, value, onPick }: { options: Array<[T, string]>; value: T; onPick: (v: T) => void }) {
  return <div className="flex flex-wrap gap-1.5">{options.map(([v, label]) => <Chip key={String(v)} on={v === value} onClick={() => onPick(v)}>{label}</Chip>)}</div>;
}

/** Creates a smart playlist ([playlistId] absent) or changes the rules of one. */
export function SmartEditor({ open, onClose, playlistId, initial }: { open: boolean; onClose: () => void; playlistId?: string; initial?: SmartRules }) {
  const tr = useTr();
  const nav = useNavigate();
  const qc = useQueryClient();
  const genres = useGenres();
  const [title, setTitle] = useState('');
  const [r, setR] = useState<SmartRules>(initial ?? { sort: 'random', limit: 100 });
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<SmartRules>) => setR((x) => ({ ...x, ...p }));
  const label = (text: string) => <div className="md-title-sm mt-4 mb-1.5">{text}</div>;
  const save = async () => {
    setBusy(true);
    try {
      if (playlistId) {
        await setSmartRules(playlistId, r);
        await qc.invalidateQueries({ queryKey: ['playlist', playlistId] });
      } else {
        const p = await createSmart(title.trim() || tr('Умный плейлист', 'Smart playlist'), r);
        await qc.invalidateQueries({ queryKey: ['playlists'] });
        nav(`/playlist/${p.id}`);
      }
      onClose();
    } catch (e: any) { useUI.getState().toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={playlistId ? tr('Правила плейлиста', 'Playlist rules') : tr('Умный плейлист', 'Smart playlist')} width="max-w-xl">
      <p className="md-body-md text-on-surface-variant">{tr('Собирается сам и обновляется каждые несколько часов', 'Builds itself and refreshes every few hours')}</p>
      {!playlistId && (
        <M3eFormField variant="outlined" className="w-full block mt-3">
          <span slot="label">{tr('Название', 'Title')}</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
        </M3eFormField>
      )}
      {label(tr('Жанры', 'Genres') + (r.genres?.length ? '' : ` · ${tr('любые', 'any')}`))}
      <div className="flex flex-wrap gap-1.5 max-h-40 overflow-auto">
        {(genres.data ?? []).slice(0, 40).map((g) => {
          const on = !!r.genres?.includes(g.name);
          return <Chip key={g.slug} on={on} onClick={() => set({ genres: on ? r.genres!.filter((x) => x !== g.name) : [...(r.genres ?? []), g.name] })}>{g.name}</Chip>;
        })}
      </div>
      {label(tr('Годы выпуска', 'Release years'))}
      <div className="flex gap-2">
        {(['yearFrom', 'yearTo'] as const).map((k) => (
          <M3eFormField key={k} variant="outlined" className="flex-1 block">
            <span slot="label">{k === 'yearFrom' ? tr('С', 'From') : tr('По', 'To')}</span>
            <input inputMode="numeric" value={r[k] ?? ''} onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, '').slice(0, 4)); set({ [k]: n >= 1900 && n <= 2100 ? n : null }); }} />
          </M3eFormField>
        ))}
      </div>
      {label(tr('Что брать', 'What to take'))}
      <div className="flex flex-wrap gap-1.5">
        <Chip on={!!r.liked} onClick={() => set({ liked: !r.liked })}>{tr('Только любимые', 'Liked only')}</Chip>
        <Chip on={!!r.noExplicit} onClick={() => set({ noExplicit: !r.noExplicit })}>{tr('Без explicit', 'No explicit')}</Chip>
      </div>
      {label(tr('Добавлены на сервер', 'Added to the server'))}
      <Choice options={[[null, tr('Когда угодно', 'Any time')], [7, tr('За неделю', 'Last week')], [30, tr('За месяц', 'Last month')], [90, tr('За 3 месяца', 'Last 3 months')], [365, tr('За год', 'Last year')]]}
        value={r.addedDays ?? null} onPick={(v) => set({ addedDays: v })} />
      {label(tr('Давно не слушал(а)', 'Not played for'))}
      <Choice options={[[null, tr('Неважно', "Doesn't matter")], [30, tr('Месяц', 'A month')], [90, tr('3 месяца', '3 months')], [180, tr('Полгода', 'Half a year')]]}
        value={r.notPlayedDays ?? null} onPick={(v) => set({ notPlayedDays: v })} />
      {label(tr('Слушал(а) хотя бы', 'Played at least'))}
      <Choice options={[[null, tr('Неважно', "Doesn't matter")], [1, tr('1 раз', 'once')], [3, tr('3 раза', '3 times')], [10, tr('10 раз', '10 times')]]}
        value={r.minPlays ?? null} onPick={(v) => set({ minPlays: v })} />
      {label(tr('Порядок', 'Order'))}
      <Choice options={[['random', tr('Случайно', 'Random')], ['recent', tr('Недавно добавленные', 'Recently added')], ['newest', tr('Свежие релизы', 'Newest releases')], ['popular', tr('Популярные', 'Popular')], ['mostPlayed', tr('Мои частые', 'My most played')]]}
        value={r.sort ?? 'random'} onPick={(v) => set({ sort: v as SmartRules['sort'] })} />
      {label(tr('Сколько треков', 'How many tracks'))}
      <Choice options={[[25, '25'], [50, '50'], [100, '100'], [200, '200'], [500, '500']]} value={r.limit ?? 100} onPick={(v) => set({ limit: v })} />
      <div className="flex justify-end gap-2 pt-5">
        <M3eButton variant="text" onClick={onClose}>{tr('Отмена', 'Cancel')}</M3eButton>
        <M3eButton variant="filled" disabled={busy || undefined} onClick={save}>{playlistId ? tr('Сохранить', 'Save') : tr('Создать', 'Create')}</M3eButton>
      </div>
    </Modal>
  );
}
