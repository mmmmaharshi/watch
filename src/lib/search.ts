import { Cache, defaultHttpClient } from "./watch";
import type { HttpClient, LooseJson } from "./watch";

const API = "https://www.wikidata.org/w/api.php";
const USER_AGENT = "watch-app/1.0 (+https://github.com/mmmmaharshi/watch)";
const SEARCH_LIMIT = 20;
const MAX_CANDIDATES = 6;
const TIMEOUT_MS = 5000;

// Only films and shows are streamable. People, games, seasons, episodes and
// franchises also carry an IMDb ID, so an allowlist beats a denylist here.
const TITLE_CLASSES = new Set([
  "Q11424", // film
  "Q506240", // television film
  "Q5398426", // television series
  "Q1259759", // miniseries
  "Q15416", // television program
]);

export interface TitleCandidate {
  imdbId: string;
  name: string;
  year?: string;
  description?: string;
}

export interface SearchDeps {
  http: HttpClient;
  cache: Cache<Array<TitleCandidate>>;
}

function isObject(value: unknown): value is LooseJson {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function searchHits(value: unknown): Array<{ id: string; label?: string; description?: string }> {
  if (!isObject(value) || !Array.isArray(value.search)) {
    return [];
  }
  return value.search.flatMap((hit: unknown) => {
    if (!isObject(hit) || typeof hit.id !== "string") {
      return [];
    }
    return [
      {
        id: hit.id,
        label: asString(hit.label),
        description: asString(hit.description),
      },
    ];
  });
}

function entityMap(value: unknown): LooseJson {
  return isObject(value) && isObject(value.entities) ? value.entities : {};
}

// Claim values are strings (P345), entity references (P31) or time objects
// (P577). Callers narrow the one they need.
function claimValues(entity: unknown, property: string): Array<unknown> {
  if (!isObject(entity) || !isObject(entity.claims)) {
    return [];
  }
  const claims = entity.claims[property];
  if (!Array.isArray(claims)) {
    return [];
  }
  return claims.flatMap((claim: unknown) => {
    if (!isObject(claim) || !isObject(claim.mainsnak) || !isObject(claim.mainsnak.datavalue)) {
      return [];
    }
    return [claim.mainsnak.datavalue.value];
  });
}

function imdbId(entity: unknown): string | undefined {
  return claimValues(entity, "P345").find(
    (value): value is string => typeof value === "string" && /^tt\d{7,8}$/.test(value),
  );
}

function classes(entity: unknown): Array<string> {
  return claimValues(entity, "P31").flatMap((value) =>
    isObject(value) && typeof value.id === "string" ? [value.id] : [],
  );
}

function year(entity: unknown): string | undefined {
  const years = claimValues(entity, "P577").flatMap((value) => {
    if (!isObject(value) || typeof value.time !== "string") {
      return [];
    }
    const match = value.time.match(/^[+-]?(\d{4})/);
    return match ? [Number(match[1])] : [];
  });
  return years.length > 0 ? String(Math.min(...years)) : undefined;
}

function label(entity: unknown, hit: { label?: string }, language: string): string | undefined {
  if (!isObject(entity) || !isObject(entity.labels)) {
    return hit.label;
  }
  const entry = entity.labels[language];
  return isObject(entry) ? (asString(entry.value) ?? hit.label) : hit.label;
}

function description(
  entity: unknown,
  hit: { description?: string },
  language: string,
): string | undefined {
  if (!isObject(entity) || !isObject(entity.descriptions)) {
    return hit.description;
  }
  const entry = entity.descriptions[language];
  return isObject(entry) ? (asString(entry.value) ?? hit.description) : hit.description;
}

export function parseCandidates(searchJson: unknown, entitiesJson: unknown): Array<TitleCandidate> {
  const entities = entityMap(entitiesJson);
  const seen = new Set<string>();
  const candidates: Array<TitleCandidate> = [];

  for (const hit of searchHits(searchJson)) {
    if (candidates.length >= MAX_CANDIDATES) {
      break;
    }
    const entity = entities[hit.id];
    if (!entity || !classes(entity).some((id) => TITLE_CLASSES.has(id))) {
      continue;
    }
    const id = imdbId(entity);
    if (!id || seen.has(id)) {
      continue;
    }
    const name = label(entity, hit, "en");
    if (!name) {
      continue;
    }
    seen.add(id);
    candidates.push({
      imdbId: id,
      name,
      year: year(entity),
      description: description(entity, hit, "en"),
    });
  }

  return candidates;
}

function searchUrl(query: string): string {
  return (
    `${API}?action=wbsearchentities&format=json&language=en&uselang=en` +
    `&type=item&limit=${SEARCH_LIMIT}&search=${encodeURIComponent(query)}`
  );
}

function entitiesUrl(ids: Array<string>): string {
  return (
    `${API}?action=wbgetentities&format=json&languages=en` +
    `&props=${encodeURIComponent("claims|labels|descriptions")}` +
    `&ids=${encodeURIComponent(ids.join("|"))}`
  );
}

export async function searchTitles(
  deps: SearchDeps,
  query: string,
): Promise<{ ok: boolean; candidates: Array<TitleCandidate> }> {
  const cleaned = query.trim();
  const key = cleaned.toLowerCase();
  if (!key) {
    return { ok: true, candidates: [] };
  }

  const cached = deps.cache.get(key);
  if (cached) {
    return { ok: true, candidates: cached };
  }

  try {
    const headers = { "User-Agent": USER_AGENT };
    const searchRes = await deps.http.get(searchUrl(cleaned), {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers,
    });
    if (!searchRes.ok) {
      return { ok: false, candidates: [] };
    }
    const searchJson = await searchRes.json();
    const hits = searchHits(searchJson);
    if (hits.length === 0) {
      deps.cache.set(key, []);
      return { ok: true, candidates: [] };
    }

    const entitiesRes = await deps.http.get(entitiesUrl(hits.map((hit) => hit.id)), {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers,
    });
    if (!entitiesRes.ok) {
      return { ok: false, candidates: [] };
    }

    const candidates = parseCandidates(searchJson, await entitiesRes.json());
    deps.cache.set(key, candidates);
    return { ok: true, candidates };
  } catch {
    return { ok: false, candidates: [] };
  }
}

// Per-instance, like the watch caches. Searches are cheap to repeat but the
// Wikidata API is shared infrastructure.
export const searchDeps: SearchDeps = {
  http: defaultHttpClient,
  cache: new Cache<Array<TitleCandidate>>(10 * 60 * 1000),
};
