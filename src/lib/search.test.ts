import { expect, test } from "bun:test";
import { Cache } from "./http";
import type { HttpClient } from "./http";
import { parseCinemeta, parseTVMaze, searchTitles, sortResults } from "./search";
import type { TitleCandidate } from "./search";

const cinemetaMovie = {
  metas: [
    {
      id: "tt0133093",
      imdb_id: "tt0133093",
      type: "movie",
      name: "The Matrix",
      releaseInfo: "1999",
    },
    { id: "nm0000206", imdb_id: "nm0000206", type: "movie", name: "Keanu Reeves" },
  ],
};

const cinemetaSeries = {
  metas: [
    {
      id: "tt0386676",
      imdb_id: "tt0386676",
      type: "series",
      name: "The Office",
      releaseInfo: "2005–2013",
    },
  ],
};

const tvmaze = [
  {
    score: 1.18,
    show: {
      name: "The Office",
      premiered: "2005-03-24",
      externals: { imdb: "tt0386676" },
      image: { medium: "https://static.tvmaze.com/medium.jpg" },
    },
  },
  {
    score: 0.4,
    show: {
      name: "Office Hours",
      premiered: "2012-01-01",
      externals: { imdb: "tt9999999" },
    },
  },
];

test("parses Cinemeta films and shows, dropping non-IMDb rows", () => {
  expect(parseCinemeta(cinemetaMovie, "movie")).toEqual([
    { imdbId: "tt0133093", name: "The Matrix", year: "1999", kind: "movie" },
  ]);
  expect(parseCinemeta(cinemetaSeries, "tv")).toEqual([
    { imdbId: "tt0386676", name: "The Office", year: "2005", kind: "tv" },
  ]);
});

test("parses TVMaze shows above the score floor", () => {
  expect(parseTVMaze(tvmaze)).toEqual([
    {
      imdbId: "tt0386676",
      name: "The Office",
      year: "2005",
      kind: "tv",
      poster: "https://static.tvmaze.com/medium.jpg",
    },
  ]);
});

test("parses Cinemeta poster art when present", () => {
  expect(
    parseCinemeta(
      {
        metas: [
          {
            imdb_id: "tt0133093",
            type: "movie",
            name: "The Matrix",
            releaseInfo: "1999",
            poster: "https://images.metahub.space/poster/small/tt0133093/img",
          },
        ],
      },
      "movie",
    ),
  ).toEqual([
    {
      imdbId: "tt0133093",
      name: "The Matrix",
      year: "1999",
      kind: "movie",
      poster: "https://images.metahub.space/poster/small/tt0133093/img",
    },
  ]);
});

test("sorts newest first, whatever the title", () => {
  const candidates: Array<TitleCandidate> = [
    { imdbId: "tt0273148", name: "The Officer's Ward", year: "2001", kind: "movie" },
    { imdbId: "tt0386676", name: "The Office", year: "2005", kind: "tv" },
  ];

  expect(sortResults(candidates).map((c) => c.imdbId)).toEqual(["tt0386676", "tt0273148"]);
});

test("orders equal title matches by newest release year", () => {
  const shows: Array<TitleCandidate> = [
    { imdbId: "tt0386676", name: "The Office", year: "2005", kind: "tv" },
    { imdbId: "tt10193026", name: "The Office", year: "2024", kind: "tv" },
  ];

  expect(sortResults(shows).map((candidate) => candidate.year)).toEqual(["2024", "2005"]);
});

test("keeps one row per name, year, and kind", () => {
  const shows: Array<TitleCandidate> = [
    { imdbId: "tt1111111", name: "The Office", year: "2026", kind: "tv" },
    { imdbId: "tt2222222", name: "The Office", year: "2026", kind: "tv" },
  ];

  expect(sortResults(shows)).toHaveLength(1);
});

