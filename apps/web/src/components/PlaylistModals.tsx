import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Check, Lock, Globe } from 'lucide-react';
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
  const mine = (data ?? []).filter((p) => p.owner.id === user?.id);
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
      <button className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-surface" onClick={() => { const ids = state!.trackIds; setState(null); setEditor({ initial: { title: '', description: '', isPublic: true }, ...( { trackIds: ids } as any) }); }}>
        <span className="w-12 h-12 rounded-lg accent-gradient flex items-center justify-center text-white"><Plus /></span>
        <span className="font-semibold">{t('newPlaylist')}</span>
      </button>
      <div className="mt-2 max-h-[50vh] overflow-y-auto">
        {mine.map((p) => (
          <button key={p.id} disabled={busy === p.id} className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-surface disabled:opacity-50" onClick={() => add(p.id)}>
            <Cover src={p.coverUrl} mosaic={(p as any).mosaic} className="w-12 h-12" />
            <span className="text-left flex-1 min-w-0"><span className="block font-medium line-clamp-1">{p.title}</span><span className="text-xs text-muted">{p.trackCount} {t('tracksCount')}</span></span>
            {p.isPublic ? <Globe size={14} className="text-muted" /> : <Lock size={14} className="text-muted" />}
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
        <div><label className="label">{t('title')}</label><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus maxLength={120} required /></div>
        <div><label className="label">{t('description')}</label><textarea className="input" value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={500} rows={3} /></div>
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <span className={`w-11 h-6 rounded-full p-0.5 transition-colors ${isPublic ? 'bg-accent' : 'bg-surface-2'}`} onClick={() => setPublic(!isPublic)}><span className={`block w-5 h-5 rounded-full bg-white transition-transform ${isPublic ? 'translate-x-5' : ''}`} /></span>
          <span className="text-sm">{isPublic ? t('publicPlaylist') : t('privatePlaylist')}</span>
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn btn-ghost" onClick={() => setEditor(null)}>{t('cancel')}</button>
          <button type="submit" className="btn btn-primary" disabled={busy || !title.trim()}><Check size={16} />{editor?.id ? t('save') : t('create')}</button>
        </div>
      </form>
    </Modal>
  );
}
