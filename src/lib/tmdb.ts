import { isImdbId } from "./parse-input";
import type { HttpClient } from "./watch";

const WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql";

// Wikidata stores TMDB movie IDs in P4947 and TMDB TV IDs in P4983.
const ID_PROPERTY = { movie: "P4947", tv: "P4983" } as const;

interface WikidataResponse {
  results?: { bindings?: Array<{ imdb?: { value?: unknown } }> };
}

function isWikidataResponse(value: unknown): value is WikidataResponse {
  if (typeof value !== "object" || value === null || !("results" in value)) {
    return false;
  }
  const results = value.results;
  return typeof results === "object" && results !== null;
}

export function wikidataUrl(property: "P4947" | "P4983", id: string): string {
  const query =
    `SELECT ?imdb WHERE { ?item wdt:${property} "${id}" . ` +
    '?item wdt:P345 ?imdb . FILTER(STRSTARTS(?imdb, "tt")) }';
  return `${WIKIDATA_ENDPOINT}?query=${encodeURIComponent(query)}&format=json`;
}

export interface ImdbMatch {
  id: string;
  type: "movie" | "tv";
}

export type TmdbMapping =
  | { ok: true; match: ImdbMatch }
  | { ok: false; reason: "not_found" | "ambiguous" };

async function lookup(
  http: HttpClient,
  property: "P4947" | "P4983",
  id: string,
): Promise<string | null> {
  try {
    const res = await http.get(wikidataUrl(property, id), {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return null;
    }
    const value: unknown = await res.json();
    if (!isWikidataResponse(value)) {
      return null;
    }
    const imdb = value.results?.bindings?.[0]?.imdb?.value;
    return typeof imdb === "string" && isImdbId(imdb) ? imdb : null;
  } catch {
    return null;
  }
}

// Keyless TMDB-to-IMDb mapping. A bare number could be a movie or a show, so
// both properties are tried; a URL has already fixed the type. A miss is not
// an error: many titles are missing from Wikidata.
export async function resolveImdbId(
  http: HttpClient,
  type: "movie" | "tv" | undefined,
  id: string,
): Promise<TmdbMapping> {
  if (type) {
    const found = await lookup(http, ID_PROPERTY[type], id);
    return found ? { ok: true, match: { id: found, type } } : { ok: false, reason: "not_found" };
  }
  const [movie, tv] = await Promise.all([
    lookup(http, ID_PROPERTY.movie, id),
    lookup(http, ID_PROPERTY.tv, id),
  ]);
  if (movie && tv && movie !== tv) {
    // TMDB movie and TV IDs live in separate spaces and can collide.
    return { ok: false, reason: "ambiguous" };
  }
  if (movie) {
    return { ok: true, match: { id: movie, type: "movie" } };
  }
  if (tv) {
    return { ok: true, match: { id: tv, type: "tv" } };
  }
  return { ok: false, reason: "not_found" };
}
