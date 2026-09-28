import { useState } from 'react';
import { M3eIconButton } from '@/md';
import { usePlayer } from '@/stores/player';
import { Cover } from './Cover';
import { useT } from '@/lib/i18n';
import { fmtMs } from '@/lib/format';

export function QueuePanel({ onClose, embedded = false }: { onClose?: () => void; embedded?: boolean }) {
  const queue = usePlayer((s) => s.queue);
  const index = usePlayer((s) => s.index);
  const jumpTo = usePlayer((s) => s.jumpTo);
  const remove = usePlayer((s) => s.removeFromQueue);
  const move = usePlayer((s) => s.moveInQueue);
  const clear = usePlayer((s) => s.clearQueue);
  const t = useT();
  const [drag, setDrag] = useState<number | null>(null);
  const current = queue[index];
  const upcoming = queue.slice(index + 1);
  return (
    <div className="flex flex-col h-full">
      {!embedded && (
        <div className="flex items-center justify-between px-4 py-3">
          <h3 className="md-title-md emph">{t('queue')}</h3>
          <div className="flex gap-1">
            <M3eIconButton aria-label="clear" onClick={clear}><m3e-icon variant="rounded" name="playlist_remove" /></M3eIconButton>
            {onClose && <M3eIconButton aria-label="close" onClick={onClose}><m3e-icon variant="rounded" name="close" /></M3eIconButton>}
          </div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-2">
        {current && (
          <>
            <p className="md-label-md muted px-2 pt-2 pb-1 uppercase tracking-wider">{t('nowPlaying')}</p>
            <Row cover={current.coverUrl} title={current.title} artist={current.artist.name} duration={current.durationMs} active />
          </>
        )}
        {upcoming.length > 0 && <p className="md-label-md muted px-2 pt-4 pb-1 uppercase tracking-wider">{t('next')}</p>}
        {upcoming.map((tr, i) => {
          const qi = index + 1 + i;
          return (
            <div key={`${tr.id}-${qi}`} draggable onDragStart={() => setDrag(qi)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (drag != null) move(drag, qi); setDrag(null); }} className={drag === qi ? 'opacity-40' : ''}>
              <Row cover={tr.coverUrl} title={tr.title} artist={tr.artist.name} duration={tr.durationMs} onClick={() => jumpTo(qi)} onRemove={() => remove(qi)} />
            </div>
          );
        })}
        {!queue.length && <p className="muted text-center py-10">—</p>}
      </div>
    </div>
  );
}

function Row({ cover, title, artist, duration, active, onClick, onRemove }: { cover: string | null; title: string; artist: string; duration: number; active?: boolean; onClick?: () => void; onRemove?: () => void }) {
  return (
    <div className={`group flex items-center gap-3 p-2 rounded-[20px] state-layer ${active ? 'bg-secondary-container text-on-secondary-container' : ''} ${onClick ? 'cursor-pointer' : ''}`} onClick={onClick}>
      {onRemove && <m3e-icon variant="rounded" name="drag_handle" className="muted opacity-0 group-hover:opacity-100 cursor-grab" />}
      <Cover src={cover} className="w-10 h-10 !rounded-[12px]" />
      <div className="min-w-0 flex-1">
        <div className={`md-title-sm line-1 ${active ? 'text-primary' : ''}`}>{title}</div>
        <div className="md-body-sm muted line-1">{artist}</div>
      </div>
      <span className="md-label-sm muted tabular-nums">{fmtMs(duration)}</span>
      {onRemove && <M3eIconButton size="extra-small" className="opacity-0 group-hover:opacity-100" aria-label="remove" onClick={(e: any) => { e.stopPropagation(); onRemove(); }}><m3e-icon variant="rounded" name="close" /></M3eIconButton>}
    </div>
  );
}
