// Friends, the inbox, reactions, recaps, reports, following artists, blends / radar and moving a library
// here: the server's calls and react-query hooks for the pages.
import { useQuery } from '@tanstack/react-query';
import { create } from 'zustand';
import type { FriendRef, Track, AlbumSummary, ArtistSummary, PlaylistSummary, Playlist } from '@avrmusic/shared';
import { api } from './api';
import { useI18n } from './i18n';
import { useAuth } from '@/stores/auth';
import { useUI } from '@/stores/ui';

/** Russian or English text by the chosen language (for the newer pages). */
export function useTr() {
  const lang = useI18n((s) => s.lang);
  return (ru: string, en: string) => (lang === 'en' ? en : ru);
}
export const trNow = (ru: string, en: string) => (useI18n.getState().lang === 'en' ? en : ru);

export interface FriendNow { track: Track; positionMs: number; playing: boolean; at: string }
export interface Friend { id: string; username: string; displayName: string; avatarUrl: string | null; lastSeenAt: string | null; now: FriendNow | null; jamId: string | null }
export interface Compat { score: number; label: string; commonArtists: ArtistSummary[]; commonTracks: Track[] }
export interface FriendPage extends Friend { createdAt: string; stats: { minutes: number; topArtists: ArtistSummary[]; recent: Track[]; likes: number }; compat: Compat | null; playlists: PlaylistSummary[] }
export interface Share { id: string; from: FriendRef | null; kind: string; refId: string; item: any; message: string; seen: boolean; createdAt: string }
export interface Reaction { id: string; user: FriendRef | null; atMs: number; emoji: string; text: string; createdAt: string }
export interface JamView { id: string; host: FriendRef | null; members: FriendRef[]; queue: Track[]; index: number; positionMs: number; playing: boolean; version: number; serverNow: number; lastBy: FriendRef | null; lastAction: string | null }
export interface JamSummary { id: string; host: FriendRef | null; members: FriendRef[]; track: Track | null; playing: boolean }
export interface Recap {
  period: string; label: string; minutes: number; previousMinutes: number; plays: number; distinctTracks: number; distinctArtists: number; genres: number;
  newArtists: number; discoveries: number; streakDays: number; activeDays: number; busiestDay: { date: string; minutes: number } | null; peakHour: number | null; hours: number[];
  topTracks: Array<{ track: Track; plays: number; minutes: number }>; topArtists: Array<{ artist: ArtistSummary; minutes: number; plays: number }>;
  topGenres: Array<{ name: string; share: number }>; topAlbum: AlbumSummary | null; firstTrack: Track | null; personality: string;
}
export interface TrackReport { id: string; reason: string; note: string; createdAt: string; reporter: string | null; track: Track }

const authed = () => !!useAuth.getState().user;

export const useFriends = () => useQuery({ queryKey: ['friends'], queryFn: () => api.get<Friend[]>('/api/users'), enabled: authed(), refetchInterval: 30_000 });
export const useFriend = (id: string) => useQuery({ queryKey: ['friend', id], queryFn: () => api.get<FriendPage>(`/api/users/${id}`) });
export const useInbox = () => useQuery({ queryKey: ['inbox'], queryFn: () => api.get<Share[]>('/api/shares'), enabled: authed(), refetchInterval: 120_000 });
export const useJams = () => useQuery({ queryKey: ['jams'], queryFn: () => api.get<JamSummary[]>('/api/jams'), refetchInterval: 20_000 });
export const useReactions = (trackId: string | null) => useQuery({
  queryKey: ['reactions', trackId], enabled: !!trackId && !trackId.startsWith('dz:'),
  queryFn: () => api.get<Reaction[]>(`/api/tracks/${trackId}/reactions`),
});
export const useRecap = (period: string, offset: number) => useQuery({
  queryKey: ['recap', period, offset],
  queryFn: () => api.get<Recap>(`/api/me/recap?period=${period}&offset=${offset}&tz=${-new Date().getTimezoneOffset()}`),
});
export const useReports = () => useQuery({ queryKey: ['reports'], queryFn: () => api.get<TrackReport[]>('/api/admin/reports') });

