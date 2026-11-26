import { expect, test } from "bun:test";
import { parseCinemeta, parseTVMaze, sortResults } from "./search";
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

test("puts the exact title first, then newest first", () => {
  const candidates: Array<TitleCandidate> = [
    { imdbId: "tt1", name: "Breaking Bad Wolf", year: "2018", kind: "movie" },
    { imdbId: "tt2", name: "Breaking Bad", year: "2008", kind: "tv" },
  ];

  expect(sortResults(candidates, "breaking bad").map((c) => c.imdbId)).toEqual(["tt2", "tt1"]);
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

test("keeps input order when years are missing", () => {
  const candidates: Array<TitleCandidate> = [
    { imdbId: "tt1111111", name: "The Office", kind: "movie" },
    { imdbId: "tt2222222", name: "The Office", kind: "tv" },
  ];

  expect(sortResults(candidates).map((c) => c.imdbId)).toEqual(["tt1111111", "tt2222222"]);
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
