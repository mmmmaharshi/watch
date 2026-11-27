import { describe, expect, test } from "vitest";
import { Effect } from "effect";
import type { LookupInput } from "../../src/lib/types";
import { LOOKUP_FAILED } from "../../src/lib/messages";
import { makeLookupDeps } from "../src/deps";
import type { LookupTransport } from "../../src/lib/transport";

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
  ...overrides,
});

const lookup = (deps: ReturnType<typeof makeLookupDeps>, input: LookupInput) =>
  Effect.runPromise(deps.lookup(input));

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
});
