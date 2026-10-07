// The servers at a glance for the admin: disks (the main server's and the music storage's), processor and
// memory, people online and listening, downloads — and the last day as small charts.
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useTr } from '@/lib/social';

interface Stats {
  disks: Array<{ name: string; total: number; free: number; used: number }>;
  music: { bytes: number; tracks: number; avgTrackBytes: number };
  cpu: { cores: number; busy: number; load: number[] };
  memory: { total: number; free: number; app: number };
  uptime: { server: number; app: number };
  people: { online: number; devices: number; listening: number; today: number };
  downloads: { running: number; queued: number; slots: number; accounts: number; exits: number };
  history: Array<{ at: string; load: number; mem: number; online: number; listening: number }>;
}

const gb = (b: number) => (b >= 1 << 40 ? `${(b / 2 ** 40).toFixed(1)} ТБ` : b >= 1 << 30 ? `${(b / 2 ** 30).toFixed(1)} ГБ` : `${Math.round(b / 2 ** 20)} МБ`);

function Spark({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 0.0001);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${40 - (v / max) * 36 - 2}`).join(' ');
  return <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="w-full h-12"><polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" /></svg>;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="surface-low rounded-[28px] p-5"><h2 className="md-title-lg mb-3">{title}</h2>{children}</section>;
}

function Tile({ value, caption }: { value: string; caption: string }) {
  return <div className="rounded-2xl bg-surface-container-high p-3 flex-1"><div className="md-headline-sm emph">{value}</div><div className="md-body-sm text-on-surface-variant">{caption}</div></div>;
}

export function ServerPanel() {
  const tr = useTr();
  const { data: s } = useQuery({ queryKey: ['admin-server'], queryFn: () => api.get<Stats>('/api/admin/server'), refetchInterval: 30_000 });
  if (!s) return <p className="md-body-md text-on-surface-variant">{tr('Загрузка…', 'Loading…')}</p>;
  const memUsed = s.memory.total ? 1 - s.memory.free / s.memory.total : 0;
  const room = s.disks[s.disks.length - 1]?.free ?? 0;
  const peakOnline = Math.max(0, ...s.history.map((h) => h.online));
  return (
    <div className="grid md:grid-cols-2 gap-3 max-w-5xl">
      <Card title={tr('Люди', 'People')}>
        <div className="flex gap-2">
          <Tile value={String(s.people.online)} caption={tr('онлайн', 'online')} />
          <Tile value={String(s.people.listening)} caption={tr('слушают', 'listening')} />
          <Tile value={String(s.people.today)} caption={tr('за сутки', 'today')} />
        </div>
        <Spark values={s.history.map((h) => h.online)} color="var(--md-sys-color-primary)" />
        <div className="md-label-sm text-on-surface-variant">{tr(`онлайн за сутки · пик ${peakOnline} · открытых приложений и вкладок: ${s.people.devices}`, `online over a day · peak ${peakOnline} · open apps and tabs: ${s.people.devices}`)}</div>
      </Card>
      <Card title={tr('Диски', 'Disks')}>
        {s.disks.map((d) => {
          const part = d.total ? d.used / d.total : 0;
          return (
            <div key={d.name} className="mb-3">
              <div className="md-title-sm">{d.name}</div>
              <div className="h-2 rounded-full bg-surface-container-high overflow-hidden my-1"><div className={`h-full ${part > 0.9 ? 'bg-error' : 'bg-primary'}`} style={{ width: `${part * 100}%` }} /></div>
              <div className="md-body-sm text-on-surface-variant">{tr(`Свободно ${gb(d.free)} из ${gb(d.total)}`, `${gb(d.free)} free of ${gb(d.total)}`)}</div>
            </div>
          );
        })}
        {s.music.avgTrackBytes > 0 && <div className="md-body-md">{tr(`Музыка: ${gb(s.music.bytes)}, ${s.music.tracks} треков — места ещё примерно на ${Math.floor(room / s.music.avgTrackBytes)}`, `Music: ${gb(s.music.bytes)}, ${s.music.tracks} tracks — room for about ${Math.floor(room / s.music.avgTrackBytes)} more`)}</div>}
      </Card>
      <Card title={tr('Процессор и память', 'Processor and memory')}>
        <div className="flex gap-2">
          <Tile value={`${Math.round(s.cpu.busy * 100)}%`} caption={tr(`процессор · ${s.cpu.cores} ядер`, `processor · ${s.cpu.cores} cores`)} />
          <Tile value={`${Math.round(memUsed * 100)}%`} caption={tr(`память · ${gb(s.memory.total)}`, `memory · ${gb(s.memory.total)}`)} />
        </div>
        <Spark values={s.history.map((h) => h.load)} color="var(--md-sys-color-tertiary)" />
        <div className="md-label-sm text-on-surface-variant">{tr(`нагрузка 1/5/15 мин: ${s.cpu.load.map((l) => l.toFixed(2)).join(' / ')} · приложение ${gb(s.memory.app)} · сервер работает ${Math.floor(s.uptime.server / 3600)} ч`, `load 1/5/15 min: ${s.cpu.load.map((l) => l.toFixed(2)).join(' / ')} · app ${gb(s.memory.app)} · up ${Math.floor(s.uptime.server / 3600)} h`)}</div>
      </Card>
      <Card title={tr('Загрузки', 'Downloads')}>
        <p className="md-body-md">{tr(`Сейчас качается: ${s.downloads.running}, в очереди: ${s.downloads.queued}. Одновременно — до ${s.downloads.slots} (аккаунтов YouTube: ${s.downloads.accounts}, серверов-выходов: ${s.downloads.exits}).`, `Downloading: ${s.downloads.running}, queued: ${s.downloads.queued}. Up to ${s.downloads.slots} at once (YouTube accounts: ${s.downloads.accounts}, exits: ${s.downloads.exits}).`)}</p>
        <p className="md-body-sm text-on-surface-variant mt-2">{s.cpu.busy > 0.8 ? tr('Процессор почти занят — больше людей лучше не звать, пока не станет свободнее.', 'The processor is nearly busy — better not to invite more people for now.') : tr('Один слушатель — около 0,3 Мбит/с, прослушивание почти не нагружает процессор: главное — место на дисках и скорость интернета.', 'A listener takes about 0.3 Mbit/s and barely loads the processor: disk space and bandwidth matter most.')}</p>
      </Card>
    </div>
  );
}
