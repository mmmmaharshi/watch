import { expect, test } from "bun:test";
import {
  fullLinkForId,
  hashForId,
  imdbUrl,
  isLinkLike,
  parseSharedId,
  parseTitleInput,
  shareUrl,
} from "./parse-input";

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

test("rejects an IMDb id inside a link that is not IMDb", () => {
  expect(parseTitleInput("https://www.imdb.com.evil.com/title/tt0133093/")).toBeNull();
  expect(parseTitleInput("https://evil.example/https://www.imdb.com/title/tt0133093/")).toBeNull();
  expect(
    parseTitleInput("https://evil.example/?u=https%3A%2F%2Fwww.imdb.com%2Ftitle%2Ftt0133093%2F"),
  ).toBeNull();
  expect(parseTitleInput("ftp://www.imdb.com/title/tt0133093/")).toBeNull();
});

test("rejects a lookalike TMDB host", () => {
  expect(parseTitleInput("https://www.themoviedb.org.evil.com/movie/27205")).toBeNull();
  expect(parseTitleInput("https://evil.example/https://www.themoviedb.org/movie/27205")).toBeNull();
});

test("accepts an IMDb link with no protocol or trailing slash", () => {
  expect(parseTitleInput("www.imdb.com/title/tt0903747/")).toEqual({
    kind: "imdb",
    id: "tt0903747",
  });
  expect(parseTitleInput("https://www.imdb.com/title/tt0903747")).toEqual({
    kind: "imdb",
    id: "tt0903747",
  });
});

test("a TMDB slug containing digits that look like an IMDb id stays a TMDB URL", () => {
  expect(parseTitleInput("https://www.themoviedb.org/movie/123-tt7654321")).toEqual({
    kind: "tmdb",
    type: "movie",
    id: "123",
  });
});

test("a bare id prefills as its full link", () => {
  expect(fullLinkForId("tt0133093", "movie")).toBe("https://www.imdb.com/title/tt0133093/");
  expect(fullLinkForId("27205", "movie")).toBe("https://www.themoviedb.org/movie/27205");
  expect(fullLinkForId("1396", "tv")).toBe("https://www.themoviedb.org/tv/1396");
  expect(fullLinkForId("not an id", "movie")).toBeNull();
});

test("a link is link-like whatever its case, a title is not", () => {
  expect(isLinkLike("https://www.imdb.com/title/tt0133093/")).toBe(true);
  expect(isLinkLike("HTTP://example.com/movie/42")).toBe(true);
  expect(isLinkLike("www.themoviedb.org/movie/27205")).toBe(true);
  expect(isLinkLike("ftp://www.imdb.com/title/tt0133093/")).toBe(true);
  expect(isLinkLike("tt0133093")).toBe(false);
  expect(isLinkLike("The Matrix")).toBe(false);
  expect(imdbUrl("tt0133093")).toBe("https://www.imdb.com/title/tt0133093/");
});

test("reads the shared id from the query first, then the hash", () => {
  expect(parseSharedId("?id=tt0133093", "#id=tt0241527")).toBe("tt0133093");
  expect(parseSharedId("", "#id=tt0241527")).toBe("tt0241527");
  expect(parseSharedId("", "")).toBe(null);
  expect(parseSharedId("?x=1", "#id=tt0241527")).toBe(null);
});

test("builds the share link for a title", () => {
  expect(hashForId("tt0133093")).toBe("#id=tt0133093");
  expect(shareUrl("https://watch.maharshi.work", "tt0133093")).toBe(
    "https://watch.maharshi.work/#id=tt0133093",
  );
});

test("trims a trailing slash and encodes the id", () => {
  expect(shareUrl("https://watch.maharshi.work/", "tt0133093")).toBe(
    "https://watch.maharshi.work/#id=tt0133093",
  );
  expect(shareUrl("https://watch.maharshi.work", "a b&c")).toBe(
    "https://watch.maharshi.work/#id=a%20b%26c",
  );
});