export const sendShare = (to: string[], kind: string, refId: string, message: string) => api.post('/api/shares', { to, kind, refId, message });
export const react = (trackId: string, atMs: number, emoji: string, text: string) => api.post<Reaction>(`/api/tracks/${trackId}/reactions`, { atMs: Math.round(atMs), emoji, text });
export const report = (trackId: string, reason: string, note: string) => api.post(`/api/tracks/${trackId}/report`, { reason, note });
export const follow = (artistId: number, name: string, on: boolean) => (on ? api.put(`/api/catalog/artists/${artistId}/follow`, { name }) : api.del(`/api/catalog/artists/${artistId}/follow`));
export const createBlend = (userIds: string[]) => api.post<Playlist>('/api/playlists/blend', { userIds });
export const refreshPlaylist = (id: string) => api.post<Playlist>(`/api/playlists/${id}/refresh`, {});
export const radar = () => api.get<Playlist>('/api/me/radar');

export const compatLabel = (l: string) => ({
  twins: trNow('Музыкальные близнецы', 'Music twins'), close: trNow('Очень похожий вкус', 'Very similar taste'),
  common: trNow('Есть много общего', 'A lot in common'), different: trNow('Разные вкусы — есть что открыть', 'Different tastes — plenty to discover'),
} as Record<string, string>)[l] ?? trNow('Противоположности притягиваются', 'Opposites attract');

export const REACTIONS = ['🔥', '❤️', '😍', '🤘', '😂', '😮', '😢', '👏', '💃', '🎧'];

/** "5 мин назад" */
export function ago(iso: string | null | undefined): string {
  if (!iso) return '—';
  const min = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (min < 1) return trNow('только что', 'just now');
  if (min < 60) return trNow(`${min} мин назад`, `${min} min ago`);
  if (min < 1440) return trNow(`${Math.floor(min / 60)} ч назад`, `${Math.floor(min / 60)} h ago`);
  if (min < 2880) return trNow('вчера', 'yesterday');
  return new Date(iso).toLocaleDateString();
}

/* ---------- the friend picker (send, blend, invite an owner) and the report dialog ---------- */

export interface PickerRequest {
  title: string; button: string; multi?: boolean; max?: number; message?: boolean; exclude?: string[];
  run: (ids: string[], message: string) => Promise<unknown>;
}
export const useSocialUI = create<{ picker: PickerRequest | null; report: Track | null }>(() => ({ picker: null, report: null }));
export const pickFriends = (picker: PickerRequest) => useSocialUI.setState({ picker });
export const askReport = (track: Track) => useSocialUI.setState({ report: track });

/** "Отправить другу": a track, album, artist, playlist or an invitation to listen together. */
export function sendToFriends(kind: string, refId: string, title: string) {
  pickFriends({
    title: kind === 'jam' ? trNow('Позвать слушать вместе', 'Invite to listen together') : trNow(`Отправить «${title}»`, `Send “${title}”`),
    button: trNow('Отправить', 'Send'), multi: true, message: true,
    run: async (ids, message) => { await sendShare(ids, kind, refId, message); useUI.getState().toast(trNow('Отправлено', 'Sent'), 'success'); },
  });
}

/** A blend with the friends picked (or the ones given): the server fills it from each one's taste every day. */
export function blendWith(nav: (to: string) => void, tr: (ru: string, en: string) => string, preset?: string[]) {
  const make = async (ids: string[]) => { const p = await createBlend(ids); useUI.getState().toast(tr('Блендер готов — обновляется каждый день', 'The blend is ready — it refreshes every day'), 'success'); nav(`/playlist/${p.id}`); };
  if (preset?.length) return make(preset).catch((e) => useUI.getState().toast(e.message, 'error'));
  pickFriends({ title: tr('Блендер: общий плейлист из ваших вкусов', 'Blend: one playlist from your tastes'), button: tr('Создать', 'Create'), multi: true, max: 5, run: make });
}
