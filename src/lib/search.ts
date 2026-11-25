import { isLooseJson } from "./http";
import { isImdbId } from "./parse-input";
import type { Candidate, Mutable } from "./types";
import { yearOf } from "./year";

const MAX_CANDIDATES = 6;
// TVMaze scores the best match around 1.2. Below 0.5 the results stop sharing
// a title with the query.
const TVMAZE_SCORE_FLOOR = 0.5;
const KIND_BY_TYPE = new Map<string, "movie" | "tv">([
  ["movie", "movie"],
  ["series", "tv"],
]);

// Built field by field, so the optional keys only appear when present.
export type TitleCandidate = Mutable<Candidate>;

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

// IMDb ids are canonically lowercase; an odd-cased payload row is the same
// title, so keep it normalized instead of dropping it.
function validImdb(value: unknown): string | undefined {
  return typeof value === "string" && isImdbId(value) ? value.toLowerCase() : undefined;
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
    const candidate: TitleCandidate = { imdbId, name, kind: rowKind };
    const year = yearOf(meta.releaseInfo);
    if (year !== undefined) {
      candidate.year = year;
    }
    const poster = asString(meta.poster);
    if (poster) {
      candidate.poster = poster;
    }
    return [candidate];
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
    const candidate: TitleCandidate = { imdbId, name, kind: "tv" as const };
    const year = yearOf(show.premiered);
    if (year !== undefined) {
      candidate.year = year;
    }
    const image = isLooseJson(show.image) ? asString(show.image.medium) : undefined;
    if (image) {
      candidate.poster = image;
    }
    return [candidate];
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
