import { describe, expect, test } from "bun:test";
import { Deferred, Effect } from "effect";
import type { LookupDeps, SearchOutcome } from "../../backend/src/lookup-machine";
import { LookupEngine, lookupEngineLayer } from "../src/commands";

const MATRIX = {
  imdbId: "tt0133093",
  name: "The Matrix",
  year: "1999",
  kind: "movie" as const,
};

// The engine is the one place the UI touches the real XState machine. This
// test drives it with fake services so a broken wire fails here, not in e2e.
describe("the lookup engine", () => {
  test("advance shows the machine working and settle returns its answer", async () => {
    const reply = Deferred.makeUnsafe<SearchOutcome>();
    const deps: LookupDeps = {
      search: () => Deferred.await(reply),
      lookup: () => Effect.never,
    };

    const settled = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const engine = yield* LookupEngine;
          const searching = yield* engine.advance({ type: "submit", input: "matrix" });
          expect(searching.phase).toBe("searching");
          expect(searching.status).toEqual({ kind: "loading", text: "Searching titles..." });

          yield* Effect.forkChild(
            Effect.gen(function* () {
              yield* Deferred.succeed(reply, { ok: true, candidates: [MATRIX] });
            }),
          );

          return yield* engine.settle();
        }).pipe(Effect.provide(lookupEngineLayer(deps))),
      ),
    );

    expect(settled.phase).toBe("idle");
    expect(settled.candidates).toEqual([MATRIX]);
    expect(settled.status).toEqual({ kind: "info", text: "1 match. Choose one." });
  });
});
