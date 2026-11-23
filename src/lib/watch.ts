import { TMDB_NOT_FOUND } from "./messages";
import { parseTitleInput } from "./parse-input";
import { resolveImdbId } from "./tmdb";
import { Cache, defaultHttpClient } from "./http";
import type { HttpClient } from "./http";
import { PROVIDERS_TTL_MS, selectStream } from "./providers";
import { resolveTitle } from "./metadata";
import type { TypeResult } from "./metadata";
import type { ContentType, WatchOutcome } from "./types";

export interface WatchDeps {
  http: HttpClient;
  typeCache: Cache<TypeResult>;
  providerCache: Cache<string>;
  domainCache: Cache<Array<string>>;
}

// One shape for every transport. Status mirrors the old API. The kind hint
// comes from the Movie/TV selector: a bare TMDB number takes it, so the
// ambiguous dual lookup never runs for UI flows.
export async function handleWatchRequest(
  deps: WatchDeps,
  input: { id: string; exclude?: string; kind?: ContentType },
): Promise<WatchOutcome> {
  const { http, typeCache, providerCache, domainCache } = deps;

  const parsed = parseTitleInput(input.id, input.kind);
  if (!parsed) {
    return {
      ok: false,
      status: 400,
      reason: "invalid_input",
      error: "Invalid IMDb or TMDB ID",
    };
  }

  let id: string;
  let preferred: ContentType | undefined;
  if (parsed.kind === "imdb") {
    id = parsed.id;
  } else {
    const mapped = await resolveImdbId(http, parsed.type, parsed.id);
    if (!mapped.ok) {
      return {
        ok: false,
        status: mapped.reason === "ambiguous" ? 400 : 502,
        reason: mapped.reason === "ambiguous" ? "tmdb_ambiguous" : "tmdb_not_found",
        error:
          mapped.reason === "ambiguous"
            ? "TMDB ID is ambiguous. Use a movie or TV link."
            : TMDB_NOT_FOUND,
      };
    }
    id = mapped.match.id;
    preferred = mapped.match.type;
  }

  const typeResult = await resolveTitle(id, http, typeCache, preferred);
  if (!typeResult.ok) {
    return {
      ok: false,
      status: 502,
      reason: "metadata_missing",
      error: "Failed to detect content type",
    };
  }

  const stream = await selectStream({
    http,
    type: typeResult.meta.type,
    id,
    exclude: input.exclude,
    providerCache,
    domainCache,
  });
  if (!stream) {
    return {
      ok: false,
      status: 503,
      reason: "no_providers",
      error: "No working providers available",
    };
  }

  return {
    ok: true,
    result: { id, url: stream.url, provider: stream.provider, ...typeResult.meta },
  };
}

// Singletons for the serverless function. Per-instance only;
// use a shared store (e.g. Upstash) if global limits are required.
export const watchDeps: WatchDeps = {
  http: defaultHttpClient,
  typeCache: new Cache<TypeResult>(60 * 60 * 1000),
  providerCache: new Cache<string>(5 * 60 * 1000),
  domainCache: new Cache<Array<string>>(PROVIDERS_TTL_MS),
};
