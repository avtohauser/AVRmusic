import { config } from '../../config.js';
import { ytdlpSource } from './ytdlp.js';
import { audiusSource } from './audius.js';
import { jamendoSource } from './jamendo.js';
import { archiveSource } from './archive.js';
import type { Source, SourceName } from './types.js';

const ALL: Record<SourceName, Source> = {
  youtube: ytdlpSource('youtube'),
  soundcloud: ytdlpSource('soundcloud'),
  audius: audiusSource,
  jamendo: jamendoSource,
  archive: archiveSource,
};

/** Sources in the configured preference order. */
export function enabledSources(): Source[] {
  return config.acquireSources.map((n) => ALL[n]).filter(Boolean);
}
export function allSources(): Source[] { return Object.values(ALL); }
export type { Source, SourceCandidate, SourceName, Want, CancelRef, DownloadMeta } from './types.js';
