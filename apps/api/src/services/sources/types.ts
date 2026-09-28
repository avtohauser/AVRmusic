// Pluggable audio sources for the acquisition pipeline.
export type SourceName = 'youtube' | 'soundcloud' | 'audius' | 'jamendo' | 'archive';

export interface Want { title: string; artist: string; durationSec: number; featuring?: string[]; album?: string | null }

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
  /** Download the candidate into `dir`; resolves with the file path. */
  download(c: SourceCandidate, dir: string, log: Log, cancel: CancelRef, meta: DownloadMeta): Promise<string>;
}
