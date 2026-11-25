import { assert, describe, it } from "@effect/vitest";
import { Deferred, Effect } from "effect";
import { createEffectActor, sendAndAwait, waitFor } from "@xstate/effect";
import { createLookupMachine } from "../src/lookup-machine";
import type { LookupDeps, LookupInput, LookupOutcome } from "../src/lookup-machine";
import type { SearchInput } from "../../src/lib/types";
import type { SearchOutcome } from "../../src/lib/types";

const MATRIX = {
  imdbId: "tt0133093",
  name: "The Matrix",
  year: "1999",
  kind: "movie",
} as const;

const BREAKING_BAD = {
  imdbId: "tt0903747",
  name: "Breaking Bad",
  year: "2008",
  kind: "tv",
} as const;

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

const SEARCH_FAILED = "Title search failed. Try an ID.";

type SearchReply = { input: SearchInput; reply: Deferred.Deferred<SearchOutcome> };
type LookupReply = { input: LookupInput; reply: Deferred.Deferred<LookupOutcome> };

// The services are the seam: the machine only ever sees this interface.
const controlled = () => {
  const searches: Array<SearchReply> = [];
  const lookups: Array<LookupReply> = [];
  const deps: LookupDeps = {
    search: (input) => {
      const reply = Deferred.makeUnsafe<SearchOutcome>();
      searches.push({ input, reply });
      return Deferred.await(reply);
    },
    lookup: (input) => {
      const reply = Deferred.makeUnsafe<LookupOutcome>();
      lookups.push({ input, reply });
      return Deferred.await(reply);
    },
  };
  return { deps, searches, lookups };
};