test("puts titles without a year last", () => {
  const candidates: Array<TitleCandidate> = [
    { imdbId: "tt1111111", name: "The Office", kind: "movie" },
    { imdbId: "tt2222222", name: "The Office", year: "2005", kind: "tv" },
  ];

  expect(sortResults(candidates).map((c) => c.imdbId)).toEqual(["tt2222222", "tt1111111"]);
});

test("dedupes and caps the sorted list", () => {
  const candidates = Array.from({ length: 8 }, (_, i) => ({
    imdbId: `tt000000${i}`,
    name: `Film ${i}`,
    year: `${2000 + i}`,
    kind: "movie" as const,
  }));

  const sorted = sortResults(candidates);

  expect(sorted).toHaveLength(6);
  const ids = sorted.map((candidate) => candidate.imdbId);
  expect(new Set(ids).size).toBe(6);
  expect(sorted.map((c) => c.year)).toEqual(["2007", "2006", "2005", "2004", "2003", "2002"]);
});

function fakeHttp(routes: Record<string, { ok: boolean; body: unknown }>) {
  const calls: Array<string> = [];
  const http: HttpClient = {
    get: async (url: string) => {
      calls.push(url);
      const key = url.includes("catalog/movie")
        ? "movie"
        : url.includes("catalog/series")
          ? "series"
          : "tvmaze";
      const reply = routes[key] ?? { ok: false, body: {} };
      return {
        ok: reply.ok,
        json: async () => ({}),
        text: async () => JSON.stringify(reply.body),
      };
    },
  };
  return { http, calls };
}

test("movie search hits only the movie catalog, newest first", async () => {
  const { http, calls } = fakeHttp({
    movie: { ok: true, body: cinemetaMovie },
    series: { ok: true, body: cinemetaSeries },
  });

  const out = await searchTitles(
    { http, cache: new Cache<Array<TitleCandidate>>(60_000) },
    "The Office",
    "movie",
  );

  expect(out.ok).toBe(true);
  expect(calls.some((url) => url.includes("catalog/series"))).toBe(false);
  expect(calls.some((url) => url.includes("tvmaze"))).toBe(false);
  expect(out.ok && out.candidates.every((candidate) => candidate.kind === "movie")).toBe(true);
});

test("tv search hits the series catalog and sorts newest first", async () => {
  const { http, calls } = fakeHttp({
    movie: { ok: true, body: cinemetaMovie },
    series: { ok: true, body: cinemetaSeries },
  });

  const out = await searchTitles(
    { http, cache: new Cache<Array<TitleCandidate>>(60_000) },
    "The Office",
    "tv",
  );

  expect(out.ok).toBe(true);
  expect(calls.some((url) => url.includes("catalog/movie"))).toBe(false);
  expect(out.ok && out.candidates.every((candidate) => candidate.kind === "tv")).toBe(true);
});

test("caches movie and tv separately for the same query", async () => {
  const { http, calls } = fakeHttp({
    movie: { ok: true, body: cinemetaMovie },
    series: { ok: true, body: cinemetaSeries },
  });
  const deps = { http, cache: new Cache<Array<TitleCandidate>>(60_000) };

  await searchTitles(deps, "The Office", "movie");
  await searchTitles(deps, "The Office", "tv");
  await searchTitles(deps, "The Office", "movie");

  expect(calls.filter((url) => url.includes("catalog/movie"))).toHaveLength(1);
  expect(calls.filter((url) => url.includes("catalog/series"))).toHaveLength(1);
});

test("falls back to TVMaze when Cinemeta has no series hits", async () => {
  const { http } = fakeHttp({
    series: { ok: true, body: { metas: [] } },
    tvmaze: { ok: true, body: tvmaze },
  });

  const out = await searchTitles(
    { http, cache: new Cache<Array<TitleCandidate>>(60_000) },
    "The Office",
    "tv",
  );

  expect(out.ok && out.candidates[0]?.imdbId).toBe("tt0386676");
});

