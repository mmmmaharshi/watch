import { Component } from "@effect/ui";
import { HtmlCommand } from "@effect/ui/html";
import { HtmlLocator } from "@effect/ui/html/testing";
import { Locator } from "@effect/ui/testing";
import { HtmlScene } from "@effect/ui/html/testing";
import { describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { RunLookup, ClearHistoryHash, WriteHistoryHash } from "../src/commands";
import { COPY } from "../../src/lib/copy";
import { idleLookup } from "../src/lookup";
import type { LookupState } from "../src/lookup";
import { WatchMessage } from "../src/messages";
import { ReadSearchField, TrackHash } from "../src/mounts";
import { WatchNoDeps } from "../src/watch";

const LINK = "https://www.imdb.com/title/tt0133093/";

const snapshot = (patch: Partial<LookupState>): LookupState => ({
  ...idleLookup(),
  ...patch,
});

const mounted = (fields: {
  fieldText?: string;
  hash?: string;
  search?: string;
  isTouch?: boolean;
}) =>
  WatchMessage.MountedSearch({
    fieldText: fields.fieldText ?? "",
    hash: fields.hash ?? "",
    search: fields.search ?? "",
    isTouch: fields.isTouch ?? false,
  });

const textbox = HtmlLocator.role("textbox", { name: COPY.fieldLabel });
const watchNow = HtmlLocator.role("button", { name: COPY.submit });

describe("A1 — an empty submit asks for an id", () => {
  it.effect("the field is marked invalid", () =>
    Effect.gen(function* () {
      const s = yield* HtmlScene.make(WatchNoDeps, {});
      s.mounted(ReadSearchField, mounted({}))
        .expectMount(TrackHash({}))
        .resolve(HtmlCommand.Focus, { found: true })
        .click(watchNow)
        .expectExact(RunLookup)
        .resolve(
          RunLookup,
          WatchMessage.CompletedLookup({
            generation: 1,
            snapshot: snapshot({
              status: { kind: "field", text: "Enter an IMDb or TMDB ID or link." },
            }),
          }),
        )
        .resolve(HtmlCommand.Focus, { found: true })
        .expect(textbox)
        .toHaveAttribute("aria-invalid", "true")
        .expect(textbox)
        .toHaveValue("");
    }),
  );
});

describe("A6 — a shared link prefills the field", () => {
  it.effect("the field holds the full link and nothing opens", () =>
    Effect.gen(function* () {
      const s = yield* HtmlScene.make(WatchNoDeps, {});
      s.mounted(ReadSearchField, mounted({ hash: "#id=tt0133093" }))
        .expectMount(TrackHash({}))
        .resolve(RunLookup, WatchMessage.CompletedLookup({ generation: 1, snapshot: idleLookup() }))
        .expect(textbox)
        .toHaveValue(LINK)
        .expectNone();
    }),
  );
});

describe("A9 — a phone does not open the keyboard", () => {
  it.effect("a touch mount asks for no focus", () =>
    Effect.gen(function* () {
      const s = yield* HtmlScene.make(WatchNoDeps, {});
      s.mounted(ReadSearchField, mounted({ isTouch: true }))
        .expectMount(TrackHash({}))
        .expectNone();
    }),
  );
});

describe("A10 — a paste before hydration survives it", () => {
  it.effect("the field keeps the pasted link and Watch now starts a lookup", () =>
    Effect.gen(function* () {
      const s = yield* HtmlScene.make(WatchNoDeps, {});
      s.mounted(ReadSearchField, mounted({ fieldText: LINK }))
        .expectMount(TrackHash({}))
        .expect(textbox)
        .toHaveValue(LINK)
        .click(watchNow)
        .expectExact(RunLookup)
        .resolve(RunLookup, WatchMessage.CompletedLookup({ generation: 1, snapshot: idleLookup() }))
        .expect(textbox)
        .toHaveValue(LINK);
    }),
  );
});

describe("the result dialog", () => {
  const result = {
    id: "tt0133093",
    name: "The Matrix",
    url: "https://vidsrc.in/embed/movie/tt0133093",
    provider: "vidsrc.in",
    type: "movie" as const,
    year: "1999",
    rating: "8.7",
  };
  const opened = snapshot({ result, openId: result.id });

  const open = { generation: 1 as const, snapshot: opened };

  it.effect("a close request from the dialog sends the machine close", () =>
    Effect.gen(function* () {
      const s = yield* HtmlScene.make(WatchNoDeps, {});
      s.mounted(ReadSearchField, mounted({}))
        .expectMount(TrackHash({}))
        .resolve(HtmlCommand.Focus, { found: true })
        .type(textbox, "tt0133093")
        .click(watchNow)
        .expectExact(RunLookup)
        .resolve(RunLookup, WatchMessage.CompletedLookup(open))
        .expectExact(WriteHistoryHash)
        .resolve(WriteHistoryHash, Component.noop)
        .fire(Locator.tag("dialog"), "cancel")
        .expectExact(RunLookup)
        .resolve(RunLookup, WatchMessage.CompletedLookup({ generation: 2, snapshot: idleLookup() }))
        .expectExact(ClearHistoryHash, HtmlCommand.Focus)
        .resolve(ClearHistoryHash, Component.noop)
        .resolve(HtmlCommand.Focus, { found: true })
        .expect(textbox)
        .toHaveValue("tt0133093");
    }),
  );

  it.effect("a hash removal closes an open result", () =>
    Effect.gen(function* () {
      const s = yield* HtmlScene.make(WatchNoDeps, {});
      s.mounted(ReadSearchField, mounted({}))
        .expectMount(TrackHash({}))
        .resolve(HtmlCommand.Focus, { found: true })
        .type(textbox, "tt0133093")
        .click(watchNow)
        .expectExact(RunLookup)
        .resolve(RunLookup, WatchMessage.CompletedLookup(open))
        .expectExact(WriteHistoryHash)
        .resolve(WriteHistoryHash, Component.noop)
        .mounted(TrackHash, WatchMessage.NavigatedToHash({ hash: "", search: "" }))
        .expectExact(RunLookup)
        .resolve(RunLookup, WatchMessage.CompletedLookup({ generation: 2, snapshot: idleLookup() }))
        .expectExact(ClearHistoryHash, HtmlCommand.Focus)
        .resolve(ClearHistoryHash, Component.noop)
        .resolve(HtmlCommand.Focus, { found: true })
        .expect(textbox)
        .toHaveValue("tt0133093");
    }),
  );
});
