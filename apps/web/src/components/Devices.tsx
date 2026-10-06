// The listener's other devices, from the player bar: what each plays, its buttons, and moving the music
// between this tab and them.
import { useEffect, useState } from 'react';
import { M3eButton, M3eIconButton } from '@/md';
import { Modal } from './Modal';
import { commandDevice, deviceId, reportDevice, sendToDevice, takeFromDevice, useDevices } from '@/lib/devices';
import { useTr } from '@/lib/social';
import { usePlayer } from '@/stores/player';
import type { DeviceInfo } from '@/lib/features';

export function DevicesButton() {
  const tr = useTr();
  const list = useDevices((s) => s.list);
  const [open, setOpen] = useState(false);
  const others = list.filter((d) => !d.current && d.id !== deviceId);
  if (!others.length) return null;
  const playing = others.some((d) => d.playing);
  return (
    <>
      <M3eIconButton aria-label={tr('Устройства', 'Devices')} onClick={() => setOpen(true)}>
        <m3e-icon variant="rounded" name="devices" style={playing ? { color: 'var(--md-sys-color-primary)' } : undefined} />
      </M3eIconButton>
      {open && <DevicesDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function DevicesDialog({ onClose }: { onClose: () => void }) {
  const tr = useTr();
  const list = useDevices((s) => s.list);
  const hasMusic = usePlayer((s) => s.queue.length > 0);
  useEffect(() => { void reportDevice(); const t = setInterval(() => void reportDevice(), 4000); return () => clearInterval(t); }, []);
  const others = list.filter((d) => !d.current && d.id !== deviceId);
  return (
    <Modal open onClose={onClose} title={tr('Устройства', 'Devices')}>
      <p className="md-body-md text-on-surface-variant mb-3">{tr('Где вы вошли в avr music: управляйте ими и переносите музыку', 'Where you are signed in to avr music: control them and move the music')}</p>
      {!others.length && <p className="md-body-md text-on-surface-variant py-4">{tr('Других устройств сейчас нет.', 'No other devices right now.')}</p>}
      {others.map((d) => <DeviceCard key={d.id} d={d} canSend={hasMusic} />)}
    </Modal>
  );
}

function DeviceCard({ d, canSend }: { d: DeviceInfo; canSend: boolean }) {
  const tr = useTr();
  const [vol, setVol] = useState(d.volume);
  const cmd = (type: string, extra: Record<string, unknown> = {}) => void commandDevice(d.id, { type, ...extra });
  return (
    <div className={`rounded-3xl p-4 mb-2 ${d.playing ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container-high'}`}>
      <div className="flex items-center gap-3">
        <m3e-icon variant="rounded" name={d.kind === 'web' ? 'computer' : 'smartphone'} />
        <div className="min-w-0 flex-1">
          <div className="md-title-md line-1">{d.name}</div>
          <div className="md-body-sm opacity-80 line-1">{d.track ? `${d.playing ? '♪' : '❚❚'} ${d.track.title} · ${d.track.artist.name}` : tr('Ничего не играет', 'Nothing playing')}</div>
        </div>
      </div>
      {d.track && (
        <div className="flex items-center justify-center gap-1 mt-1">
          <M3eIconButton aria-label={tr('Предыдущий', 'Previous')} onClick={() => cmd('prev')}><m3e-icon variant="rounded" name="skip_previous" filled /></M3eIconButton>
          <M3eIconButton variant="filled" aria-label={d.playing ? tr('Пауза', 'Pause') : tr('Играть', 'Play')} onClick={() => cmd(d.playing ? 'pause' : 'play')}><m3e-icon variant="rounded" name={d.playing ? 'pause' : 'play_arrow'} filled /></M3eIconButton>
          <M3eIconButton aria-label={tr('Следующий', 'Next')} onClick={() => cmd('next')}><m3e-icon variant="rounded" name="skip_next" filled /></M3eIconButton>
        </div>
      )}
      {d.kind === 'web' && (
        <div className="flex items-center gap-2 mt-1">
          <m3e-icon variant="rounded" name="volume_up" />
          <input type="range" min={0} max={1} step={0.01} value={vol} className="flex-1 accent-[var(--md-sys-color-primary)]"
            onChange={(e) => setVol(Number(e.target.value))} onPointerUp={() => cmd('volume', { volume: vol })} onKeyUp={() => cmd('volume', { volume: vol })} />
        </div>
      )}
      <div className="flex flex-wrap gap-2 mt-2">
        {canSend && <M3eButton variant="tonal" onClick={() => void sendToDevice(d)}><m3e-icon variant="rounded" slot="icon" name="cast" />{tr('Играть там', 'Play there')}</M3eButton>}
        {d.track && <M3eButton variant="outlined" onClick={() => void takeFromDevice(d)}><m3e-icon variant="rounded" slot="icon" name="download" />{tr('Забрать сюда', 'Take it here')}</M3eButton>}
      </div>
    </div>
  );
}
