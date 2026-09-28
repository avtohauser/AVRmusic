// Shared API contract between @avrmusic/api and @avrmusic/web.

export type Role = 'admin' | 'user';

export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  role: Role;
  avatarUrl: string | null;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Long-lived token accepted by /api/stream, /api/download, /api/canvas via ?t= */
  mediaToken: string;
  user: User;
}

export interface ArtistSummary {
  id: string;
  name: string;
  imageUrl: string | null;
}

export interface Artist extends ArtistSummary {
  bio: string | null;
  headerUrl: string | null;
  verified: boolean;
  followers: number;
  monthlyListeners: number;
  liked?: boolean;
}

export interface AlbumSummary {
  id: string;
  title: string;
  year: number | null;
  type: 'album' | 'single' | 'ep' | 'compilation';
  coverUrl: string | null;
  artist: ArtistSummary;
  trackCount: number;
  durationMs: number;
}

export interface Album extends AlbumSummary {
  description: string | null;
  releaseDate: string | null;
  label: string | null;
  tracks: Track[];
  liked?: boolean;
}

export interface Track {
  id: string;
  title: string;
  trackNo: number | null;
  discNo: number | null;
  durationMs: number;
  explicit: boolean;
  genre: string | null;
  playCount: number;
  mimeType: string;
  fileSize: number;
  bitrate: number | null;
  sampleRate: number | null;
  codec: string | null;
  hasLyrics: boolean;
  hasSyncedLyrics: boolean;
  hasCanvas: boolean;
  canvasKind: 'video' | 'image' | null;
  coverUrl: string | null;
  artist: ArtistSummary;
  featuring: ArtistSummary[];
  album: { id: string; title: string; year: number | null } | null;
  liked?: boolean;
  addedAt?: string;
  createdAt: string;
}

export interface LyricLine {
  timeMs: number;
  text: string;
}

export interface Lyrics {
  trackId: string;
  plain: string | null;
  synced: LyricLine[] | null;
  source: string | null;
}

export interface PlaylistSummary {
  id: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  isPublic: boolean;
  owner: { id: string; username: string; displayName: string };
  trackCount: number;
  durationMs: number;
  updatedAt: string;
  liked?: boolean;
  isOwner?: boolean;
}

export interface Playlist extends PlaylistSummary {
  tracks: Track[];
  /** First 4 track covers, used for mosaic when no custom cover is set */
  mosaic: string[];
}

export interface Genre {
  slug: string;
  name: string;
  color: string;
  trackCount: number;
  coverUrl: string | null;
}

export interface SearchResult {
  query: string;
  top: { kind: 'track' | 'album' | 'artist' | 'playlist'; item: Track | AlbumSummary | ArtistSummary | PlaylistSummary } | null;
  tracks: Track[];
  albums: AlbumSummary[];
  artists: ArtistSummary[];
  playlists: PlaylistSummary[];
}

export interface HomeSection {
  id: string;
  title: string;
  subtitle?: string;
  kind: 'tracks' | 'albums' | 'artists' | 'playlists' | 'genres' | 'mixed';
  items: Array<Track | AlbumSummary | ArtistSummary | PlaylistSummary | Genre>;
}

export interface HomeFeed {
  greeting: string;
  quickPicks: Array<AlbumSummary | PlaylistSummary | { id: string; kind: 'liked'; title: string; trackCount: number }>;
  sections: HomeSection[];
}

export interface PlayEvent {
  trackId: string;
  msPlayed: number;
  context?: string;
}

export interface HistoryEntry {
  id: number;
  playedAt: string;
  msPlayed: number;
  context: string | null;
  track: Track;
}

export interface AdminStats {
  users: number;
  artists: number;
  albums: number;
  tracks: number;
  playlists: number;
  plays: number;
  storageBytes: number;
  withLyrics: number;
  withCanvas: number;
}

export interface UploadResult {
  imported: Track[];
  skipped: Array<{ file: string; reason: string }>;
}

export interface ServerInfo {
  name: string;
  version: string;
  allowRegistration: boolean;
  publicLibrary: boolean;
  maxUploadMb: number;
  needsSetup: boolean;
}

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}

export type Paginated<T> = { items: T[]; total: number; offset: number; limit: number };
