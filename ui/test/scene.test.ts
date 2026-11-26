import { Component } from "@effect/ui";
import { HtmlCommand } from "@effect/ui/html";
import { HtmlLocator } from "@effect/ui/html/testing";
import { Locator } from "@effect/ui/testing";
import { Dialog, DialogEvents } from "@effect/ui-kit";
import { HtmlScene } from "@effect/ui/html/testing";
import { Story } from "@effect/ui/testing";
import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import {
  AdvanceLookup,
  AwaitLookupSettle,
  ClearHistoryHash,
  WriteHistoryHash,
} from "../src/commands";
import { COPY } from "../src/copy";
import { idleLookup } from "../src/lookup";
import type { LookupState } from "../src/lookup";
import { WatchMessage } from "../src/messages";
import { ReadSearchField, TrackHash } from "../src/mounts";
import { Poster, PosterMessage } from "../src/poster";
import { WatchNoDeps } from "../src/watch";

const LINK = "https://www.imdb.com/title/tt0133093/";
const EMPTY_MESSAGE = "Enter an IMDb or TMDB ID, link, or title.";

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

describe("A1 — an empty submit asks for a title", () => {
  it.effect("the status line asks for a title and the field is marked invalid", () =>
    Effect.gen(function* () {
      const s = yield* HtmlScene.make(WatchNoDeps, {});
      s.mounted(ReadSearchField, mounted({}))
        .expectMount(TrackHash({}))
        .resolve(HtmlCommand.Focus, { found: true })
        .click(watchNow)
        .expectExact(AdvanceLookup)
        .resolve(
          AdvanceLookup,
          WatchMessage.CompletedAdvanceLookup({
            generation: 1,
            snapshot: snapshot({ status: { kind: "field", text: EMPTY_MESSAGE } }),
          }),
        )
        .resolve(HtmlCommand.Focus, { found: true })
        .expect(HtmlLocator.role("status"))
        .toHaveText(EMPTY_MESSAGE)
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
        .resolve(
          AdvanceLookup,
          WatchMessage.CompletedAdvanceLookup({ generation: 1, snapshot: idleLookup() }),
        )
        .expect(textbox)
        .toHaveValue(LINK)
        .expectNone();
    }),
  );
});

describe("A9 — a phone does not open the keyboard", () => {
  it.effect("a touch mount starts with the field unfocused and no focus command", () =>
    Effect.gen(function* () {
      const s = yield* HtmlScene.make(WatchNoDeps, {});
      s.mounted(ReadSearchField, mounted({ isTouch: true }))
        .expectMount(TrackHash({}))
        .expectNone()
        .expect(textbox)
        .toExist();
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
        .expectExact(AdvanceLookup)
        .resolve(
          AdvanceLookup,
          WatchMessage.CompletedAdvanceLookup({
            generation: 1,
            snapshot: snapshot({
              phase: "looking",
              status: { kind: "loading", text: "Finding a working stream..." },
            }),
          }),
        )
        .expectExact(AwaitLookupSettle)
        .resolve(
          AwaitLookupSettle,
          WatchMessage.CompletedAwaitLookupSettle({ generation: 1, snapshot: idleLookup() }),
        )
        .expect(textbox)
        .toHaveValue(LINK);
    }),
  );
});

