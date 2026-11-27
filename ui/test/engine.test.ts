import { assert, describe, it } from "@effect/vitest";
import { Deferred, Effect } from "effect";
import type { LookupDeps } from "../src/lookup-machine";
import type { LookupOutcome } from "../../src/lib/types";
import { LookupEngine, lookupEngineLayer } from "../src/commands";

const MATRIX = {
  id: "tt0133093",
  url: "https://example.com/matrix",
  provider: "vidlink.pro",
  type: "movie",
  name: "The Matrix",
} as const;

// The engine is the one place the UI touches the real XState machine. This
// test drives it with fake services so a broken wire fails here, not in e2e.
describe("the lookup engine", () => {
  it.effect("advance shows the machine working and settle returns its answer", () =>
    Effect.gen(function* () {
      const reply = yield* Deferred.make<LookupOutcome>();
      const deps: LookupDeps = {
        lookup: () => Deferred.await(reply),
      };

      const settled = yield* Effect.scoped(
        Effect.gen(function* () {
          const engine = yield* LookupEngine;
          const looking = yield* engine.advance({ type: "submit", input: "tt0133093" });
          assert.strictEqual(looking.phase, "looking");
          assert.deepStrictEqual(looking.status, {
            kind: "loading",
            text: "Finding a working stream...",
          });

          yield* Effect.forkChild(
            Effect.gen(function* () {
              yield* Deferred.succeed(reply, { ok: true, result: MATRIX });
            }),
          );

          return yield* engine.settle();
        }).pipe(Effect.provide(lookupEngineLayer(deps))),
      );

      assert.strictEqual(settled.phase, "idle");
      assert.deepStrictEqual(settled.result, MATRIX);
      assert.strictEqual(settled.status.kind, "idle");
    }),
  );
});
