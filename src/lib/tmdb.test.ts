import { expect, test } from "bun:test";
import { Cache } from "./http";
import type { HttpClient, LooseJson } from "./http";
import { officialFor, searchByLanguage } from "./tmdb";
import type { Official } from "./types";
import type { Candidate } from "./types";

// The first route whose needle appears in the URL answers. An unmatched URL is
// a 404, which the client reads as a miss.
const fakeHttp = (routes: Record<string, LooseJson>) => {
  let calls = 0;
  const http: HttpClient = {
    get: async (url) => {
      calls += 1;
      const match = Object.entries(routes).find(([needle]) => url.includes(needle));
      return { ok: match !== undefined, text: async () => JSON.stringify(match?.[1] ?? {}) };
    },
  };
  return { http, calls: () => calls };
};

const deps = (http: HttpClient) => ({
  key: "test-key",
  http,
  searchCache: new Cache<Array<Candidate>>(60_000),
  officialCache: new Cache<Official | null>(60_000),
});

const PUSHPA = {
  id: 1,
  title: "Pushpa 2",
  original_language: "te",
  release_date: "2024-12-05",
  poster_path: "/pushpa.jpg",
};

test("keeps only rows in the chosen language and gives them IMDb ids", async () => {
  const { http } = fakeHttp({
    "/search/movie": {
      results: [PUSHPA, { id: 2, title: "Other", original_language: "en" }],
    },
    "/movie/1/external_ids": { imdb_id: "tt1757263" },
  });

  const candidates = await searchByLanguage(deps(http), "Pushpa", "movie", "te");

  expect(candidates).toEqual([
    {
      imdbId: "tt1757263",
      name: "Pushpa 2",
      kind: "movie",
      year: "2024",
      poster: "https://image.tmdb.org/t/p/w342/pushpa.jpg",
    },
  ]);
});

test("finds a matching row on the second page", async () => {
  const { http } = fakeHttp({
    "page=1": { results: [{ id: 9, title: "Other", original_language: "en" }], total_pages: 2 },
    "page=2": { results: [PUSHPA], total_pages: 2 },
    "/movie/1/external_ids": { imdb_id: "tt1757263" },
  });

  expect(
    (await searchByLanguage(deps(http), "Pushpa", "movie", "te"))?.map((row) => row.imdbId),
  ).toEqual(["tt1757263"]);
});

test("drops a row whose TMDB entry has no IMDb id", async () => {
  const { http } = fakeHttp({
    "/search/movie": { results: [PUSHPA] },
    "/movie/1/external_ids": {},
  });

  expect(await searchByLanguage(deps(http), "Pushpa", "movie", "te")).toEqual([]);
});

test("an upstream failure is a failure, not an empty list", async () => {
  const { http } = fakeHttp({});

  expect(await searchByLanguage(deps(http), "Pushpa", "movie", "te")).toBeNull();
});

test("names the official services in the region", async () => {
  const { http } = fakeHttp({
    "/find/tt1757263": { movie_results: [{ id: 1 }] },
    "/movie/1/watch/providers": {
      results: {
        IN: {
          link: "https://www.themoviedb.org/movie/1/watch",
          flatrate: [{ provider_name: "Netflix" }, { provider_name: "Aha" }],
          free: [{ provider_name: "MX Player" }],
          ads: [{ provider_name: "JioHotstar" }],
          rent: [{ provider_name: "Apple TV" }],
        },
      },
    },
  });

  expect(await officialFor(deps(http), "tt1757263", "movie")).toEqual({
    services: ["Netflix", "Aha", "MX Player", "JioHotstar"],
    link: "https://www.themoviedb.org/movie/1/watch",
  });
});

test("a title with nothing in the region is a cached miss", async () => {
  const { http, calls } = fakeHttp({
    "/find/tt1757263": { movie_results: [{ id: 1 }] },
    "/movie/1/watch/providers": { results: { US: { link: "https://example.com" } } },
  });
  const tmdb = deps(http);

  expect(await officialFor(tmdb, "tt1757263", "movie")).toBeNull();
  expect(await officialFor(tmdb, "tt1757263", "movie")).toBeNull();
  // The second call is answered from the cache.
  expect(calls()).toBe(2);
});
