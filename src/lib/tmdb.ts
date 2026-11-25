import { Cache, defaultHttpClient, isLooseJson } from "./http";
import type { HttpClient, LooseJson } from "./http";
import type { Candidate, Kind, Mutable, Official } from "./types";
import { yearOf } from "./year";

// TMDB needs a free API key. The key is read at the action boundary and passed
// in, so nothing in this module owns configuration.
const API = "https://api.themoviedb.org/3";
const IMAGE_BASE = "https://image.tmdb.org/t/p/w342";
// TMDB regions are ISO 3166-1 alpha-2, uppercase. The site is India-first.
const WATCH_REGION = "IN";
const MAX_RESULTS = 6;
const TIMEOUT_MS = 8000;

export interface TmdbDeps {
  readonly key: string;
  readonly http: HttpClient;
  readonly searchCache: Cache<Array<Candidate>>;
  readonly officialCache: Cache<Official | null>;
}

const str = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const idOf = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;

const media = (kind: Kind): "movie" | "tv" => (kind === "tv" ? "tv" : "movie");

async function getJson(deps: TmdbDeps, path: string): Promise<LooseJson | null> {
  const url = `${API}${path}${path.includes("?") ? "&" : "?"}api_key=${encodeURIComponent(deps.key)}`;
  try {
    const response = await deps.http.get(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) {
      return null;
    }
    const value: unknown = JSON.parse(await response.text());
    return isLooseJson(value) ? value : null;
  } catch {
    return null;
  }
}

const imdbIdOf = async (deps: TmdbDeps, id: number, kind: Kind): Promise<string | null> => {
  const body = await getJson(deps, `/${media(kind)}/${id}/external_ids`);
  return body === null ? null : (str(body.imdb_id) ?? null);
};

// A search row already carries the language, so the filter costs nothing extra.
// Only the rows that survive it pay for their IMDb id, which the rest of the app
// needs.
const toCandidate = async (
  deps: TmdbDeps,
  row: LooseJson,
  kind: Kind,
): Promise<Candidate | null> => {
  const id = idOf(row.id);
  const name = str(media(kind) === "tv" ? row.name : row.title);
  if (id === undefined || name === undefined) {
    return null;
  }
  const imdbId = await imdbIdOf(deps, id, kind);
  if (imdbId === null) {
    return null;
  }
  const candidate: Mutable<Candidate> = { imdbId, name, kind };
  const year = yearOf(str(row.release_date) ?? str(row.first_air_date));
  if (year !== undefined) {
    candidate.year = year;
  }
  const poster = str(row.poster_path);
  if (poster !== undefined) {
    candidate.poster = `${IMAGE_BASE}${poster}`;
  }
  return candidate;
};

export async function searchByLanguage(
  deps: TmdbDeps,
  query: string,
  kind: Kind,
  language: string,
): Promise<Array<Candidate>> {
  const cleaned = query.trim();
  const key = `${kind}:${language}:${cleaned.toLowerCase()}`;
  const cached = deps.searchCache.get(key);
  if (cached) {
    return cached;
  }

  const body = await getJson(
    deps,
    `/search/${media(kind)}?query=${encodeURIComponent(cleaned)}&page=1`,
  );
  const rows = body !== null && Array.isArray(body.results) ? body.results : [];
  const matching = rows
    .filter((row) => isLooseJson(row) && row.original_language === language)
    .filter(isLooseJson)
    .slice(0, MAX_RESULTS);
  const candidates = (
    await Promise.all(matching.map((row) => toCandidate(deps, row, kind)))
  ).filter((candidate): candidate is Candidate => candidate !== null);
  deps.searchCache.set(key, candidates);
  return candidates;
}

const lookUpOfficial = async (
  deps: TmdbDeps,
  imdbId: string,
  kind: Kind,
): Promise<Official | null> => {
  const found = await getJson(deps, `/find/${encodeURIComponent(imdbId)}?external_source=imdb_id`);
  if (found === null) {
    return null;
  }
  const list = media(kind) === "tv" ? found.tv_results : found.movie_results;
  const first = Array.isArray(list) ? list[0] : undefined;
  const id = isLooseJson(first) ? idOf(first.id) : undefined;
  if (id === undefined) {
    return null;
  }

  const providers = await getJson(deps, `/${media(kind)}/${id}/watch/providers`);
  if (providers === null || !isLooseJson(providers.results)) {
    return null;
  }
  const region = providers.results[WATCH_REGION];
  if (!isLooseJson(region)) {
    return null;
  }

  const services = new Set<string>();
  for (const bucket of ["flatrate", "free"]) {
    const entries = region[bucket];
    if (!Array.isArray(entries)) {
      continue;
    }
    for (const entry of entries) {
      const name = isLooseJson(entry) ? str(entry.provider_name) : undefined;
      if (name !== undefined) {
        services.add(name);
      }
    }
  }
  const link = str(region.link);
  if (services.size === 0 || link === undefined) {
    return null;
  }
  return { services: [...services], link };
};

// A null result is cached too: "checked, nothing in this region" is an answer.
export async function officialFor(
  deps: TmdbDeps,
  imdbId: string,
  kind: Kind,
): Promise<Official | null> {
  const key = `${kind}:${imdbId}`;
  const cached = deps.officialCache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const official = await lookUpOfficial(deps, imdbId, kind);
  deps.officialCache.set(key, official);
  return official;
}

// Per-instance, like the other caches. One key per process.
const searchCache = new Cache<Array<Candidate>>(10 * 60 * 1000);
const officialCache = new Cache<Official | null>(6 * 60 * 60 * 1000);

export const tmdbDeps = (key: string, http: HttpClient = defaultHttpClient): TmdbDeps => ({
  key,
  http,
  searchCache,
  officialCache,
});
