export type ContentType = "movie" | "tv";

export interface WatchResult {
  id: string;
  url: string;
  provider: string;
  type: ContentType;
  name: string;
  year?: string;
  rating?: string;
  description?: string;
}

export type WatchFailureReason =
  | "invalid_input"
  | "tmdb_ambiguous"
  | "tmdb_not_found"
  | "metadata_missing"
  | "no_providers";

// One shape for every transport. The client branches on `reason`, never on the
// message text.
export type WatchOutcome =
  | { ok: true; result: WatchResult }
  | { ok: false; status: 400 | 502 | 503; reason: WatchFailureReason; error: string };
