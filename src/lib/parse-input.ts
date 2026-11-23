import type { ContentType } from "./types";

export type TitleInput =
  | { kind: "imdb"; id: string }
  | { kind: "tmdb"; type?: ContentType; id: string };

const IMDB_ID = /tt\d{7,8}(?!\d)/;
const TMDB_MOVIE = /themoviedb\.org\/movie\/([1-9]\d{0,7})/i;
const TMDB_TV = /themoviedb\.org\/tv\/([1-9]\d{0,7})/i;
const BARE_TMDB = /^[1-9]\d{0,7}$/;
const SHARED_ID = "id";

export function isImdbId(value: string): boolean {
  return value.toLowerCase().match(IMDB_ID)?.[0] === value.toLowerCase();
}

export function isLinkLike(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  return (
    trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("www.")
  );
}

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

// One input box plus a Movie/TV selector: IMDb IDs and links pass through;
// TMDB URLs carry their own type; a bare TMDB number takes the selected
// type, so it is never ambiguous.
export function parseTitleInput(input: string, hint?: ContentType): TitleInput | null {
  const value = input.trim().toLowerCase();

  const movieUrl = value.match(TMDB_MOVIE);
  const movieId = movieUrl?.[1];
  if (movieId !== undefined) {
    return { kind: "tmdb", type: "movie", id: movieId };
  }

  const tvUrl = value.match(TMDB_TV);
  const tvId = tvUrl?.[1];
  if (tvId !== undefined) {
    return { kind: "tmdb", type: "tv", id: tvId };
  }

  const imdb = value.match(IMDB_ID);
  if (imdb) {
    return { kind: "imdb", id: imdb[0] };
  }

  if (BARE_TMDB.test(value)) {
    return hint ? { kind: "tmdb", type: hint, id: value } : { kind: "tmdb", id: value };
  }

  return null;
}
