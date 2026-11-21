import { expect, test } from "bun:test";
import { Cache } from "./watch";
import type { HttpClient } from "./watch";
import { mergeCandidates, parseCinemeta, parseTVMaze, searchTitles } from "./search";
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
    { imdbId: "tt0386676", name: "The Office", year: "2005", kind: "tv" },
  ]);
});

test("merges an exact title first and alternates the sources", () => {
  const movies: Array<TitleCandidate> = [
    { imdbId: "tt0273148", name: "The Officer's Ward", year: "2001", kind: "movie" },
  ];
  const shows: Array<TitleCandidate> = [
    { imdbId: "tt0386676", name: "The Office", year: "2005", kind: "tv" },
  ];

  expect(mergeCandidates("The Office", movies, shows)).toEqual([shows[0], movies[0]]);
});

test("dedupes and caps the merged list", () => {
  const movies = Array.from({ length: 8 }, (_, i) => ({
    imdbId: `tt000000${i}`,
    name: `Film ${i}`,
    kind: "movie" as const,
  }));
  const shows = Array.from({ length: 8 }, (_, i) => ({
    imdbId: `tt000000${i}`,
    name: `Show ${i}`,
    kind: "tv" as const,
  }));

  const merged = mergeCandidates("query", movies, shows);

  expect(merged).toHaveLength(6);
  expect(new Set(merged.map((candidate) => candidate.imdbId)).size).toBe(6);
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

test("searches Cinemeta films and shows in parallel", async () => {
  const { http, calls } = fakeHttp({
    movie: { ok: true, body: cinemetaMovie },
    series: { ok: true, body: cinemetaSeries },
  });

  const out = await searchTitles(
    { http, cache: new Cache<Array<TitleCandidate>>(60_000) },
    "The Office",
  );

  expect(out.ok).toBe(true);
  expect(out.ok && out.candidates[0]?.name).toBe("The Office");
  expect(calls).toHaveLength(2);
});

test("falls back to TVMaze when Cinemeta has no hits", async () => {
  const { http, calls } = fakeHttp({
    movie: { ok: true, body: { metas: [] } },
    series: { ok: true, body: { metas: [] } },
    tvmaze: { ok: true, body: tvmaze },
  });

  const out = await searchTitles(
    { http, cache: new Cache<Array<TitleCandidate>>(60_000) },
    "The Office",
  );

  expect(out.ok && out.candidates.length).toBe(1);
  expect(calls.some((url) => url.includes("tvmaze"))).toBe(true);
});

test("keeps a partial Cinemeta result without asking TVMaze", async () => {
  const { http, calls } = fakeHttp({
    movie: { ok: false, body: {} },
    series: { ok: true, body: cinemetaSeries },
  });

  const out = await searchTitles(
    { http, cache: new Cache<Array<TitleCandidate>>(60_000) },
    "The Office",
  );

  expect(out.ok && out.candidates[0]?.imdbId).toBe("tt0386676");
  expect(calls.some((url) => url.includes("tvmaze"))).toBe(false);
});

test("reports a failure when every source fails", async () => {
  const { http } = fakeHttp({});

  expect(
    await searchTitles({ http, cache: new Cache<Array<TitleCandidate>>(60_000) }, "The Office"),
  ).toEqual({
    ok: false,
  });
});

test("caches a query and ignores case and outer spaces", async () => {
  const { http, calls } = fakeHttp({
    movie: { ok: true, body: cinemetaMovie },
    series: { ok: true, body: cinemetaSeries },
  });
  const deps = { http, cache: new Cache<Array<TitleCandidate>>(60_000) };

  await searchTitles(deps, "The Matrix");
  const second = await searchTitles(deps, "  the matrix ");

  expect(second.ok).toBe(true);
  expect(calls).toHaveLength(2);
});
