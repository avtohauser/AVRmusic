import type { UploadCredits } from '../matching.js';
// Pluggable audio sources for the acquisition pipeline.
export type SourceName = 'youtube' | 'soundcloud' | 'audius' | 'jamendo' | 'archive';

export interface Want {
  title: string;
  artist: string;
  durationSec: number;
  /** Guests named in the title ("Song (feat. X)"): the upload has to credit them. */
  featuring?: string[];
  /** Every other artist credited on the recording (may be wider than `featuring`). */
  credits?: string[];
  album?: string | null;
}

export interface SourceCandidate {
  source: SourceName;
  id: string;
  title: string;
  artist?: string | null;
  duration?: number | null;
  channel?: string | null;
  uploader?: string | null;
  url?: string;
  /** Direct file URL when the source serves files itself (Audius, Jamendo, Internet Archive). */
  downloadUrl?: string;
  quality?: { codec?: string; bitrate?: number; lossless?: boolean; format?: string };
  /** Start of the upload's description (YouTube Music uploads list every credited artist there). */
  description?: string | null;
  /** Who the upload credits (see services/matching.ts); filled in by `details()`. */
  credits?: UploadCredits | null;
  extra?: Record<string, unknown>;
}

export interface DownloadMeta { title: string; artist: string; album?: string; track?: number; year?: number }
export interface CancelRef { cancel?: () => void }
export type Log = (s: string) => void;

export interface Source {
  name: SourceName;
  label: string;
  /** Whether the source is configured/usable right now (binary present, key set, …). */
  available(): Promise<{ ok: boolean; reason?: string }>;
  search(want: Want): Promise<SourceCandidate[]>;
  /** Full title / channel / description of one upload, for sources whose search results are terse. */
  details?(c: Pick<SourceCandidate, 'id' | 'url'>): Promise<Pick<SourceCandidate, 'title' | 'channel' | 'description' | 'artist' | 'credits' | 'duration'> | null>;
  /** Download the candidate into `dir`; resolves with the file path. */
  download(c: SourceCandidate, dir: string, log: Log, cancel: CancelRef, meta: DownloadMeta): Promise<string>;
}
