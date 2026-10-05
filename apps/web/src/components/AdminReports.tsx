// Admin: listeners' reports on tracks (fetch again or dismiss) and the Spotify app for moving libraries.
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { M3eButton, M3eFormField } from '@/md';
import { api } from '@/lib/api';
import { usePlayer } from '@/stores/player';
import { useUI } from '@/stores/ui';
import { ago, useReports, useTr } from '@/lib/social';
import { reasonLabel } from './Social';
import { Cover } from './Cover';
import { EmptyState } from './EmptyState';

export function ReportsTab() {
  const { data, isLoading } = useReports();
  const qc = useQueryClient();
  const tr = useTr();
  const toast = useUI((s) => s.toast);
  const act = async (id: string, what: 'refetch' | 'dismiss') => {
    try {
      await api.post(`/api/admin/reports/${id}/${what}`, {});
      toast(what === 'refetch' ? tr('Трек перекачивается — ход в «Загрузках»', 'Fetching the track again — see Downloads') : tr('Жалоба закрыта', 'Report dismissed'), 'success');
      qc.invalidateQueries({ queryKey: ['reports'] });
    } catch (e: any) { toast(e.message, 'error'); }
  };
  return (
    <div className="grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-6 items-start">
      <section>
        <h2 className="md-headline-sm emph mb-3">{tr('Жалобы на треки', 'Track reports')}</h2>
        {isLoading && <p className="muted">…</p>}
        {data && !data.length && <EmptyState icon="flag" title={tr('Жалоб нет', 'No reports')} hint={tr('Когда кто-то пожалуется на трек, он появится здесь', 'Reported tracks show up here')} />}
        <div className="space-y-2">
          {(data ?? []).map((r) => (
            <div key={r.id} className="surface-low rounded-[24px] p-3 flex items-center gap-3 flex-wrap">
              <button onClick={() => usePlayer.getState().playTrack(r.track, 'report')} title={tr('Послушать', 'Listen')}><Cover src={r.track.coverUrl} className="w-14 h-14 !rounded-[14px]" /></button>
              <div className="min-w-0 flex-1">
                <div className="md-title-sm line-1">{r.track.artist.name} — {r.track.title}</div>
                <div className="md-body-sm text-error">{reasonLabel(r.reason, tr)}{r.note ? ` · «${r.note}»` : ''}</div>
                <div className="md-body-sm muted">{r.reporter ?? '—'} · {ago(r.createdAt)}</div>
              </div>
              <M3eButton variant="filled" onClick={() => act(r.id, 'refetch')}><m3e-icon variant="rounded" slot="icon" name="refresh" />{tr('Перекачать', 'Fetch again')}</M3eButton>
              <M3eButton variant="text" onClick={() => act(r.id, 'dismiss')}>{tr('Закрыть', 'Dismiss')}</M3eButton>
            </div>
          ))}
        </div>
      </section>
      <SpotifySetup />
    </div>
  );
}

function SpotifySetup() {
  const tr = useTr();
  const toast = useUI((s) => s.toast);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['admin-spotify'], queryFn: () => api.get<{ clientId: string; hasSecret: boolean; redirectUri: string }>('/api/admin/spotify') });
  const [id, setId] = useState('');
  const [secret, setSecret] = useState('');
  useEffect(() => { if (data) setId(data.clientId); }, [data]);
  const save = async () => {
    try { await api.put('/api/admin/spotify', { clientId: id.trim(), secret: secret.trim() || undefined }); setSecret(''); toast(tr('Spotify подключён', 'Spotify connected'), 'success'); qc.invalidateQueries({ queryKey: ['admin-spotify'] }); qc.invalidateQueries({ queryKey: ['transfer-status'] }); }
    catch (e: any) { toast(e.message, 'error'); }
  };
  return (
    <section className="surface-low rounded-[28px] p-5 space-y-3">
      <h2 className="md-title-lg emph flex items-center gap-2"><m3e-icon variant="rounded" name="swap_horiz" />{tr('Перенос из Spotify', 'Moving from Spotify')}</h2>
      <ol className="md-body-md list-decimal pl-5 space-y-1">
        <li>{tr('Создайте приложение на developer.spotify.com → Dashboard → Create app (Web API).', 'Create an app at developer.spotify.com → Dashboard → Create app (Web API).')}</li>
        <li>{tr('В Redirect URIs добавьте адрес ниже.', 'Add the address below to Redirect URIs.')}</li>
        <li>{tr('В User Management добавьте email-ы Spotify друзей (до 25 человек).', "Add your friends' Spotify emails in User Management (up to 25).")}</li>
        <li>{tr('Вставьте Client ID и Client Secret сюда.', 'Paste the Client ID and Client Secret here.')}</li>
      </ol>
      {data && (
        <button className="w-full text-left surface-highest rounded-[12px] px-3 py-2 md-body-sm break-all state-layer" title={tr('Скопировать', 'Copy')} onClick={() => navigator.clipboard?.writeText(data.redirectUri).then(() => toast(tr('Скопировано', 'Copied'), 'success'))}>
          <m3e-icon variant="rounded" name="content_copy" className="align-[-4px] mr-1" style={{ ['--m3e-icon-size' as any]: '16px' }} />{data.redirectUri}
        </button>
      )}
      <M3eFormField variant="outlined" className="w-full block"><span slot="label">Client ID</span><input value={id} onChange={(e) => setId(e.target.value)} autoComplete="off" /></M3eFormField>
      <M3eFormField variant="outlined" className="w-full block"><span slot="label">{data?.hasSecret ? tr('Client Secret (сохранён — оставьте пустым)', 'Client Secret (saved — leave empty)') : 'Client Secret'}</span><input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="new-password" /></M3eFormField>
      <M3eButton variant="filled" disabled={id.trim().length < 10 || (!data?.hasSecret && !secret.trim()) || undefined} onClick={save}><m3e-icon variant="rounded" slot="icon" name="check" />{tr('Сохранить', 'Save')}</M3eButton>
    </section>
  );
}
