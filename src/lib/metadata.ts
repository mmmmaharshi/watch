import type { Cache } from "./http";
import type { HttpClient } from "./http";
import { isLooseJson } from "./http";
import { CINEMETA_HOST, TVMAZE_HOST } from "../consts";
import type { ContentType } from "./types";

export interface TitleMeta {
  type: ContentType;
  name: string;
  year?: string;
  rating?: string;
  description?: string;
}

export type TypeResult = { ok: true; meta: TitleMeta } | { ok: false; reason: string };

// Dates arrive in mixed shapes: a bare year, a full date, or a range. The
// first four digits are the year in every shape seen so far.
export function yearOf(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value.match(/^\d{4}/)?.[0] : undefined;
}

const META_TIMEOUT_MS = 5000;
const NEGATIVE_TTL_MS = 60_000;

interface FetchKindResult {
  meta: TitleMeta | null;
  transient: boolean;
}

async function fetchKind(
  kind: "series" | "movie",
  id: string,
  http: HttpClient,
  parent?: AbortSignal,
): Promise<FetchKindResult> {
  try {
    const url = `${CINEMETA_HOST}/meta/${kind}/${id}.json`;
    const timeout = AbortSignal.timeout(META_TIMEOUT_MS);
    const res = await http.get(url, {
      signal: parent ? AbortSignal.any([timeout, parent]) : timeout,
    });
    if (!res.ok) {
      return { meta: null, transient: false };
    }
    const body = await res.json();
    if (!isLooseJson(body.meta)) {
      return { meta: null, transient: false };
    }
    const m = body.meta;
    if (typeof m.name !== "string" || !m.name) {
      return { meta: null, transient: false };
    }
    return {
      meta: {
        type: kind === "series" ? "tv" : "movie",
        name: m.name,
        year: yearOf(m.year) ?? yearOf(m.releaseInfo),
        rating: typeof m.imdbRating === "string" ? m.imdbRating : undefined,
        description: typeof m.description === "string" ? m.description : undefined,
      },
      transient: false,
    };
  } catch {
    return { meta: null, transient: true };
  }
}

async function fetchMeta(
  id: string,
  http: HttpClient,
  preferred?: ContentType,
): Promise<{ meta: TitleMeta | null; transient: boolean }> {
  if (preferred) {
    const firstKind = preferred === "tv" ? "series" : "movie";
    const secondKind = firstKind === "series" ? "movie" : "series";
    const first = await fetchKind(firstKind, id, http);
    if (first.meta) {
      return first;
    }
    const second = await fetchKind(secondKind, id, http);
    return { meta: second.meta, transient: first.transient || second.transient };
  }
  const ctrl = new AbortController();
  try {
    const seriesPromise = fetchKind("series", id, http, ctrl.signal).then((result) => ({
      which: "series" as const,
      result,
    }));
    const moviePromise = fetchKind("movie", id, http, ctrl.signal).then((result) => ({
      which: "movie" as const,
      result,
    }));
    const first = await Promise.race([seriesPromise, moviePromise]);
    if (first.result.meta) {
      return first.result;
    }
    const other = first.which === "series" ? await moviePromise : await seriesPromise;
    return { meta: other.result.meta, transient: first.result.transient || other.result.transient };
  } finally {
    // Losers would otherwise run to their own timeouts.
    ctrl.abort();
  }
}

export async function resolveTitle(
  id: string,
  http: HttpClient,
  cache: Cache<TypeResult>,
  preferred?: ContentType,
): Promise<TypeResult> {
  const cached = cache.get(id);
  if (cached) {
    return cached;
  }

  const fetched = await fetchMeta(id, http, preferred);
  const meta = fetched.meta;
  if (!meta) {
    const fallback = await fetchTVMaze(id, http);
    if (fallback) {
      const result: TypeResult = { ok: true, meta: fallback };
      cache.set(id, result);
      return result;
    }
    const miss: TypeResult = { ok: false, reason: "Metadata not found" };
    if (!fetched.transient) {
      cache.set(id, miss, NEGATIVE_TTL_MS);
    }
    return miss;
  }

  const result: TypeResult = { ok: true, meta };
  cache.set(id, result);
  return result;
}

const TVMAZE_TIMEOUT_MS = 5000;

export async function fetchTVMaze(id: string, http: HttpClient): Promise<TitleMeta | null> {
  try {
    const res = await http.get(`${TVMAZE_HOST}/lookup/shows?imdb=${id}`, {
      signal: AbortSignal.timeout(TVMAZE_TIMEOUT_MS),
    });
    if (!res.ok) {
      return null;
    }
    const m = await res.json();
    if (typeof m.name !== "string") {
      return null;
    }
    const summary =
      typeof m.summary === "string" ? m.summary.replaceAll(/<[^>]*>/g, "").trim() : undefined;
    return { type: "tv", name: m.name, year: yearOf(m.premiered), description: summary };
  } catch {
    return null;
  }
}
