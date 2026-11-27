import { assert, describe, it } from "@effect/vitest";
import { Deferred, Effect } from "effect";
import { createEffectActor, sendAndAwait, waitFor } from "@xstate/effect";
import { createLookupMachine } from "../src/lookup-machine";
import type { LookupDeps } from "../src/lookup-machine";
import type { LookupInput, LookupOutcome } from "../../src/lib/types";

const MATRIX_RESULT = {
  id: "tt0133093",
  url: "https://example.com/matrix",
  provider: "vidlink.pro",
  type: "movie",
  name: "The Matrix",
} as const;

const BREAKING_BAD_RESULT = {
  id: "tt0903747",
  url: "https://example.com/breaking-bad",
  provider: "vidfast.vc",
  type: "tv",
  name: "Breaking Bad",
} as const;

type LookupReply = { input: LookupInput; reply: Deferred.Deferred<LookupOutcome> };

// The service is the seam: the machine only ever sees this interface.
const controlled = () => {
  const lookups: Array<LookupReply> = [];
  const deps: LookupDeps = {
    lookup: (input) => {
      const reply = Deferred.makeUnsafe<LookupOutcome>();
      lookups.push({ input, reply });
      return Deferred.await(reply);
    },
  };
  return { deps, lookups };
};

const idle = () =>
  createLookupMachine({
    lookup: () => Effect.never,
  });

const opened = () =>
  Effect.gen(function* () {
    const actor = yield* createEffectActor(idle());
    yield* sendAndAwait(actor, { type: "submit", input: "tt0133093" });
    yield* sendAndAwait(actor, {
      type: "lookupDone",
      output: { ok: true, result: MATRIX_RESULT },
    });
    return actor;
  });

