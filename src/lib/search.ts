import { Cache, defaultHttpClient, isLooseJson } from "./watch";
import type { HttpClient } from "./watch";

const CINEMETA = "https://v3-cinemeta.strem.io/catalog";
const TVMAZE = "https://api.tvmaze.com/search/shows?q=";
const USER_AGENT = "watch-app/1.0 (+https://github.com/mmmmaharshi/watch)";
const TIMEOUT_MS = 5000;
const MAX_CANDIDATES = 6;
// Each catalog returns 20 rows. Keep the relevant head so a dozen obscure
// remakes cannot push the best-known title out of the year-sorted list.
const SOURCE_LIMIT = 6;
// TVMaze scores the best match around 1.2. Below 0.5 the results stop sharing
// a title with the query.
const TVMAZE_SCORE_FLOOR = 0.5;
const KIND_BY_TYPE = new Map<string, "movie" | "tv">([
  ["movie", "movie"],
  ["series", "tv"],
]);

export interface TitleCandidate {
  imdbId: string;
  name: string;
  year?: string;
  kind: "movie" | "tv";
}

export interface SearchDeps {
  http: HttpClient;
  cache: Cache<Array<TitleCandidate>>;
}

export type SearchOutcome = { ok: true; candidates: Array<TitleCandidate> } | { ok: false };

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
  if (!isLooseJson(payload) || !Array.isArray(payload.metas)) {
    return null;
  }
  return payload.metas.flatMap((meta: unknown) => {
    if (!isLooseJson(meta)) {
      return [];
    }
    const imdbId = validImdb(meta.imdb_id);
    const name = asString(meta.name);
    if (!imdbId || !name) {
      return [];
    }
    const rowKind = KIND_BY_TYPE.get(asString(meta.type) ?? "") ?? kind;
    return [{ imdbId, name, year: yearOf(meta.releaseInfo), kind: rowKind }];
  });
}

export function parseTVMaze(payload: unknown): Array<TitleCandidate> | null {
  if (!Array.isArray(payload)) {
    return null;
  }
  return payload.flatMap((item: unknown) => {
    if (!isLooseJson(item) || !isLooseJson(item.show)) {
      return [];
    }
    const score = typeof item.score === "number" ? item.score : 0;
    if (score < TVMAZE_SCORE_FLOOR) {
      return [];
    }
    const show = item.show;
    const imdbId = isLooseJson(show.externals) ? validImdb(show.externals.imdb) : undefined;
    const name = asString(show.name);
    if (!imdbId || !name) {
      return [];
    }
    return [{ imdbId, name, year: yearOf(show.premiered), kind: "tv" as const }];
  });
}

function normalize(name: string): string {
  return name
    .normalize("NFD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^the\s+/, "")
    .trim();
}

function releaseYear(candidate: TitleCandidate): number {
  return candidate.year ? Number(candidate.year) : 0;
}

// Newest release first; titles without a year go last, input order kept.
export function sortResults(candidates: Array<TitleCandidate>): Array<TitleCandidate> {
  const wanted = new Set<string>();
  const deduped: Array<TitleCandidate> = [];

  for (const candidate of candidates) {
    // A remake can share a name and year across regions; one row is enough.
    const label = `${normalize(candidate.name)}|${candidate.year ?? ""}|${candidate.kind}`;
    if (wanted.has(candidate.imdbId) || wanted.has(label)) {
      continue;
    }
    wanted.add(candidate.imdbId);
    wanted.add(label);
    deduped.push(candidate);
  }

  return deduped
    .map((candidate, index) => ({ candidate, index }))
    .sort((a, b) => releaseYear(b.candidate) - releaseYear(a.candidate) || a.index - b.index)
    .slice(0, MAX_CANDIDATES)
    .map((entry) => entry.candidate);
}

function cinemetaUrl(source: "movie" | "series", query: string): string {
  return `${CINEMETA}/${source}/top/search=${encodeURIComponent(query)}.json`;
}

// Null means the request failed or the body was not the expected JSON. Each
// caller decides whether to fall back; null is never cached as "no results".
async function fetchWith<T>(
  http: HttpClient,
  url: string,
  parse: (value: unknown) => T | null,
): Promise<T | null> {
  try {
    const res = await http.get(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) {
      return null;
    }
    const value: unknown = JSON.parse(await res.text());
    return parse(value);
  } catch {
    return null;
  }
}

function respond(deps: SearchDeps, key: string, candidates: Array<TitleCandidate>): SearchOutcome {
  deps.cache.set(key, candidates);
  return { ok: true, candidates };
}

export async function searchTitles(
  deps: SearchDeps,
  query: string,
  kind: "movie" | "tv" = "movie",
): Promise<SearchOutcome> {
  const cleaned = query.trim();
  const key = `${kind}:${cleaned.toLowerCase()}`;
  if (!cleaned) {
    return { ok: true, candidates: [] };
  }

  const cached = deps.cache.get(key);
  if (cached) {
    return { ok: true, candidates: cached };
  }

  if (kind === "movie") {
    const movies = await fetchWith(deps.http, cinemetaUrl("movie", cleaned), (value) =>
      parseCinemeta(value, "movie"),
    );
    if (movies === null) {
      return { ok: false };
    }
    return respond(deps, key, sortResults(movies.slice(0, SOURCE_LIMIT)));
  }

  const shows = await fetchWith(deps.http, cinemetaUrl("series", cleaned), (value) =>
    parseCinemeta(value, "tv"),
  );
  // Cinemeta is undocumented, so shows get a second source. Ask it when the
  // series catalog failed or came back empty.
  const seriesPool = shows ?? [];
  const tvmaze =
    shows === null || seriesPool.length === 0
      ? await fetchWith(deps.http, TVMAZE + encodeURIComponent(cleaned), parseTVMaze)
      : null;
  if (shows === null && tvmaze === null) {
    return { ok: false };
  }

  return respond(deps, key, sortResults([...seriesPool, ...(tvmaze ?? []).slice(0, SOURCE_LIMIT)]));
}

// Per-instance, like the watch caches. The Cinemeta and TVMaze endpoints are
// shared infrastructure, so repeats stay local.
export const searchDeps: SearchDeps = {
  http: defaultHttpClient,
  cache: new Cache<Array<TitleCandidate>>(10 * 60 * 1000),
};