test("asks TVMaze when the series catalog fails", async () => {
  const fallback = [
    {
      score: 1.18,
      show: {
        name: "Severance",
        premiered: "2022-02-18",
        externals: { imdb: "tt11280740" },
      },
    },
  ];
  const { http } = fakeHttp({
    series: { ok: false, body: {} },
    tvmaze: { ok: true, body: fallback },
  });

  const out = await searchTitles(
    { http, cache: new Cache<Array<TitleCandidate>>(60_000) },
    "Severance",
    "tv",
  );

  expect(out.ok && out.candidates.some((candidate) => candidate.imdbId === "tt11280740")).toBe(
    true,
  );
});

test("movie search ignores a dead series catalog", async () => {
  const { http } = fakeHttp({
    movie: { ok: true, body: cinemetaMovie },
    series: { ok: false, body: {} },
  });

  const out = await searchTitles(
    { http, cache: new Cache<Array<TitleCandidate>>(60_000) },
    "The Matrix",
    "movie",
  );

  expect(out.ok && out.candidates[0]?.imdbId).toBe("tt0133093");
});

test("reports a failure when every source fails", async () => {
  const { http } = fakeHttp({});

  expect(
    await searchTitles(
      { http, cache: new Cache<Array<TitleCandidate>>(60_000) },
      "The Office",
      "tv",
    ),
  ).toEqual({
    ok: false,
  });
});

test("accepts an empty TVMaze answer when the series catalog failed", async () => {
  const { http } = fakeHttp({
    series: { ok: false, body: {} },
    tvmaze: { ok: true, body: [] },
  });

  expect(
    await searchTitles({ http, cache: new Cache<Array<TitleCandidate>>(60_000) }, "Nothing", "tv"),
  ).toEqual({ ok: true, candidates: [] });
});

test("orders by newest year whatever the names", () => {
  const candidates: Array<TitleCandidate> = [
    { imdbId: "tt1111111", name: "Dune: Prophecy", year: "2020", kind: "tv" },
    { imdbId: "tt2222222", name: "Dune: Part Two", year: "2024", kind: "movie" },
  ];

  expect(sortResults(candidates).map((c) => c.year)).toEqual(["2024", "2020"]);
});

test("keeps input order when years are missing", () => {
  const candidates: Array<TitleCandidate> = [
    { imdbId: "tt1111111", name: "The Office", kind: "movie" },
    { imdbId: "tt2222222", name: "The Office", kind: "tv" },
  ];

  expect(sortResults(candidates).map((c) => c.imdbId)).toEqual(["tt1111111", "tt2222222"]);
});

function switchableHttp(down: () => boolean) {
  const http: HttpClient = {
    get: async (url: string) => {
      if (down()) {
        return { ok: false, json: async () => ({}), text: async () => "" };
      }
      const body = url.includes("catalog/movie")
        ? cinemetaMovie
        : url.includes("catalog/series")
          ? cinemetaSeries
          : {};
      return { ok: true, json: async () => ({}), text: async () => JSON.stringify(body) };
    },
  };
  return http;
}

test("does not cache a partial outage", async () => {
  let down = true;
  const deps = {
    http: switchableHttp(() => down),
    cache: new Cache<Array<TitleCandidate>>(60_000),
  };

  expect(await searchTitles(deps, "The Office", "tv")).toEqual({ ok: false });

  down = false;
  const out = await searchTitles(deps, "The Office", "tv");
  expect(out.ok && out.candidates.length > 0).toBe(true);
});

test("caches a query and ignores case and outer spaces", async () => {
  let down = false;
  const deps = {
    http: switchableHttp(() => down),
    cache: new Cache<Array<TitleCandidate>>(60_000),
  };

  const first = await searchTitles(deps, "The Matrix", "movie");
  down = true;
  const second = await searchTitles(deps, "  the matrix ", "movie");

  expect(second).toEqual(first);
});