describe("the candidate list", () => {
  it.effect("a title lists rows with name, year and mono id", () =>
    Effect.gen(function* () {
      const s = yield* HtmlScene.make(WatchNoDeps, {});
      s.mounted(ReadSearchField, mounted({}))
        .expectMount(TrackHash({}))
        .resolve(HtmlCommand.Focus, { found: true })
        .type(textbox, "The Matrix")
        .click(watchNow)
        .expectExact(AdvanceLookup)
        .resolve(
          AdvanceLookup,
          WatchMessage.CompletedAdvanceLookup({
            generation: 1,
            snapshot: snapshot({
              candidates: [
                {
                  imdbId: "tt0133093",
                  name: "The Matrix",
                  year: "1999",
                  kind: "movie",
                  poster: "https://images.metahub.space/poster/small/tt0133093/img",
                },
              ],
              status: { kind: "info", text: "1 match. Choose one." },
            }),
          }),
        )
        .expect(HtmlLocator.role("button", { name: /The Matrix/ }))
        .toExist()
        .expect(HtmlLocator.role("button", { name: /The Matrix/ }))
        .toHaveText(/tt0133093/)
        .expect(HtmlLocator.role("status"))
        .toHaveText("1 match. Choose one.");
    }),
  );

  it.effect("picking a row starts the lookup", () =>
    Effect.gen(function* () {
      const s = yield* HtmlScene.make(WatchNoDeps, {});
      s.mounted(ReadSearchField, mounted({}))
        .expectMount(TrackHash({}))
        .resolve(HtmlCommand.Focus, { found: true })
        .type(textbox, "The Matrix")
        .click(watchNow)
        .resolve(
          AdvanceLookup,
          WatchMessage.CompletedAdvanceLookup({
            generation: 1,
            snapshot: snapshot({
              candidates: [
                { imdbId: "tt0133093", name: "The Matrix", year: "1999", kind: "movie" },
              ],
              status: { kind: "info", text: "1 match. Choose one." },
            }),
          }),
        )
        .click(HtmlLocator.role("button", { name: /The Matrix/ }))
        .expectExact(AdvanceLookup)
        .resolve(
          AdvanceLookup,
          WatchMessage.CompletedAdvanceLookup({ generation: 2, snapshot: idleLookup() }),
        )
        .expectNone();
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
        .expectExact(AdvanceLookup)
        .resolve(AdvanceLookup, WatchMessage.CompletedAdvanceLookup(open))
        .expectExact(WriteHistoryHash)
        .resolve(WriteHistoryHash, Component.noop)
        .childEmit(Dialog, DialogEvents.RequestedClose({ reason: "close-press" }))
        .expectExact(AdvanceLookup)
        .resolve(
          AdvanceLookup,
          WatchMessage.CompletedAdvanceLookup({ generation: 2, snapshot: idleLookup() }),
        )
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
        .expectExact(AdvanceLookup)
        .resolve(AdvanceLookup, WatchMessage.CompletedAdvanceLookup(open))
        .expectExact(WriteHistoryHash)
        .resolve(WriteHistoryHash, Component.noop)
        .mounted(TrackHash, WatchMessage.NavigatedToHash({ hash: "", search: "" }))
        .expectExact(AdvanceLookup)
        .resolve(
          AdvanceLookup,
          WatchMessage.CompletedAdvanceLookup({ generation: 2, snapshot: idleLookup() }),
        )
        .expectExact(ClearHistoryHash, HtmlCommand.Focus)
        .resolve(ClearHistoryHash, Component.noop)
        .resolve(HtmlCommand.Focus, { found: true })
        .expect(textbox)
        .toHaveValue("tt0133093");
    }),
  );
});

describe("the kind and language filters", () => {
  it.effect("a kind change looks up again", () =>
    Effect.gen(function* () {
      const kind = HtmlLocator.role("combobox", { name: COPY.kindLabel });
      const s = yield* HtmlScene.make(WatchNoDeps, {});
      s.mounted(ReadSearchField, mounted({}))
        .expectMount(TrackHash({}))
        .resolve(HtmlCommand.Focus, { found: true })
        .change(kind, "tv")
        .expectExact(AdvanceLookup)
        .resolve(
          AdvanceLookup,
          WatchMessage.CompletedAdvanceLookup({
            generation: 1,
            snapshot: { ...idleLookup(), kind: "tv" as const },
          }),
        )
        .expect(kind)
        .toHaveValue("tv");
    }),
  );

  it.effect("a language change looks up again", () =>
    Effect.gen(function* () {
      const language = HtmlLocator.role("combobox", { name: COPY.languageLabel });
      const s = yield* HtmlScene.make(WatchNoDeps, {});
      s.mounted(ReadSearchField, mounted({}))
        .expectMount(TrackHash({}))
        .resolve(HtmlCommand.Focus, { found: true })
        .change(language, "de")
        .expectExact(AdvanceLookup)
        .resolve(
          AdvanceLookup,
          WatchMessage.CompletedAdvanceLookup({
            generation: 1,
            snapshot: { ...idleLookup(), language: "de" },
          }),
        )
        .expect(language)
        .toHaveValue("de");
    }),
  );
});

describe("a poster", () => {
  const poster = "https://images.metahub.space/poster/small/tt0133093/img";

  it.effect("shows the image", () =>
    Effect.gen(function* () {
      const s = yield* HtmlScene.make(Poster, { poster });
      s.expect(Locator.tag("img")).toHaveAttribute("src", poster);
    }),
  );

  it.effect("a load failure swaps to the placeholder", () =>
    Effect.gen(function* () {
      const s = yield* HtmlScene.make(Poster, { poster });
      s.fire(Locator.tag("img"), "error").expect(Locator.tag("img")).toBeAbsent();
    }),
  );

  it.effect("sends FailedLoad through update", () =>
    Effect.gen(function* () {
      const story = yield* Story.make(Poster, { poster });
      story.send(PosterMessage.FailedLoad()).expectNone();
      assert.strictEqual(story.model.failed, true);
    }),
  );
});
