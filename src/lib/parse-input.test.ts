import { expect, test } from "bun:test";
import { parseTitleInput } from "./parse-input";

test("parses an IMDb id or link", () => {
  expect(parseTitleInput("tt0133093")).toEqual({ kind: "imdb", id: "tt0133093" });
  expect(parseTitleInput("https://www.imdb.com/title/tt0903747/?ref=x")).toEqual({
    kind: "imdb",
    id: "tt0903747",
  });
});

test("parses a bare TMDB id with the selected type, no guessing", () => {
  expect(parseTitleInput("27205", "movie")).toEqual({ kind: "tmdb", type: "movie", id: "27205" });
  expect(parseTitleInput("1396", "tv")).toEqual({ kind: "tmdb", type: "tv", id: "1396" });
  // No hint keeps the old untyped shape for link-only callers.
  expect(parseTitleInput("27205")).toEqual({ kind: "tmdb", id: "27205" });
});

test("parses TMDB movie and TV URLs", () => {
  expect(parseTitleInput("https://www.themoviedb.org/movie/27205-inception")).toEqual({
    kind: "tmdb",
    type: "movie",
    id: "27205",
  });
  expect(parseTitleInput("https://www.themoviedb.org/tv/1396-breaking-bad?language=en")).toEqual({
    kind: "tmdb",
    type: "tv",
    id: "1396",
  });
});

test("rejects junk and malformed ids", () => {
  expect(parseTitleInput("abc")).toBeNull();
  expect(parseTitleInput("tt123456789")).toBeNull();
  expect(parseTitleInput("https://www.themoviedb.org/movie/nope")).toBeNull();
});

test("a TMDB slug containing digits that look like an IMDb id stays a TMDB URL", () => {
  expect(parseTitleInput("https://www.themoviedb.org/movie/123-tt7654321")).toEqual({
    kind: "tmdb",
    type: "movie",
    id: "123",
  });
});
