import type { ContentType } from "./types";

export type TitleInput =
  | { kind: "imdb"; id: string }
  | { kind: "tmdb"; type?: ContentType; id: string };

const IMDB_ID = /^tt\d{7,8}$/i;
const IMDB_PATH = /^\/title\/(tt\d{7,8})(?:\/|$)/i;
const TMDB_MOVIE = /^\/movie\/([1-9]\d{0,7})(?:-|\/|$)/;
const TMDB_TV = /^\/tv\/([1-9]\d{0,7})(?:-|\/|$)/;
const BARE_TMDB = /^[1-9]\d{0,7}$/;
const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const IMDB_HOSTS = new Set(["imdb.com", "www.imdb.com", "m.imdb.com"]);
const TMDB_HOSTS = new Set(["themoviedb.org", "www.themoviedb.org"]);
const SHARED_ID = "id";

export function isImdbId(value: string): boolean {
  return IMDB_ID.test(value.trim());
}

export function isLinkLike(value: string): boolean {
  const trimmed = value.trim();
  return SCHEME.test(trimmed) || trimmed.toLowerCase().startsWith("www.");
}

const asUrl = (value: string): URL | null => {
  const candidate = value.toLowerCase().startsWith("www.") ? `https://${value}` : value;
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
};

// The canonical title URL for an IMDb id. The dialog and the shared-link
// prefill both point here, so the shape lives in one place.
export function imdbUrl(id: string): string {
  return `https://www.imdb.com/title/${id}/`;
}

// The ID in a shared link rides in the hash, so a shared title never creates a
// second URL for search engines to index. The query form is read for older
// links. This is the inverse of fullLinkForId.
export function parseSharedId(search: string, hash: string): string | null {
  return new URLSearchParams(search || hash.slice(1)).get(SHARED_ID);
}

// The hash half of the share link, used for the history entry too.
export function hashForId(id: string): string {
  return `#${SHARED_ID}=${encodeURIComponent(id)}`;
}

// The shareable link for a title: the app URL with the ID in the hash.
export function shareUrl(origin: string, id: string): string {
  return `${origin.replace(/\/$/, "")}/${hashForId(id)}`;
}

export function fullLinkForId(id: string, kind: ContentType): string | null {
  const value = id.trim();
  if (isImdbId(value)) {
    return imdbUrl(value.toLowerCase());
  }
  if (BARE_TMDB.test(value)) {
    return `https://www.themoviedb.org/${kind === "tv" ? "tv" : "movie"}/${value}`;
  }
  return null;
}

// Inside one input box: IMDb IDs and links pass through; TMDB URLs carry their
// own type; a bare TMDB number stays untyped.
export function parseTitleInput(input: string, hint?: ContentType): TitleInput | null {
  const value = input.trim();
  const url = asUrl(value);

  if (url !== null) {
    if (TMDB_HOSTS.has(url.hostname)) {
      const movieId = url.pathname.match(TMDB_MOVIE)?.[1];
      if (movieId !== undefined) {
        return { kind: "tmdb", type: "movie", id: movieId };
      }
      const tvId = url.pathname.match(TMDB_TV)?.[1];
      if (tvId !== undefined) {
        return { kind: "tmdb", type: "tv", id: tvId };
      }
      return null;
    }

    if (IMDB_HOSTS.has(url.hostname)) {
      const imdbId = url.pathname.match(IMDB_PATH)?.[1];
      return imdbId === undefined ? null : { kind: "imdb", id: imdbId.toLowerCase() };
    }

    return null;
  }

  const lower = value.toLowerCase();
  if (IMDB_ID.test(lower)) {
    return { kind: "imdb", id: lower };
  }

  if (BARE_TMDB.test(lower)) {
    return hint ? { kind: "tmdb", type: hint, id: lower } : { kind: "tmdb", id: lower };
  }

  return null;
}
