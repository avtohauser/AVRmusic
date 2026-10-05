import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { M3eButton, M3eFormField, M3eSwitch } from '@/md';
import { Modal } from './Modal';
import { Cover } from './Cover';
import { useUI } from '@/stores/ui';
import { useAuth } from '@/stores/auth';
import { useMyPlaylists } from '@/lib/queries';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import type { Playlist } from '@avrmusic/shared';

export function AddToPlaylistModal() {
  const state = useUI((s) => s.addToPlaylist);
  const setState = useUI((s) => s.setAddToPlaylist);
  const setEditor = useUI((s) => s.setPlaylistEditor);
  const toast = useUI((s) => s.toast);
  const user = useAuth((s) => s.user);
  const { data } = useMyPlaylists();
  const qc = useQueryClient();
  const t = useT();
  const [busy, setBusy] = useState<string | null>(null);
  const mine = (data ?? []).filter((p) => p.canEdit ?? p.owner.id === user?.id);
  const add = async (id: string) => {
    setBusy(id);
    try {
      const r = await api.post<{ added: number }>(`/api/playlists/${id}/tracks`, { trackIds: state!.trackIds });
      toast(r.added ? `${t('added')}: ${r.added}` : t('added'), 'success');
      qc.invalidateQueries({ queryKey: ['playlist', id] });
      qc.invalidateQueries({ queryKey: ['playlists'] });
      setState(null);
    } catch { toast(t('error'), 'error'); } finally { setBusy(null); }
  };
  return (
    <Modal open={!!state} onClose={() => setState(null)} title={t('addToPlaylist')}>
      <button className="w-full flex items-center gap-3 p-2 rounded-[20px] state-layer" onClick={() => { const ids = state!.trackIds; setState(null); setEditor({ initial: { title: '', description: '', isPublic: true }, ...({ trackIds: ids } as any) }); }}>
        <span className="w-12 h-12 rounded-[16px] bg-primary text-on-primary flex items-center justify-center"><m3e-icon variant="rounded" name="add" /></span>
        <span className="md-title-sm">{t('newPlaylist')}</span>
      </button>
      <div className="mt-2 max-h-[50vh] overflow-y-auto">
        {mine.map((p) => (
          <button key={p.id} disabled={busy === p.id} className="w-full flex items-center gap-3 p-2 rounded-[20px] state-layer disabled:opacity-50" onClick={() => add(p.id)}>
            <Cover src={p.coverUrl} mosaic={(p as any).mosaic} className="w-12 h-12 !rounded-[14px]" />
            <span className="text-left flex-1 min-w-0"><span className="block md-title-sm line-1">{p.title}</span><span className="md-body-sm muted">{p.trackCount} {t('tracksCount')}</span></span>
            <m3e-icon variant="rounded" name={p.isPublic ? 'public' : 'lock'} className="muted" />
          </button>
        ))}
      </div>
    </Modal>
  );
}

export function PlaylistEditorModal() {
  const editor = useUI((s) => s.playlistEditor) as (ReturnType<typeof useUI.getState>['playlistEditor'] & { trackIds?: string[] }) | null;
  const setEditor = useUI((s) => s.setPlaylistEditor);
  const toast = useUI((s) => s.toast);
  const qc = useQueryClient();
  const nav = useNavigate();
  const t = useT();
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [isPublic, setPublic] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (editor) { setTitle(editor.initial?.title ?? ''); setDesc(editor.initial?.description ?? ''); setPublic(editor.initial?.isPublic ?? true); }
  }, [editor]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      if (editor?.id) {
        await api.patch(`/api/playlists/${editor.id}`, { title: title.trim(), description: desc.trim() || null, isPublic });
        qc.invalidateQueries({ queryKey: ['playlist', editor.id] });
        toast(t('saved'), 'success');
      } else {
        const p = await api.post<Playlist>('/api/playlists', { title: title.trim(), description: desc.trim() || null, isPublic, trackIds: editor?.trackIds });
        toast(t('added'), 'success');
        nav(`/playlist/${p.id}`);
      }
      qc.invalidateQueries({ queryKey: ['playlists'] });
      setEditor(null);
    } catch (err: any) { toast(err?.message ?? t('error'), 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal open={!!editor} onClose={() => setEditor(null)} title={editor?.id ? t('editPlaylist') : t('createPlaylist')}>
      <form onSubmit={submit} className="space-y-4">
        <M3eFormField variant="outlined" className="w-full block">
          <span slot="label">{t('title')}</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus maxLength={120} required />
        </M3eFormField>
        <M3eFormField variant="outlined" className="w-full block">
          <span slot="label">{t('description')}</span>
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={500} rows={3} />
        </M3eFormField>
        <label className="flex items-center justify-between gap-3 cursor-pointer select-none md-body-lg">
          <span>{isPublic ? t('publicPlaylist') : t('privatePlaylist')}</span>
          <M3eSwitch checked={isPublic || undefined} icons="selected" onChange={(e: Event) => setPublic(!!(e.target as any).checked)} />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <M3eButton variant="text" type="button" onClick={() => setEditor(null)}>{t('cancel')}</M3eButton>
          <M3eButton variant="filled" type="submit" disabled={busy || !title.trim() || undefined}><m3e-icon variant="rounded" slot="icon" name="check" />{editor?.id ? t('save') : t('create')}</M3eButton>
        </div>
      </form>
    </Modal>
  );
}
