// @vitest-environment happy-dom
import { Component } from "@effect/ui";
import { HtmlLocator, HtmlPlay } from "@effect/ui/html/testing";
import { TestHost } from "@effect/ui/testing";
import { assert, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import type { LookupDeps } from "../../backend/src/lookup-machine";
import { AdvanceLookup, AwaitLookupSettle, lookupEngineLayer } from "../src/commands";
import { COPY } from "../src/copy";
import { WatchNoDeps } from "../src/watch";

const candidate = {
  imdbId: "tt0133093",
  name: "The Matrix",
  year: "1999",
  kind: "movie" as const,
  poster: "https://images.metahub.space/poster/small/tt0133093/img",
};

const result = {
  id: "tt0133093",
  name: "The Matrix",
  url: "https://vidsrc.in/embed/movie/tt0133093",
  provider: "vidsrc.in",
  type: "movie" as const,
  year: "1999",
  rating: "8.7",
};

const fakeDeps: LookupDeps = {
  search: () => Effect.succeed({ ok: true as const, candidates: [candidate] }),
  lookup: () => Effect.succeed({ ok: true as const, result }),
};

const WatchTest = WatchNoDeps.pipe(
  Component.provide(
    Layer.mergeAll(AdvanceLookup.layer, AwaitLookupSettle.layer).pipe(
      Layer.provide(lookupEngineLayer(fakeDeps)),
    ),
  ),
);

const textbox = HtmlLocator.role("textbox", { name: COPY.fieldLabel });
const watchNow = HtmlLocator.role("button", { name: COPY.submit });

it.layer(TestHost.layer(), { buildPerTest: true })("Watch as a Play", (it) => {
  it.effect("searches, picks and opens a result against the real machine", () =>
    Effect.gen(function* () {
      const play = yield* HtmlPlay.make(WatchTest, {});
      yield* play.type(textbox, "The Matrix");
      yield* play.click(watchNow);
      const row = HtmlLocator.role("button", { name: /The Matrix/ });
      yield* play.expect(row).toExist();
      yield* play.click(row);
      // The dialog renders in the top layer, which the test host does not
      // expose. The shareable hash it writes and the Model prove it opened.
      assert.strictEqual(location.hash, "#id=tt0133093");
      assert.strictEqual(play.root.model()?.lookup.openId, "tt0133093");
      assert.strictEqual(play.root.model()?.lookup.result?.provider, "vidsrc.in");
      yield* play.expect(row).toExist();
    }),
  );
});
