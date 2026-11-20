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

// One input box: IMDb IDs and links pass through; TMDB IDs and links carry
// enough information to look up the matching IMDb ID before the normal flow.
// A bare number is ambiguous, so both TMDB properties are tried later.
export function parseTitleInput(input: string): TitleInput | null {
  const value = input.trim().toLowerCase();

  const movieUrl = value.match(TMDB_MOVIE);
  if (movieUrl) {
    return { kind: "tmdb", type: "movie", id: movieUrl[1] };
  }

  const tvUrl = value.match(TMDB_TV);
  if (tvUrl) {
    return { kind: "tmdb", type: "tv", id: tvUrl[1] };
  }

  const imdb = value.match(IMDB_ID);
  if (imdb) {
    return { kind: "imdb", id: imdb[0] };
  }

  if (BARE_TMDB.test(value)) {
    return { kind: "tmdb", id: value };
  }

  return null;
}
