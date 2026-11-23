export type TitleInput =
  | { kind: "imdb"; id: string }
  | { kind: "tmdb"; type?: "movie" | "tv"; id: string };

const IMDB_ID = /tt\d{7,8}(?!\d)/;
const TMDB_MOVIE = /themoviedb\.org\/movie\/([1-9]\d{0,7})/i;
const TMDB_TV = /themoviedb\.org\/tv\/([1-9]\d{0,7})/i;
const BARE_TMDB = /^[1-9]\d{0,7}$/;

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

export function fullLinkForId(id: string, kind: "movie" | "tv"): string | null {
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
export function parseTitleInput(input: string, hint?: "movie" | "tv"): TitleInput | null {
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
