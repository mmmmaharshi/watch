import { describe, test } from "bun:test";
import { Command, Mount, click, expect, given, role, scene, selector, type } from "foldkit/scene";
import { Dialog } from "@foldkit/ui";
import {
  AdvanceLookup,
  AwaitLookupSettle,
  ClearHistoryHash,
  FocusSearchField,
  WriteHistoryHash,
} from "../src/commands";
import { COPY } from "../src/copy";
import { idleLookup } from "../src/lookup";
import type { LookupState } from "../src/lookup";
import { Message } from "../src/messages";
import { init } from "../src/model";
import { ReadSearchField } from "../src/mounts";
import { update } from "../src/update";
import { view } from "../src/view";

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
  Mount.resolve(
    ReadSearchField,
    Message.MountedSearch({
      fieldText: fields.fieldText ?? "",
      hash: fields.hash ?? "",
      search: fields.search ?? "",
      isTouch: fields.isTouch ?? false,
    }),
  );

const textbox = role("textbox", { name: COPY.fieldLabel });
const watchNow = role("button", { name: COPY.submit });

describe("A1 — an empty submit asks for a title", () => {
  test("the status line asks for a title and the field is marked invalid", () => {
    scene(
      { update, view },
      given(init()),
      mounted({}),
      Command.resolve(FocusSearchField, Message.CompletedFocusSearch()),
      click(watchNow),
      Command.resolve(
        AdvanceLookup,
        Message.GotLookupState({
          generation: 1,
          snapshot: snapshot({ status: { kind: "field", text: EMPTY_MESSAGE } }),
        }),
      ),
      Command.resolve(FocusSearchField, Message.CompletedFocusSearch()),
      expect(role("status")).toHaveText(EMPTY_MESSAGE),
      expect(textbox).toHaveAttr("aria-invalid", "true"),
      expect(textbox).toHaveValue(""),
      expect(role("dialog", { name: "The Matrix" })).toBeAbsent(),
    );
  });
});

describe("A6 — a shared link prefills the field", () => {
  test("the field holds the full link and nothing opens", () => {
    scene(
      { update, view },
      given(init()),
      mounted({ hash: "#id=tt0133093" }),
      Command.resolve(
        AdvanceLookup,
        Message.GotLookupState({ generation: 1, snapshot: idleLookup() }),
      ),
      expect(textbox).toHaveValue(LINK),
      expect(role("dialog", { name: "The Matrix" })).toBeAbsent(),
      Command.expectNone(),
    );
  });
});

describe("A9 — a phone does not open the keyboard", () => {
  test("a touch mount starts with the field unfocused and no focus command", () => {
    scene(
      { update, view },
      given(init()),
      mounted({ isTouch: true }),
      Command.expectNone(),
      expect(textbox).toExist(),
    );
  });
});

describe("A10 — a paste before load finishes survives it", () => {
  test("the field keeps the pasted link and Watch now starts a lookup", () => {
    scene(
      { update, view },
      given(init()),
      mounted({ fieldText: LINK }),
      expect(textbox).toHaveValue(LINK),
      click(watchNow),
      Command.expectHas(AdvanceLookup),
      Command.resolve(
        AdvanceLookup,
        Message.GotLookupState({
          generation: 1,
          snapshot: snapshot({
            phase: "looking",
            status: { kind: "loading", text: "Finding a working stream..." },
          }),
        }),
      ),
      Command.resolve(
        AwaitLookupSettle,
        Message.GotLookupState({ generation: 1, snapshot: idleLookup() }),
      ),
      expect(textbox).toHaveValue(LINK),
    );
  });
});

describe("the candidate list", () => {
  test("a title lists rows with name, year, mono id and a lazy poster", () => {
    const poster = "https://images.metahub.space/poster/small/tt0133093/img";
    scene(
      { update, view },
      given(init()),
      mounted({}),
      Command.resolve(FocusSearchField, Message.CompletedFocusSearch()),
      type(textbox, "The Matrix"),
      click(watchNow),
      Command.resolve(
        AdvanceLookup,
        Message.GotLookupState({
          generation: 1,
          snapshot: snapshot({
            candidates: [
              {
                imdbId: "tt0133093",
                name: "The Matrix",
                year: "1999",
                kind: "movie",
                poster,
              },
            ],
            status: { kind: "info", text: "1 match. Choose one." },
          }),
        }),
      ),
      expect(role("button", { name: /The Matrix/ })).toExist(),
      expect(role("button", { name: /The Matrix/ })).toContainText("tt0133093"),
      expect(role("status")).toHaveText("1 match. Choose one."),
      expect(selector("img")).toHaveAttr("src", poster),
      expect(selector("img")).toHaveAttr("loading", "lazy"),
    );
  });
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

  const open = [
    mounted({}),
    Command.resolve(FocusSearchField, Message.CompletedFocusSearch()),
    type(textbox, "tt0133093"),
    click(watchNow),
    Command.resolve(AdvanceLookup, Message.GotLookupState({ generation: 1, snapshot: opened })),
    Command.resolve(WriteHistoryHash, Message.CompletedWriteHash()),
    Command.resolve(Dialog.ShowDialog, Dialog.Message.SucceededShowDialog()),
    Mount.resolve(Dialog.AcquireResources, Dialog.Message.SucceededAcquireResources()),
  ] as const;

  test("shows the title, meta, identifier, provider and stream link", () => {
    scene(
      { update, view },
      given(init()),
      ...open,
      expect(role("dialog", { name: "The Matrix" })).toExist(),
      expect(role("dialog", { name: "The Matrix" })).toContainText("1999 · IMDb 8.7"),
      expect(role("link", { name: "tt0133093" })).toExist(),
      expect(role("dialog", { name: "The Matrix" })).toContainText("vidsrc.in"),
      expect(role("link", { name: result.url })).toHaveAttr("target", "_blank"),
      expect(role("button", { name: COPY.watch })).toExist(),
      expect(role("button", { name: COPY.retry })).toExist(),
      expect(role("button", { name: COPY.copy })).toExist(),
    );
  });

  test("Cancel closes it and keeps the typed id in the field", () => {
    scene(
      { update, view },
      given(init()),
      ...open,
      click(role("button", { name: COPY.cancel })),
      Command.resolve(Dialog.CloseDialog, Dialog.Message.CompletedCloseDialog()),
      Command.resolve(FocusSearchField, Message.CompletedFocusSearch()),
      Command.resolve(
        AdvanceLookup,
        Message.GotLookupState({ generation: 2, snapshot: idleLookup() }),
      ),
      Command.resolve(ClearHistoryHash, Message.CompletedClearHash()),
      Mount.expectEnded(Dialog.AcquireResources),
      expect(role("dialog", { name: "The Matrix" })).toBeAbsent(),
      expect(textbox).toHaveValue("tt0133093"),
    );
  });
});
