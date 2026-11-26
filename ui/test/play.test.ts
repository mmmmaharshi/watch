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
  it.effect("looks up an id and opens the result against the real machine", () =>
    Effect.gen(function* () {
      const play = yield* HtmlPlay.make(WatchTest, {});
      yield* play.type(textbox, "tt0133093");
      yield* play.click(watchNow);
      const dialog = HtmlLocator.role("dialog", { name: "The Matrix" });
      yield* play.expect(dialog).toExist();
      yield* play.expect(dialog).toHaveText(/vidsrc\.in/);
      yield* play.expect(HtmlLocator.role("link", { name: result.url })).toExist();
      // The shareable hash is the dialog's own side effect.
      assert.strictEqual(location.hash, "#id=tt0133093");
      yield* play.click(HtmlLocator.role("button", { name: COPY.cancel }));
      yield* play.expect(dialog).toBeAbsent();
      yield* play.expect(textbox).toHaveValue("tt0133093");
    }),
  );
});
