import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import type { LookupInput, SearchInput } from "../../backend/src/lookup-machine";
import { LOOKUP_FAILED, SEARCH_FAILED } from "./messages";
import { makeLookupDeps } from "./ui-deps";
import type { LookupTransport } from "./ui-deps";

const RESULT = {
  id: "tt0133093",
  name: "The Matrix",
  url: "https://vidsrc.in/embed/movie/tt0133093",
  provider: "vidsrc.in",
  type: "movie" as const,
  year: "1999",
};

const notCalled = async (): Promise<never> => {
  throw new Error("transport call was not expected");
};

const transport = (overrides: Partial<LookupTransport> = {}): LookupTransport => ({
  watch: notCalled,
  search: notCalled,
  ...overrides,
});

const lookup = (deps: ReturnType<typeof makeLookupDeps>, input: LookupInput) =>
  Effect.runPromise(deps.lookup(input));

const search = (deps: ReturnType<typeof makeLookupDeps>, input: SearchInput) =>
  Effect.runPromise(deps.search(input));

describe("the browser lookup deps", () => {
  test("a found stream becomes a lookup result without the transport status", async () => {
    const calls: Array<unknown> = [];
    const deps = makeLookupDeps(
      transport({
        watch: async (input) => {
          calls.push(input);
          return { data: { ok: true, result: RESULT } };
        },
      }),
    );

    expect(await lookup(deps, { id: "tt0133093", kind: "movie" })).toEqual({
      ok: true,
      result: RESULT,
    });
    expect(calls).toEqual([{ id: "tt0133093", kind: "movie" }]);
  });

  test("a product failure keeps its reason and message", async () => {
    const deps = makeLookupDeps(
      transport({
        watch: async () => ({
          data: {
            ok: false,
            status: 503,
            reason: "no_providers",
            error: "No working providers available",
          },
        }),
      }),
    );

    expect(await lookup(deps, { id: "tt0133093", kind: "movie" })).toEqual({
      ok: false,
      reason: "no_providers",
      error: "No working providers available",
    });
  });

  test("a failed action call is a visible lookup failure", async () => {
    const deps = makeLookupDeps(
      transport({
        watch: async () => {
          throw new Error("network down");
        },
      }),
    );

    expect(await lookup(deps, { id: "tt0133093", kind: "movie" })).toEqual({
      ok: false,
      reason: "invalid_input",
      error: LOOKUP_FAILED,
    });
  });

  test("a title search passes its candidates through", async () => {
    const candidates = [
      { imdbId: "tt0133093", name: "The Matrix", year: "1999", kind: "movie" as const },
    ];
    const deps = makeLookupDeps(
      transport({
        search: async () => ({ data: { ok: true, candidates } }),
      }),
    );

    expect(await search(deps, { query: "The Matrix", kind: "movie" })).toEqual({
      ok: true,
      candidates,
    });
  });

  test("a failed title search is a search failure", async () => {
    const deps = makeLookupDeps(
      transport({
        search: async () => {
          throw new Error("network down");
        },
      }),
    );

    expect(await search(deps, { query: "The Matrix", kind: "movie" })).toEqual({
      ok: false,
      error: SEARCH_FAILED,
    });
  });
});
