import { Cache, defaultHttpClient } from "./watch";
import type { HttpClient, LooseJson } from "./watch";

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
    const rowKind = meta.type === "series" ? "tv" : meta.type === "movie" ? "movie" : kind;
    return [{ imdbId, name, year: yearOf(meta.releaseInfo), kind: rowKind }];
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
    .normalize("NFD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^the\s+/, "")
    .trim();
}

function releaseYear(candidate: TitleCandidate): number {
  return candidate.year ? Number(candidate.year) : 0;
}

// Alternate the two sources, then lift exact title matches and show the newest
// release first. A movie and a show can share a name ("The Office", "Dune"), so
// both stay visible.
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
      if (!candidate) {
        continue;
      }
      // A remake can share a name and year across regions; one row is enough.
      const label = `${normalize(candidate.name)}|${candidate.year ?? ""}|${candidate.kind}`;
      if (seen.has(candidate.imdbId) || seen.has(label)) {
        continue;
      }
      seen.add(candidate.imdbId);
      seen.add(label);
      merged.push(candidate);
    }
  }

  return merged
    .map((candidate, index) => ({
      candidate,
      index,
      exact: normalize(candidate.name) === wanted ? 1 : 0,
    }))
    .sort((a, b) => {
      if (a.exact !== b.exact) {
        return b.exact - a.exact;
      }
      // A year sort only makes sense within the same title. Loose matches keep
      // the catalog's relevance order so "Dünen" cannot outrank "Dune".
      return a.exact === 1
        ? releaseYear(b.candidate) - releaseYear(a.candidate) || a.index - b.index
        : a.index - b.index;
    })
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

  const [movies, shows] = await Promise.all([
    fetchWith(deps.http, cinemetaUrl("movie", cleaned), (value) => parseCinemeta(value, "movie")),
    fetchWith(deps.http, cinemetaUrl("series", cleaned), (value) => parseCinemeta(value, "tv")),
  ]);
  const moviePool = movies?.slice(0, SOURCE_LIMIT) ?? [];
  const showPool = shows?.slice(0, SOURCE_LIMIT) ?? [];
  const baseMerged = mergeCandidates(cleaned, moviePool, showPool);

  // Cinemeta is undocumented, so shows get a second source. Ask it when the
  // series half failed or when no title came back at all.
  const needsTvSource = shows === null || baseMerged.length === 0;
  const tvmaze = needsTvSource
    ? await fetchWith(deps.http, TVMAZE + encodeURIComponent(cleaned), parseTVMaze)
    : null;

  const candidates =
    tvmaze !== null && tvmaze.length > 0
      ? mergeCandidates(cleaned, moviePool, [...showPool, ...tvmaze.slice(0, SOURCE_LIMIT)])
      : baseMerged;

  if (candidates.length > 0) {
    return respond(deps, key, candidates);
  }

  // An empty list is only verified when both media types answered: movies from
  // Cinemeta, shows from Cinemeta or TVMaze. Otherwise leave it uncached so the
  // next attempt can recover.
  const moviesAnswered = movies !== null;
  const showsAnswered = shows !== null || tvmaze !== null;
  if (!moviesAnswered || !showsAnswered) {
    return { ok: false };
  }

  return respond(deps, key, []);
}

// Per-instance, like the watch caches. The Cinemeta and TVMaze endpoints are
// shared infrastructure, so repeats stay local.
export const searchDeps: SearchDeps = {
  http: defaultHttpClient,
  cache: new Cache<Array<TitleCandidate>>(10 * 60 * 1000),
};
