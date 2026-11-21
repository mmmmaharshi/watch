import { Cache, defaultHttpClient } from "./watch";
import type { HttpClient, LooseJson } from "./watch";

const CINEMETA = "https://v3-cinemeta.strem.io/catalog";
const TVMAZE = "https://api.tvmaze.com/search/shows?q=";
const USER_AGENT = "watch-app/1.0 (+https://github.com/mmmmaharshi/watch)";
const TIMEOUT_MS = 5000;
const MAX_CANDIDATES = 6;
// TVMaze scores the best match around 1.2. Below 0.5 the results stop sharing
// a title with the query.
const TVMAZE_SCORE_FLOOR = 0.5;

export interface TitleCandidate {
  imdbId: string;
  name: string;
  year?: string;
  kind?: "movie" | "tv";
}

export interface SearchDeps {
  http: HttpClient;
  cache: Cache<Array<TitleCandidate>>;
}

export type SearchOutcome = { ok: true; candidates: Array<TitleCandidate> } | { ok: false };

function isObject(value: unknown): value is LooseJson {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function validImdb(value: unknown): string | undefined {
  return typeof value === "string" && /^tt\d{7,8}$/.test(value) ? value : undefined;
}

function yearOf(value: unknown): string | undefined {
  return asString(value)?.match(/^\d{4}/)?.[0];
}

// Null means the payload was not the shape we expect. An empty array is a
// valid "no results" answer.
export function parseCinemeta(
  payload: unknown,
  kind: "movie" | "tv",
): Array<TitleCandidate> | null {
  if (!isObject(payload) || !Array.isArray(payload.metas)) {
    return null;
  }
  return payload.metas.flatMap((meta: unknown) => {
    if (!isObject(meta)) {
      return [];
    }
    const imdbId = validImdb(meta.imdb_id);
    const name = asString(meta.name);
    if (!imdbId || !name) {
      return [];
    }
    return [{ imdbId, name, year: yearOf(meta.releaseInfo), kind }];
  });
}

export function parseTVMaze(payload: unknown): Array<TitleCandidate> | null {
  if (!Array.isArray(payload)) {
    return null;
  }
  return payload.flatMap((item: unknown) => {
    if (!isObject(item) || !isObject(item.show)) {
      return [];
    }
    const score = typeof item.score === "number" ? item.score : 0;
    if (score < TVMAZE_SCORE_FLOOR) {
      return [];
    }
    const show = item.show;
    const imdbId = isObject(show.externals) ? validImdb(show.externals.imdb) : undefined;
    const name = asString(show.name);
    if (!imdbId || !name) {
      return [];
    }
    return [{ imdbId, name, year: yearOf(show.premiered), kind: "tv" as const }];
  });
}

function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/^the\s+/, "")
    .trim();
}

// Alternate the two sources, then lift exact title matches to the top. A movie
// and a show can share a name ("The Office", "Dune"), so both stay visible.
export function mergeCandidates(
  query: string,
  movies: Array<TitleCandidate>,
  shows: Array<TitleCandidate>,
): Array<TitleCandidate> {
  const wanted = normalize(query);
  const seen = new Set<string>();
  const merged: Array<TitleCandidate> = [];

  for (let i = 0; i < Math.max(movies.length, shows.length); i++) {
    for (const candidate of [movies[i], shows[i]]) {
      if (candidate && !seen.has(candidate.imdbId)) {
        seen.add(candidate.imdbId);
        merged.push(candidate);
      }
    }
  }

  return merged
    .map((candidate, index) => ({
      candidate,
      index,
      exact: normalize(candidate.name) === wanted ? 1 : 0,
    }))
    .sort((a, b) => b.exact - a.exact || a.index - b.index)
    .slice(0, MAX_CANDIDATES)
    .map((entry) => entry.candidate);
}

function cinemetaUrl(kind: "movie" | "series", query: string): string {
  return `${CINEMETA}/${kind}/top/search=${encodeURIComponent(query)}.json`;
}

async function fetchWith<T>(
  http: HttpClient,
  url: string,
  headers: Record<string, string>,
  parse: (value: unknown) => T | null,
): Promise<T | null> {
  try {
    const res = await http.get(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers });
    if (!res.ok) {
      return null;
    }
    const value: unknown = JSON.parse(await res.text());
    return parse(value);
  } catch {
    return null;
  }
}

export async function searchTitles(deps: SearchDeps, query: string): Promise<SearchOutcome> {
  const cleaned = query.trim();
  const key = cleaned.toLowerCase();
  if (!key) {
    return { ok: true, candidates: [] };
  }

  const cached = deps.cache.get(key);
  if (cached) {
    return { ok: true, candidates: cached };
  }

  const headers = { "User-Agent": USER_AGENT };
  const [movies, shows] = await Promise.all([
    fetchWith(deps.http, cinemetaUrl("movie", cleaned), headers, (value) =>
      parseCinemeta(value, "movie"),
    ),
    fetchWith(deps.http, cinemetaUrl("series", cleaned), headers, (value) =>
      parseCinemeta(value, "tv"),
    ),
  ]);
  const cinemetaAnswered = movies !== null || shows !== null;
  const merged = mergeCandidates(cleaned, movies ?? [], shows ?? []);

  if (merged.length > 0) {
    deps.cache.set(key, merged);
    return { ok: true, candidates: merged };
  }

  // Cinemeta is undocumented, so shows get a second source.
  const tvmaze = await fetchWith(
    deps.http,
    TVMAZE + encodeURIComponent(cleaned),
    headers,
    parseTVMaze,
  );

  if (tvmaze && tvmaze.length > 0) {
    const candidates = mergeCandidates(cleaned, [], tvmaze);
    deps.cache.set(key, candidates);
    return { ok: true, candidates };
  }

  if (!cinemetaAnswered && !tvmaze) {
    return { ok: false };
  }

  deps.cache.set(key, []);
  return { ok: true, candidates: [] };
}

// Per-instance, like the watch caches. The Cinemeta and TVMaze endpoints are
// shared infrastructure, so repeats stay local.
export const searchDeps: SearchDeps = {
  http: defaultHttpClient,
  cache: new Cache<Array<TitleCandidate>>(10 * 60 * 1000),
};
