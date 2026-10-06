// The newer parts of the server for the site: smart playlists, the company's week, "guess the melody",
// the listener's own devices, and the outside services (Telegram, Last.fm, concerts, backups).
import { useQuery } from '@tanstack/react-query';
import type { FriendRef, Playlist, SmartRules, Track } from '@avrmusic/shared';
import { api } from './api';

/* ---------- smart playlists ---------- */

export const createSmart = (title: string, rules: SmartRules) => api.post<Playlist>('/api/playlists/smart', { title, rules });
export const setSmartRules = (id: string, rules: SmartRules) => api.put<Playlist>(`/api/playlists/${id}/rules`, { rules });

/* ---------- listen together: suggestions ---------- */

export interface JamSuggestion { track: Track; by: FriendRef | null; votes: number; voted: boolean; next: boolean }

/* ---------- guess the melody ---------- */

export interface GameView {
  id: string; host: FriendRef | null; state: 'lobby' | 'round' | 'reveal' | 'done'; round: number; rounds: number; source: string;
  players: Array<{ user: FriendRef; score: number; answered: boolean; points: number | null; correct: boolean | null }>;
  options: Array<{ n: number; title: string; artist: string }>;
  clipUrl: string | null; clipOffsetMs: number; clipMs: number; startsAt: number | null; endsAt: number | null;
  myChoice: number | null; answer: { n: number; track: Track | null } | null; played: Track[]; version: number; serverNow: number;
}

export const game = {
  mine: () => api.get<GameView | null>('/api/game'),
  create: (source: string, rounds: number) => api.post<GameView>('/api/games', { source, rounds }),
  get: (id: string, v?: number) => api.get<GameView | null>(`/api/games/${id}${v !== undefined ? `?v=${v}` : ''}`),
  join: (id: string) => api.post<GameView>(`/api/games/${id}/join`, {}),
  leave: (id: string) => api.post(`/api/games/${id}/leave`, {}),
  next: (id: string) => api.post<GameView>(`/api/games/${id}/next`, {}),
  answer: (id: string, n: number) => api.post<GameView>(`/api/games/${id}/answer`, { n }),
};

/* ---------- devices ---------- */

export interface DeviceInfo { id: string; name: string; kind: 'android' | 'ios' | 'web'; current: boolean; track: Track | null; positionMs: number; playing: boolean; volume: number; seenAt: string }
export interface DeviceCommand { seq: number; from: string | null; type: string; positionMs?: number; volume?: number; trackIds?: string[]; index?: number; playing?: boolean }

/* ---------- Telegram, Last.fm, concerts ---------- */

export interface Integrations {
  telegram: { available: boolean; bot: string | null; linked: { username: string | null } | null };
  lastfm: { available: boolean; linked: { username: string | null } | null };
  city: string | null;
}
export interface Concert { id: string; artist: string; title: string; startsAt: string; date: string; place: string | null; address: string | null; url: string | null; imageUrl: string | null }

export const useIntegrations = () => useQuery({ queryKey: ['integrations'], queryFn: () => api.get<Integrations>('/api/me/integrations') });
export const useConcerts = () => useQuery({ queryKey: ['concerts'], queryFn: () => api.get<{ city: string | null; checkedAt: string | null; concerts: Concert[] }>('/api/me/concerts') });
export const useCities = (on: boolean) => useQuery({ queryKey: ['cities'], enabled: on, staleTime: 3600_000, queryFn: () => api.get<Array<{ slug: string; name: string }>>('/api/concerts/cities') });

/* ---------- the admin's side ---------- */

export const useTelegramAdmin = () => useQuery({ queryKey: ['admin-telegram'], queryFn: () => api.get<{ configured: boolean; bot: string | null }>('/api/admin/telegram') });
export const useLastfmAdmin = () => useQuery({ queryKey: ['admin-lastfm'], queryFn: () => api.get<{ key: string; hasSecret: boolean }>('/api/admin/lastfm') });
export const useBackups = () => useQuery({ queryKey: ['admin-backups'], queryFn: () => api.get<{ last: string | null; files: Array<{ name: string; size: number; at: string }> }>('/api/admin/backups') });
