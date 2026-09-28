import { useState } from 'react';
import { GripVertical, ListX, X } from 'lucide-react';
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
    <div className={`flex flex-col h-full ${embedded ? '' : 'glass border-l border-line'}`}>
      {!embedded && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-line">
          <h3 className="font-bold">{t('queue')}</h3>
          <div className="flex gap-1">
            <button className="icon-btn" title="clear" onClick={clear}><ListX size={18} /></button>
            {onClose && <button className="icon-btn" onClick={onClose}><X size={18} /></button>}
          </div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-2">
        {current && (
          <>
            <p className="text-xs uppercase tracking-wider text-muted px-2 pt-2 pb-1">{t('nowPlaying')}</p>
            <Row cover={current.coverUrl} title={current.title} artist={current.artist.name} duration={current.durationMs} active />
          </>
        )}
        {upcoming.length > 0 && <p className="text-xs uppercase tracking-wider text-muted px-2 pt-4 pb-1">{t('next')}</p>}
        {upcoming.map((tr, i) => {
          const qi = index + 1 + i;
          return (
            <div key={`${tr.id}-${qi}`} draggable onDragStart={() => setDrag(qi)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (drag != null) move(drag, qi); setDrag(null); }} className={drag === qi ? 'opacity-40' : ''}>
              <Row cover={tr.coverUrl} title={tr.title} artist={tr.artist.name} duration={tr.durationMs} onClick={() => jumpTo(qi)} onRemove={() => remove(qi)} />
            </div>
          );
        })}
        {!queue.length && <p className="text-muted text-center py-10">—</p>}
      </div>
    </div>
  );
}

function Row({ cover, title, artist, duration, active, onClick, onRemove }: { cover: string | null; title: string; artist: string; duration: number; active?: boolean; onClick?: () => void; onRemove?: () => void }) {
  return (
    <div className={`group flex items-center gap-3 p-2 rounded-xl hover:bg-surface ${onClick ? 'cursor-pointer' : ''}`} onClick={onClick}>
      {onRemove && <GripVertical size={14} className="text-muted opacity-0 group-hover:opacity-100 cursor-grab" />}
      <Cover src={cover} className="w-10 h-10" />
      <div className="min-w-0 flex-1">
        <div className={`font-medium line-clamp-1 ${active ? 'text-accent' : ''}`}>{title}</div>
        <div className="text-sm text-muted line-clamp-1">{artist}</div>
      </div>
      <span className="text-xs text-muted tabular-nums">{fmtMs(duration)}</span>
      {onRemove && <button className="icon-btn opacity-0 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); onRemove(); }}><X size={16} /></button>}
    </div>
  );
}
