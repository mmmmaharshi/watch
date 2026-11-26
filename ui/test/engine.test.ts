import { assert, describe, it } from "@effect/vitest";
import { Deferred, Effect } from "effect";
import type { LookupDeps } from "../../backend/src/lookup-machine";
import type { SearchOutcome } from "../../src/lib/types";
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
  it.effect("advance shows the machine working and settle returns its answer", () =>
    Effect.gen(function* () {
      const reply = yield* Deferred.make<SearchOutcome>();
      const deps: LookupDeps = {
        search: () => Deferred.await(reply),
        lookup: () => Effect.never,
      };

      const settled = yield* Effect.scoped(
        Effect.gen(function* () {
          const engine = yield* LookupEngine;
          const searching = yield* engine.advance({ type: "submit", input: "matrix" });
          assert.strictEqual(searching.phase, "searching");
          assert.deepStrictEqual(searching.status, {
            kind: "loading",
            text: "Searching titles...",
          });

          yield* Effect.forkChild(
            Effect.gen(function* () {
              yield* Deferred.succeed(reply, { ok: true, candidates: [MATRIX] });
            }),
          );

          return yield* engine.settle();
        }).pipe(Effect.provide(lookupEngineLayer(deps))),
      );

      assert.strictEqual(settled.phase, "idle");
      assert.deepStrictEqual(settled.candidates, [MATRIX]);
      assert.deepStrictEqual(settled.status, { kind: "info", text: "1 match. Choose one." });
    }),
  );
});
