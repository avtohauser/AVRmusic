import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AcquireJob, Album, AlbumSummary, Artist, ArtistSummary, CatalogAlbumPage, CatalogArtistPage, CatalogSearchResult, Genre, HistoryEntry, HomeFeed, Lyrics, Paginated, Playlist, PlaylistSummary, SearchResult, Track } from '@avrmusic/shared';
import { api } from './api';
import { useAuth } from '@/stores/auth';

export type ArtistFull = Artist & { albums: AlbumSummary[]; topTracks: Track[]; related: ArtistSummary[]; appearsOn: AlbumSummary[] };

const canBrowse = () => { const s = useAuth.getState(); return !!s.user || !!s.info?.publicLibrary; };

export const useHome = () => useQuery({ queryKey: ['home'], queryFn: () => api.get<HomeFeed>('/api/home'), enabled: canBrowse(), staleTime: 60_000 });
export const useSearch = (q: string, type = 'all') => useQuery({ queryKey: ['search', q, type], queryFn: () => api.get<SearchResult>(`/api/search?q=${encodeURIComponent(q)}&type=${type}&limit=${type === 'all' ? 8 : 50}`), enabled: q.trim().length > 0 && canBrowse(), staleTime: 30_000, placeholderData: (p) => p });
export const useAlbum = (id: string | undefined) => useQuery({ queryKey: ['album', id], queryFn: () => api.get<Album>(`/api/albums/${id}`), enabled: !!id });
export const useArtist = (id: string | undefined) => useQuery({ queryKey: ['artist', id], queryFn: () => api.get<ArtistFull>(`/api/artists/${id}`), enabled: !!id });
export const usePlaylist = (id: string | undefined) => useQuery({ queryKey: ['playlist', id], queryFn: () => api.get<Playlist>(`/api/playlists/${id}`), enabled: !!id });
export const useMyPlaylists = () => { const user = useAuth((s) => s.user); return useQuery({ queryKey: ['playlists', 'mine', user?.id], queryFn: () => api.get<PlaylistSummary[]>('/api/playlists'), enabled: !!user, staleTime: 30_000 }); };
export const usePublicPlaylists = () => useQuery({ queryKey: ['playlists', 'public'], queryFn: () => api.get<PlaylistSummary[]>('/api/playlists/public'), enabled: canBrowse() });
export const useLikedTracks = () => { const user = useAuth((s) => s.user); return useQuery({ queryKey: ['liked', 'tracks', user?.id], queryFn: () => api.get<Track[]>('/api/me/likes/tracks'), enabled: !!user }); };
export const useLikedAlbums = () => { const user = useAuth((s) => s.user); return useQuery({ queryKey: ['liked', 'albums', user?.id], queryFn: () => api.get<AlbumSummary[]>('/api/me/likes/albums'), enabled: !!user }); };
export const useLikedArtists = () => { const user = useAuth((s) => s.user); return useQuery({ queryKey: ['liked', 'artists', user?.id], queryFn: () => api.get<ArtistSummary[]>('/api/me/likes/artists'), enabled: !!user }); };
export const useGenres = () => useQuery({ queryKey: ['genres'], queryFn: () => api.get<Genre[]>('/api/genres'), enabled: canBrowse(), staleTime: 120_000 });
export const useGenre = (slug: string | undefined) => useQuery({ queryKey: ['genre', slug], queryFn: () => api.get<{ genre: Genre; tracks: Track[]; albums: AlbumSummary[]; artists: ArtistSummary[] }>(`/api/genres/${slug}`), enabled: !!slug });
export const useLyrics = (id: string | null | undefined) => useQuery({ queryKey: ['lyrics', id], queryFn: () => api.get<Lyrics>(`/api/tracks/${id}/lyrics`), enabled: !!id, staleTime: 10 * 60_000 });
export const useHistory = () => { const user = useAuth((s) => s.user); return useQuery({ queryKey: ['history', user?.id], queryFn: () => api.get<HistoryEntry[]>('/api/me/history?limit=100'), enabled: !!user }); };
export const useAlbums = (sort = 'new') => useQuery({ queryKey: ['albums', sort], queryFn: () => api.get<Paginated<AlbumSummary>>(`/api/albums?sort=${sort}&limit=100`), enabled: canBrowse() });
export const useArtists = (sort = 'popular') => useQuery({ queryKey: ['artists', sort], queryFn: () => api.get<Paginated<ArtistSummary>>(`/api/artists?sort=${sort}&limit=100`), enabled: canBrowse() });

export const useCatalogSearch = (q: string) => useQuery({ queryKey: ['catalog', 'search', q], queryFn: () => api.get<CatalogSearchResult>(`/api/catalog/search?q=${encodeURIComponent(q)}&limit=12`), enabled: q.trim().length > 1 && canBrowse(), staleTime: 5 * 60_000, placeholderData: (p) => p });
export const useCatalogArtist = (id: number | undefined) => useQuery({ queryKey: ['catalog', 'artist', id], queryFn: () => api.get<CatalogArtistPage>(`/api/catalog/artists/${id}`), enabled: !!id, staleTime: 10 * 60_000 });
export const useCatalogAlbum = (id: number | undefined) => useQuery({ queryKey: ['catalog', 'album', id], queryFn: () => api.get<CatalogAlbumPage>(`/api/catalog/albums/${id}`), enabled: !!id, staleTime: 10 * 60_000 });
export const useAcquireJobs = () => {
  const user = useAuth((s) => s.user);
  return useQuery({ queryKey: ['acquire-jobs'], queryFn: () => api.get<AcquireJob[]>('/api/catalog/jobs'), enabled: !!user && !!useAuth.getState().info?.catalog, refetchInterval: (q) => ((q.state.data ?? []).some((j) => j.status === 'queued' || j.status === 'running') ? 2000 : 15000) });
};

export function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: string[]) => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
}
