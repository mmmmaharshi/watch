import { expect, test } from "bun:test";
import { Cache } from "./watch";
import type { HttpClient, LooseJson } from "./watch";
import { parseCandidates, searchTitles } from "./search";
import type { TitleCandidate } from "./search";

const searchJson = {
  search: [
    { id: "Q83495", label: "The Matrix", description: "1999 film" },
    { id: "Q5", label: "Keanu Reeves", description: "Canadian actor" },
    { id: "Q123", label: "The Matrix (season 1)", description: "season" },
    { id: "Q999", label: "The Matrix Online", description: "2005 video game" },
  ],
};

const entitiesJson = {
  entities: {
    Q83495: {
      labels: { en: { value: "The Matrix" } },
      descriptions: { en: { value: "1999 film by the Wachowskis" } },
      claims: {
        P345: [{ mainsnak: { datavalue: { value: "tt0133093" } } }],
        P577: [
          { mainsnak: { datavalue: { value: { time: "+1999-03-31T00:00:00Z" } } } },
          { mainsnak: { datavalue: { value: { time: "+1998-03-31T00:00:00Z" } } } },
        ],
        P31: [{ mainsnak: { datavalue: { value: { id: "Q11424" } } } }],
      },
    },
    Q5: {
      labels: { en: { value: "Keanu Reeves" } },
      claims: {
        P345: [{ mainsnak: { datavalue: { value: "nm0000206" } } }],
        P31: [{ mainsnak: { datavalue: { value: { id: "Q5" } } } }],
      },
    },
    Q123: {
      labels: { en: { value: "The Matrix (season 1)" } },
      claims: {
        P345: [{ mainsnak: { datavalue: { value: "tt9999999" } } }],
        P31: [{ mainsnak: { datavalue: { value: { id: "Q3464665" } } } }],
      },
    },
    Q999: {
      labels: { en: { value: "The Matrix Online" } },
      claims: {
        P345: [{ mainsnak: { datavalue: { value: "tt0461425" } } }],
        P31: [{ mainsnak: { datavalue: { value: { id: "Q7889" } } } }],
      },
    },
  },
};

test("keeps film items with an IMDb ID and drops people and seasons", () => {
  expect(parseCandidates(searchJson, entitiesJson)).toEqual([
    {
      imdbId: "tt0133093",
      name: "The Matrix",
      year: "1998",
      description: "1999 film by the Wachowskis",
    },
  ]);
});

test("falls back to the search label and description", () => {
  const entities = {
    entities: { Q83495: { claims: entitiesJson.entities.Q83495.claims } },
  };
  expect(parseCandidates(searchJson, entities)).toEqual([
    {
      imdbId: "tt0133093",
      name: "The Matrix",
      year: "1998",
      description: "1999 film",
    },
  ]);
});

function films(count: number) {
  return {
    search: Array.from({ length: count }, (_, i) => ({ id: `Q${i}`, label: `Film ${i}` })),
    entities: Object.fromEntries(
      Array.from({ length: count }, (_, i) => [
        `Q${i}`,
        {
          claims: {
            P345: [
              {
                mainsnak: {
                  datavalue: { value: i < count - 1 ? "tt0133093" : "tt0000001" },
                },
              },
            ],
            P31: [{ mainsnak: { datavalue: { value: { id: "Q11424" } } } }],
          },
        },
      ]),
    ),
  };
}

test("dedupes by IMDb ID", () => {
  const { search, entities } = films(8);
  expect(parseCandidates({ search }, { entities })).toHaveLength(2);
});

test("caps the list at six distinct titles", () => {
  const search = {
    search: Array.from({ length: 8 }, (_, i) => ({ id: `Q${i}`, label: `Film ${i}` })),
  };
  const entities = {
    entities: Object.fromEntries(
      Array.from({ length: 8 }, (_, i) => [
        `Q${i}`,
        {
          claims: {
            P345: [{ mainsnak: { datavalue: { value: `tt000000${i}` } } }],
            P31: [{ mainsnak: { datavalue: { value: { id: "Q11424" } } } }],
          },
        },
      ]),
    ),
  };
  expect(parseCandidates(search, entities)).toHaveLength(6);
});

function fakeHttp(searchReply: LooseJson, entitiesReply: LooseJson) {
  const calls: Array<string> = [];
  const http: HttpClient = {
    get: async (url: string) => {
      calls.push(url);
      return {
        ok: true,
        json: async () => (url.includes("wbsearchentities") ? searchReply : entitiesReply),
        text: async () => "",
      };
    },
  };
  return { http, calls };
}

test("searches titles and resolves the entities in one batch", async () => {
  const { http, calls } = fakeHttp(searchJson, entitiesJson);
  const out = await searchTitles(
    { http, cache: new Cache<Array<TitleCandidate>>(60_000) },
    "The Matrix",
  );

  expect(out.ok).toBe(true);
  expect(out.ok && out.candidates[0]?.imdbId).toBe("tt0133093");
  // One search plus one batched entity request, not one request per hit.
  expect(calls).toHaveLength(2);
});

test("caches a query and ignores case and outer spaces", async () => {
  const { http, calls } = fakeHttp(searchJson, entitiesJson);
  const deps = { http, cache: new Cache<Array<TitleCandidate>>(60_000) };

  await searchTitles(deps, "The Matrix");
  const second = await searchTitles(deps, "  the matrix ");

  expect(second.ok).toBe(true);
  expect(calls).toHaveLength(2);
});

test("reports a failed search without throwing", async () => {
  const http: HttpClient = {
    get: async () => ({ ok: false, json: async () => ({}), text: async () => "" }),
  };

  expect(
    await searchTitles({ http, cache: new Cache<Array<TitleCandidate>>(60_000) }, "The Matrix"),
  ).toEqual({ ok: false });
});

test("treats an unreadable response as a failure, not an empty result", async () => {
  const { http } = fakeHttp({}, entitiesJson);

  expect(
    await searchTitles({ http, cache: new Cache<Array<TitleCandidate>>(60_000) }, "The Matrix"),
  ).toEqual({ ok: false });
});