const idle = () =>
  createLookupMachine({
    search: () => Effect.never,
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
      assert.strictEqual(snap.context.value, "");
      assert.strictEqual(snap.context.openId, null);
      assert.deepStrictEqual(snap.context.status, { kind: "idle" });
    }).pipe(Effect.scoped),
  );

  it.effect("submit with a title searches the trimmed text and shows the loading text", () => {
    const { deps, searches } = controlled();
    return Effect.gen(function* () {
      const actor = yield* createEffectActor(createLookupMachine(deps));
      const snap = yield* sendAndAwait(actor, { type: "submit", input: "  the matrix " });
      assert.strictEqual(snap.value, "searching");
      assert.strictEqual(snap.context.value, "the matrix");
      assert.deepStrictEqual(snap.context.status, {
        kind: "loading",
        text: "Searching titles...",
      });
      assert.deepStrictEqual(
        searches.map((call) => call.input),
        [{ query: "the matrix", kind: "movie", language: "" }],
      );
    }).pipe(Effect.scoped);
  });

  it.effect("search done with candidates fills the list and asks the viewer to choose", () =>
    Effect.gen(function* () {
      const actor = yield* createEffectActor(idle());
      yield* sendAndAwait(actor, { type: "submit", input: "matrix" });
      const snap = yield* sendAndAwait(actor, {
        type: "searchDone",
        output: { ok: true, candidates: [MATRIX, BREAKING_BAD] },
      });
      assert.strictEqual(snap.value, "idle");
      assert.deepStrictEqual(snap.context.candidates, [MATRIX, BREAKING_BAD]);
      assert.deepStrictEqual(snap.context.status, {
        kind: "info",
        text: "2 matches. Choose one.",
      });
    }).pipe(Effect.scoped),
  );

  it.effect("search done with no candidates says no title was found", () =>
    Effect.gen(function* () {
      const actor = yield* createEffectActor(idle());
      yield* sendAndAwait(actor, { type: "submit", input: "nothing" });
      const snap = yield* sendAndAwait(actor, {
        type: "searchDone",
        output: { ok: true, candidates: [] },
      });
      assert.strictEqual(snap.value, "idle");
      assert.deepStrictEqual(snap.context.status, {
        kind: "error",
        text: "No title found. Try an ID or the full link.",
      });
    }).pipe(Effect.scoped),
  );

  it.effect("search done with a failed search shows the search failure text", () =>
    Effect.gen(function* () {
      const actor = yield* createEffectActor(idle());
      yield* sendAndAwait(actor, { type: "submit", input: "matrix" });
      const snap = yield* sendAndAwait(actor, {
        type: "searchDone",
        output: { ok: false, error: "upstream is down" },
      });
      assert.strictEqual(snap.value, "idle");
      assert.deepStrictEqual(snap.context.status, {
        kind: "error",
        text: SEARCH_FAILED,
      });
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
        [{ id: "tt0133093", kind: "movie" }],
      );
    }).pipe(Effect.scoped);
  });

  it.effect("a successful pasted-link lookup moves the selector to the result type", () => {
    const { deps, lookups } = controlled();
    return Effect.gen(function* () {
      const actor = yield* createEffectActor(createLookupMachine(deps));
      yield* sendAndAwait(actor, { type: "kindChange", kind: "tv" });
      yield* sendAndAwait(actor, {
        type: "submit",
        input: "https://www.themoviedb.org/movie/603",
      });
      assert.deepStrictEqual(
        lookups.map((call) => call.input),
        [{ id: "603", kind: "movie" }],
      );
      const snap = yield* sendAndAwait(actor, {
        type: "lookupDone",
        output: { ok: true, result: MATRIX_RESULT },
      });
      assert.strictEqual(snap.value, "idle");
      assert.strictEqual(snap.context.kind, "movie");
      assert.strictEqual(snap.context.openId, "tt0133093");
      assert.deepStrictEqual(snap.context.result, MATRIX_RESULT);
      assert.deepStrictEqual(snap.context.status, { kind: "idle" });
    }).pipe(Effect.scoped);
  });

  it.effect("a successful bare-id lookup leaves the selector alone", () => {
    const { deps } = controlled();
    return Effect.gen(function* () {
      const actor = yield* createEffectActor(createLookupMachine(deps));
      yield* sendAndAwait(actor, { type: "kindChange", kind: "tv" });
      yield* sendAndAwait(actor, { type: "submit", input: "603" });
      const snap = yield* sendAndAwait(actor, {
        type: "lookupDone",
        output: { ok: true, result: MATRIX_RESULT },
      });
      assert.strictEqual(snap.context.kind, "tv");
      assert.strictEqual(snap.context.openId, "tt0133093");
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

  it.effect("a bare number missing from TMDB falls back to a title search", () => {
    const { deps, searches, lookups } = controlled();
    return Effect.gen(function* () {
      const actor = yield* createEffectActor(createLookupMachine(deps));
      yield* sendAndAwait(actor, { type: "submit", input: "1917" });
      const degraded = yield* sendAndAwait(actor, {
        type: "lookupDone",
        output: { ok: false, reason: "tmdb_not_found", error: "TMDB ID not found" },
      });
      assert.strictEqual(degraded.value, "searching");
      assert.deepStrictEqual(
        searches.map((call) => call.input),
        [{ query: "1917", kind: "movie", language: "" }],
      );
      assert.strictEqual(lookups.length, 1);
    }).pipe(Effect.scoped);
  });

  it.effect("pick looks up the candidate id and opens the dialog", () => {
    const { deps, lookups } = controlled();
    return Effect.gen(function* () {
      const actor = yield* createEffectActor(createLookupMachine(deps));
      yield* sendAndAwait(actor, { type: "pick", candidate: MATRIX });
      assert.deepStrictEqual(
        lookups.map((call) => call.input),
        [{ id: "tt0133093", kind: "movie", strictKind: true }],
      );
      const snap = yield* sendAndAwait(actor, {
        type: "lookupDone",
        output: { ok: true, result: MATRIX_RESULT },
      });
      assert.strictEqual(snap.context.openId, "tt0133093");
      assert.deepStrictEqual(snap.context.status, { kind: "idle" });
    }).pipe(Effect.scoped);
  });

  it.effect("a TV pick sends the candidate kind as strict", () => {
    const { deps, lookups } = controlled();
    return Effect.gen(function* () {
      const actor = yield* createEffectActor(createLookupMachine(deps));
      yield* sendAndAwait(actor, { type: "pick", candidate: BREAKING_BAD });
      assert.deepStrictEqual(
        lookups.map((call) => call.input),
        [{ id: "tt0903747", kind: "tv", strictKind: true }],
      );
    }).pipe(Effect.scoped);
  });

  it.effect("pick supersedes a running search", () => {
    const { deps, searches, lookups } = controlled();
    return Effect.gen(function* () {
      const actor = yield* createEffectActor(createLookupMachine(deps));
      yield* sendAndAwait(actor, { type: "submit", input: "matrix" });
      const snap = yield* sendAndAwait(actor, { type: "pick", candidate: MATRIX });
      assert.strictEqual(snap.value, "looking");
      assert.strictEqual(searches.length, 1);
      assert.deepStrictEqual(
        lookups.map((call) => call.input),
        [{ id: "tt0133093", kind: "movie", strictKind: true }],
      );
    }).pipe(Effect.scoped);
  });

  it.effect("retry looks up the open result again while excluding its provider", () => {
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
        exclude: "vidlink.pro",
      });
      const done = yield* sendAndAwait(actor, {
        type: "lookupDone",
        output: { ok: true, result: BREAKING_BAD_RESULT },
      });
      assert.strictEqual(done.value, "idle");
      assert.deepStrictEqual(done.context.result, BREAKING_BAD_RESULT);
      assert.strictEqual(done.context.openId, "tt0133093");
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

  it.effect("close hides the dialog but keeps the result and the list", () =>
    Effect.gen(function* () {
      const actor = yield* createEffectActor(idle());
      yield* sendAndAwait(actor, { type: "submit", input: "matrix" });
      yield* sendAndAwait(actor, {
        type: "searchDone",
        output: { ok: true, candidates: [MATRIX] },
      });
      yield* sendAndAwait(actor, { type: "pick", candidate: MATRIX });
      yield* sendAndAwait(actor, {
        type: "lookupDone",
        output: { ok: true, result: MATRIX_RESULT },
      });
      const snap = yield* sendAndAwait(actor, { type: "close" });
      assert.strictEqual(snap.context.openId, null);
      assert.deepStrictEqual(snap.context.result, MATRIX_RESULT);
      assert.deepStrictEqual(snap.context.candidates, [MATRIX]);
    }).pipe(Effect.scoped),
  );

  it.effect("hash navigation prefills the canonical link without opening the dialog", () =>
    Effect.gen(function* () {
      const actor = yield* createEffectActor(idle());
      const snap = yield* sendAndAwait(actor, { type: "hashNav", id: "tt0133093" });
      assert.strictEqual(snap.value, "idle");
      assert.strictEqual(snap.context.value, "https://www.imdb.com/title/tt0133093/");
      assert.strictEqual(snap.context.openId, null);
    }).pipe(Effect.scoped),
  );

  it.effect("a hash echo for the open dialog is ignored", () =>
    Effect.gen(function* () {
      const actor = yield* opened();
      const snap = yield* sendAndAwait(actor, { type: "hashNav", id: "tt0133093" });
      assert.strictEqual(snap.value, "idle");
      assert.strictEqual(snap.context.openId, "tt0133093");
      assert.strictEqual(snap.context.value, "tt0133093");
    }).pipe(Effect.scoped),
  );

  it.effect("hash navigation to another id closes the open dialog", () =>
    Effect.gen(function* () {
      const actor = yield* opened();
      const snap = yield* sendAndAwait(actor, { type: "hashNav", id: "tt0903747" });
      assert.strictEqual(snap.context.openId, null);
      assert.strictEqual(snap.context.value, "https://www.imdb.com/title/tt0903747/");
      assert.deepStrictEqual(snap.context.result, MATRIX_RESULT);
    }).pipe(Effect.scoped),
  );

  it.effect("re-applying the link the field already shows is a no-op", () =>
    Effect.gen(function* () {
      const actor = yield* opened();
      const snap = yield* sendAndAwait(actor, {
        type: "change",
        value: "https://www.imdb.com/title/tt0133093/",
      });
      const again = yield* sendAndAwait(actor, { type: "hashNav", id: "tt0133093" });
      assert.strictEqual(again.context.value, snap.context.value);
      assert.deepStrictEqual(again.context.result, MATRIX_RESULT);
      assert.strictEqual(again.context.openId, "tt0133093");
    }).pipe(Effect.scoped),
  );

  it.effect("kind change clears the candidate list", () =>
    Effect.gen(function* () {
      const actor = yield* createEffectActor(idle());
      yield* sendAndAwait(actor, { type: "submit", input: "matrix" });
      yield* sendAndAwait(actor, {
        type: "searchDone",
        output: { ok: true, candidates: [MATRIX] },
      });
      const snap = yield* sendAndAwait(actor, { type: "kindChange", kind: "tv" });
      assert.strictEqual(snap.context.kind, "tv");
      assert.deepStrictEqual(snap.context.candidates, []);
    }).pipe(Effect.scoped),
  );

  it.effect("typing clears the candidate list and a field error", () =>
    Effect.gen(function* () {
      const actor = yield* createEffectActor(idle());
      yield* sendAndAwait(actor, { type: "submit", input: "   " });
      const snap = yield* sendAndAwait(actor, { type: "change", value: "ma" });
      assert.strictEqual(snap.context.value, "ma");
      assert.deepStrictEqual(snap.context.candidates, []);
      assert.deepStrictEqual(snap.context.status, { kind: "idle" });
    }).pipe(Effect.scoped),
  );

  it.effect("an empty submit is a field error and starts no work", () => {
    const { deps, searches, lookups } = controlled();
    return Effect.gen(function* () {
      const actor = yield* createEffectActor(createLookupMachine(deps));
      const snap = yield* sendAndAwait(actor, { type: "submit", input: "   " });
      assert.strictEqual(snap.value, "idle");
      assert.deepStrictEqual(snap.context.status, {
        kind: "field",
        text: "Enter an IMDb or TMDB ID, link, or title.",
      });
      assert.strictEqual(searches.length, 0);
      assert.strictEqual(lookups.length, 0);
    }).pipe(Effect.scoped);
  });

  it.effect("a link from the wrong site is an error and starts no work", () => {
    const { deps, searches, lookups } = controlled();
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
      assert.strictEqual(searches.length, 0);
      assert.strictEqual(lookups.length, 0);
    }).pipe(Effect.scoped);
  });

  it.effect("a stale search reply is dropped after the next submit supersedes it", () => {
    const { deps, searches } = controlled();
    return Effect.gen(function* () {
      const actor = yield* createEffectActor(createLookupMachine(deps));
      yield* sendAndAwait(actor, { type: "submit", input: "first" });
      yield* sendAndAwait(actor, { type: "submit", input: "second" });
      assert.strictEqual(searches.length, 2);

      yield* Deferred.succeed(searches[0]!.reply, { ok: true, candidates: [MATRIX] });
      yield* Effect.yieldNow;
      yield* Effect.yieldNow;
      const stillSearching = actor.getSnapshot();
      assert.strictEqual(stillSearching.value, "searching");
      assert.deepStrictEqual(stillSearching.context.candidates, []);

      yield* Deferred.succeed(searches[1]!.reply, {
        ok: true,
        candidates: [BREAKING_BAD],
      });
      const settled = yield* waitFor(actor, (snap) => snap.matches("idle"), {
        timeout: "1 second",
      });
      assert.deepStrictEqual(settled.context.candidates, [BREAKING_BAD]);
      assert.strictEqual(settled.context.value, "second");
    }).pipe(Effect.scoped);
  });

  it.effect("a search that dies returns to idle with the search failure text", () => {
    const deps: LookupDeps = {
      search: () => Effect.die("boom"),
      lookup: () => Effect.never,
    };
    return Effect.gen(function* () {
      const actor = yield* createEffectActor(createLookupMachine(deps));
      yield* sendAndAwait(actor, { type: "submit", input: "matrix" });
      const snap = yield* waitFor(actor, (state) => state.matches("idle"), {
        timeout: "1 second",
      });
      assert.deepStrictEqual(snap.context.status, {
        kind: "error",
        text: SEARCH_FAILED,
      });
    }).pipe(Effect.scoped);
  });

  it.effect("a failed retry keeps the open result and shows the error", () =>
    Effect.gen(function* () {
      const actor = yield* opened();
      yield* sendAndAwait(actor, { type: "retry" });
      const snap = yield* sendAndAwait(actor, {
        type: "lookupDone",
        output: { ok: false, reason: "no_providers", error: "No other providers available." },
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