describe("lookup machine", () => {
  it.effect("starts idle with no dialog and an empty field", () =>
    Effect.gen(function* () {
      const actor = yield* createEffectActor(idle());
      const snap = actor.getSnapshot();
      assert.strictEqual(snap.value, "idle");
      assert.strictEqual(snap.context.linkSubmit, false);
      assert.strictEqual(snap.context.openId, null);
      assert.deepStrictEqual(snap.context.status, { kind: "idle" });
    }).pipe(Effect.scoped),
  );

  it.effect("submit with an IMDb id looks it up with the selected kind", () => {
    const { deps, lookups } = controlled();
    return Effect.gen(function* () {
      const actor = yield* createEffectActor(createLookupMachine(deps));
      const snap = yield* sendAndAwait(actor, { type: "submit", input: "tt0133093" });
      assert.strictEqual(snap.value, "looking");
      assert.deepStrictEqual(snap.context.status, {
        kind: "loading",
        text: "Finding a working stream...",
      });
      assert.deepStrictEqual(
        lookups.map((call) => call.input),
        [{ id: "tt0133093", kind: "movie", strictKind: true }],
      );
    }).pipe(Effect.scoped);
  });

  it.effect("a failed lookup closes nothing and shows the product error", () =>
    Effect.gen(function* () {
      const actor = yield* createEffectActor(idle());
      yield* sendAndAwait(actor, { type: "submit", input: "tt9999999" });
      const snap = yield* sendAndAwait(actor, {
        type: "lookupDone",
        output: { ok: false, reason: "metadata_missing", error: "Metadata missing" },
      });
      assert.strictEqual(snap.value, "idle");
      assert.strictEqual(snap.context.openId, null);
      assert.deepStrictEqual(snap.context.status, {
        kind: "error",
        text: "Metadata missing",
      });
    }).pipe(Effect.scoped),
  );

  it.effect("submit with a bare TMDB number keeps the kind open", () => {
    const { deps, lookups } = controlled();
    return Effect.gen(function* () {
      const actor = yield* createEffectActor(createLookupMachine(deps));
      yield* sendAndAwait(actor, { type: "submit", input: "1396" });
      assert.deepStrictEqual(
        lookups.map((call) => call.input),
        [{ id: "1396", strictKind: true }],
      );
    }).pipe(Effect.scoped);
  });

  it.effect("a retry opens the result it returns, even for another id", () => {
    const { deps, lookups } = controlled();
    return Effect.gen(function* () {
      const actor = yield* createEffectActor(createLookupMachine(deps));
      yield* sendAndAwait(actor, { type: "submit", input: "tt0133093" });
      yield* sendAndAwait(actor, {
        type: "lookupDone",
        output: { ok: true, result: MATRIX_RESULT },
      });
      const snap = yield* sendAndAwait(actor, { type: "retry" });
      assert.strictEqual(snap.value, "retrying");
      assert.deepStrictEqual(lookups.at(-1)?.input, {
        id: "tt0133093",
        kind: "movie",
        strictKind: true,
        name: "The Matrix",
        exclude: "vidlink.pro",
      });
      const done = yield* sendAndAwait(actor, {
        type: "lookupDone",
        output: { ok: true, result: BREAKING_BAD_RESULT },
      });
      assert.strictEqual(done.value, "idle");
      assert.deepStrictEqual(done.context.result, BREAKING_BAD_RESULT);
      assert.strictEqual(done.context.openId, "tt0903747");
      assert.deepStrictEqual(done.context.status, { kind: "idle" });
    }).pipe(Effect.scoped);
  });

  it.effect("retry with no result is ignored", () => {
    const { deps, lookups } = controlled();
    return Effect.gen(function* () {
      const actor = yield* createEffectActor(createLookupMachine(deps));
      const snap = yield* sendAndAwait(actor, { type: "retry" });
      assert.strictEqual(snap.value, "idle");
      assert.strictEqual(lookups.length, 0);
    }).pipe(Effect.scoped);
  });

  it.effect("retry while retrying is ignored", () => {
    const { deps, lookups } = controlled();
    return Effect.gen(function* () {
      const actor = yield* createEffectActor(createLookupMachine(deps));
      yield* sendAndAwait(actor, { type: "submit", input: "tt0133093" });
      yield* sendAndAwait(actor, {
        type: "lookupDone",
        output: { ok: true, result: MATRIX_RESULT },
      });
      yield* sendAndAwait(actor, { type: "retry" });
      const snap = yield* sendAndAwait(actor, { type: "retry" });
      assert.strictEqual(snap.value, "retrying");
      assert.strictEqual(lookups.length, 2);
    }).pipe(Effect.scoped);
  });

  it.effect("fail while looking returns to idle with the error text", () =>
    Effect.gen(function* () {
      const actor = yield* createEffectActor(idle());
      yield* sendAndAwait(actor, { type: "submit", input: "tt0133093" });
      const snap = yield* sendAndAwait(actor, {
        type: "fail",
        message: "Something went wrong. Try again.",
      });
      assert.strictEqual(snap.value, "idle");
      assert.deepStrictEqual(snap.context.status, {
        kind: "error",
        text: "Something went wrong. Try again.",
      });
    }).pipe(Effect.scoped),
  );

  it.effect("close hides the dialog but keeps the result", () =>
    Effect.gen(function* () {
      const actor = yield* opened();
      const snap = yield* sendAndAwait(actor, { type: "close" });
      assert.strictEqual(snap.context.openId, null);
      assert.deepStrictEqual(snap.context.result, MATRIX_RESULT);
    }).pipe(Effect.scoped),
  );

  it.effect("a hash echo for the open dialog is ignored", () =>
    Effect.gen(function* () {
      const actor = yield* opened();
      const snap = yield* sendAndAwait(actor, { type: "hashNav", id: "tt0133093" });
      assert.strictEqual(snap.value, "idle");
      assert.strictEqual(snap.context.openId, "tt0133093");
    }).pipe(Effect.scoped),
  );

  it.effect("hash navigation back to the open result reopens the dialog", () =>
    Effect.gen(function* () {
      const actor = yield* opened();
      yield* sendAndAwait(actor, { type: "close" });
      const snap = yield* sendAndAwait(actor, { type: "hashNav", id: "tt0133093" });
      assert.strictEqual(snap.context.openId, "tt0133093");
      assert.deepStrictEqual(snap.context.result, MATRIX_RESULT);
    }).pipe(Effect.scoped),
  );

  it.effect("hash navigation to another id closes the open dialog", () =>
    Effect.gen(function* () {
      const actor = yield* opened();
      const snap = yield* sendAndAwait(actor, { type: "hashNav", id: "tt0903747" });
      assert.strictEqual(snap.context.openId, null);
      assert.deepStrictEqual(snap.context.result, MATRIX_RESULT);
    }).pipe(Effect.scoped),
  );

  it.effect("an empty submit is a field error and starts no work", () => {
    const { deps, lookups } = controlled();
    return Effect.gen(function* () {
      const actor = yield* createEffectActor(createLookupMachine(deps));
      const snap = yield* sendAndAwait(actor, { type: "submit", input: "   " });
      assert.strictEqual(snap.value, "idle");
      assert.deepStrictEqual(snap.context.status, {
        kind: "field",
        text: "Enter an IMDb or TMDB ID or link.",
      });
      assert.strictEqual(lookups.length, 0);
    }).pipe(Effect.scoped);
  });

  it.effect("a link from the wrong site is an error and starts no work", () => {
    const { deps, lookups } = controlled();
    return Effect.gen(function* () {
      const actor = yield* createEffectActor(createLookupMachine(deps));
      const snap = yield* sendAndAwait(actor, {
        type: "submit",
        input: "https://example.com/movie/603",
      });
      assert.strictEqual(snap.value, "idle");
      assert.deepStrictEqual(snap.context.status, {
        kind: "error",
        text: "Use an IMDb title link or a TMDB movie or TV link.",
      });
      assert.strictEqual(lookups.length, 0);
    }).pipe(Effect.scoped);
  });

  it.effect("a lookup that dies returns to idle with the lookup failure text", () => {
    const deps: LookupDeps = {
      lookup: () => Effect.die("boom"),
    };
    return Effect.gen(function* () {
      const actor = yield* createEffectActor(createLookupMachine(deps));
      yield* sendAndAwait(actor, { type: "submit", input: "tt0133093" });
      const snap = yield* waitFor(actor, (state) => state.matches("idle"), {
        timeout: "1 second",
      });
      assert.deepStrictEqual(snap.context.status, {
        kind: "error",
        text: "Something went wrong. Try again.",
      });
    }).pipe(Effect.scoped);
  });

  it.effect("a failed retry keeps the open result and shows the error", () =>
    Effect.gen(function* () {
      const actor = yield* opened();
      yield* sendAndAwait(actor, { type: "retry" });
      const snap = yield* sendAndAwait(actor, {
        type: "lookupDone",
        output: { ok: false, reason: "no_providers", error: "No working providers available" },
      });
      assert.strictEqual(snap.value, "idle");
      assert.deepStrictEqual(snap.context.result, MATRIX_RESULT);
      assert.strictEqual(snap.context.openId, "tt0133093");
      assert.deepStrictEqual(snap.context.status, {
        kind: "error",
        text: "No other providers available.",
      });
    }).pipe(Effect.scoped),
  );
});
