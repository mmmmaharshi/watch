import { describe, expect, test } from "bun:test";
import { Command as StoryCommand, given, message, model, story } from "foldkit/story";
import { Dialog } from "@foldkit/ui";
import {
  AdvanceLookup,
  AwaitLookupSettle,
  FocusSearchField,
  WriteHistoryHash,
} from "../src/commands";
import { idleLookup } from "../src/lookup";
import type { LookupState, Result } from "../src/lookup";
import { Message } from "../src/messages";
import { init } from "../src/model";
import type { Model } from "../src/model";
import { update } from "../src/update";

const MATRIX: Result = {
  id: "tt0133093",
  name: "The Matrix",
  url: "https://vidsrc.in/embed/movie/tt0133093",
  provider: "vidsrc.in",
  type: "movie",
  year: "1999",
};

const LINK = "https://www.imdb.com/title/tt0133093/";

const snapshot = (patch: Partial<LookupState>): LookupState => ({
  ...idleLookup(),
  ...patch,
});

const fieldError = snapshot({
  status: { kind: "field", text: "Enter an IMDb or TMDB ID, link, or title." },
});

const opened = snapshot({
  result: MATRIX,
  openId: MATRIX.id,
});

const withDialogOpen = (base: Model): Model => ({
  ...base,
  dialog: Dialog.open(Dialog.init({ id: "result", focusSelector: "#watch-result" })).model,
});

describe("A1 — an empty submit asks for a title", () => {
  test("the field error comes back with the cursor in the field", () => {
    story(
      update,
      given(init()),
      message(Message.SubmittedSearch()),
      StoryCommand.expectHas(AdvanceLookup),
      StoryCommand.resolve(
        AdvanceLookup,
        Message.GotLookupState({ generation: 1, snapshot: fieldError }),
      ),
      StoryCommand.expectHas(FocusSearchField),
      StoryCommand.resolve(FocusSearchField, Message.CompletedFocusSearch()),
      model((actual: Model) => {
        expect(actual.lookup.status).toEqual(fieldError.status);
        expect(actual.lookup.openId).toBeNull();
        expect(actual.dialog.isOpen).toBe(false);
      }),
    );
  });
});

describe("A6 — a shared link prefills the field", () => {
  test("a hash on mount prefills the full link and opens nothing", () => {
    story(
      update,
      given(init()),
      message(
        Message.MountedSearch({
          fieldText: "",
          hash: "#id=tt0133093",
          search: "",
          isTouch: false,
        }),
      ),
      StoryCommand.expectHas(AdvanceLookup),
      StoryCommand.resolve(
        AdvanceLookup,
        Message.GotLookupState({ generation: 1, snapshot: idleLookup() }),
      ),
      model((actual: Model) => {
        expect(actual.query).toBe(LINK);
        expect(actual.lookup.openId).toBeNull();
        expect(actual.dialog.isOpen).toBe(false);
      }),
    );
  });
});

describe("A9 — a phone does not open the keyboard", () => {
  test("a touch mount does not ask for focus", () => {
    story(
      update,
      given(init()),
      message(Message.MountedSearch({ fieldText: "", hash: "", search: "", isTouch: true })),
      StoryCommand.expectNone(),
      model((actual: Model) => {
        expect(actual.canAutoFocus).toBe(false);
      }),
    );
  });

  test("a desktop mount asks for focus", () => {
    story(
      update,
      given(init()),
      message(Message.MountedSearch({ fieldText: "", hash: "", search: "", isTouch: false })),
      StoryCommand.expectHas(FocusSearchField),
      StoryCommand.resolve(FocusSearchField, Message.CompletedFocusSearch()),
      model((actual: Model) => {
        expect(actual.canAutoFocus).toBe(true);
      }),
    );
  });
});

describe("A10 — a paste before load finishes survives it", () => {
  test("the text already in the field is adopted, not wiped", () => {
    story(
      update,
      given(init()),
      message(
        Message.MountedSearch({
          fieldText: LINK,
          hash: "#id=tt0133093",
          search: "",
          isTouch: false,
        }),
      ),
      StoryCommand.expectNone(),
      model((actual: Model) => {
        expect(actual.query).toBe(LINK);
      }),
    );
  });
});

describe("a successful lookup", () => {
  test("opens the dialog and writes the shareable hash", () => {
    story(
      update,
      given(init()),
      message(Message.SubmittedSearch()),
      StoryCommand.resolve(
        AdvanceLookup,
        Message.GotLookupState({ generation: 1, snapshot: opened }),
      ),
      StoryCommand.expectHas(Dialog.ShowDialog),
      StoryCommand.expectHas(WriteHistoryHash),
      StoryCommand.resolve(WriteHistoryHash, Message.CompletedWriteHash()),
      StoryCommand.resolve(Dialog.ShowDialog, Dialog.Message.SucceededShowDialog()),
      model((actual: Model) => {
        expect(actual.lookup.openId).toBe(MATRIX.id);
        expect(actual.lookup.result).toEqual(MATRIX);
        expect(actual.dialog.isOpen).toBe(true);
        expect(actual.query).toBe("");
      }),
    );
  });

  test("a stale reply is dropped by generation", () => {
    const stale = snapshot({ result: MATRIX, openId: MATRIX.id });
    const current = idleLookup();
    story(
      update,
      given(init()),
      message(Message.SubmittedSearch()),
      StoryCommand.resolve(
        AdvanceLookup,
        Message.GotLookupState({ generation: 1, snapshot: current }),
      ),
      message(Message.SubmittedSearch()),
      StoryCommand.resolve(
        AdvanceLookup,
        Message.GotLookupState({ generation: 2, snapshot: current }),
      ),
      // A late reply from the first attempt must not touch the page.
      message(Message.GotLookupState({ generation: 1, snapshot: stale })),
      model((actual: Model) => {
        expect(actual.lookup.result).toBeNull();
        expect(actual.lookup.openId).toBeNull();
      }),
    );
  });

  test("a busy snapshot asks for the settled one", () => {
    story(
      update,
      given(init()),
      message(Message.SubmittedSearch()),
      StoryCommand.resolve(
        AdvanceLookup,
        Message.GotLookupState({
          generation: 1,
          snapshot: snapshot({
            phase: "looking",
            status: { kind: "loading", text: "Finding a working stream..." },
          }),
        }),
      ),
      StoryCommand.expectHas(AwaitLookupSettle),
      StoryCommand.resolve(
        AwaitLookupSettle,
        Message.GotLookupState({ generation: 1, snapshot: opened }),
      ),
      StoryCommand.resolve(WriteHistoryHash, Message.CompletedWriteHash()),
      StoryCommand.resolve(Dialog.ShowDialog, Dialog.Message.SucceededShowDialog()),
      model((actual: Model) => {
        expect(actual.lookup.openId).toBe(MATRIX.id);
        expect(actual.dialog.isOpen).toBe(true);
      }),
    );
  });
});

describe("typing", () => {
  const candidate = {
    imdbId: "tt0133093",
    name: "The Matrix",
    year: "1999",
    kind: "movie" as const,
  };

  test("clears the match list and the status line", () => {
    const listed: Model = {
      ...init(),
      lookup: snapshot({
        candidates: [candidate],
        status: { kind: "info", text: "1 match. Choose one." },
      }),
    };
    story(
      update,
      given(listed),
      message(Message.ChangedQuery({ value: "ma" })),
      model((actual: Model) => {
        expect(actual.query).toBe("ma");
        expect(actual.lookup.candidates).toEqual([]);
        expect(actual.lookup.status).toEqual({ kind: "idle" });
      }),
    );
  });

  test("a poster that fails to load is hidden by id", () => {
    const listed: Model = {
      ...init(),
      lookup: snapshot({ candidates: [candidate] }),
    };
    story(
      update,
      given(listed),
      message(Message.FailedPoster({ imdbId: "tt0133093" })),
      model((actual: Model) => {
        expect(actual.hiddenPosters).toEqual(["tt0133093"]);
      }),
    );
  });
});

describe("Escape and the dialog", () => {
  test("Escape closes the dialog when the page is idle", () => {
    story(
      update,
      given({ ...withDialogOpen(init()), canAutoFocus: true }),
      message(Message.GotDialogMessage({ message: Dialog.Message.RequestedClose() })),
      StoryCommand.resolve(Dialog.CloseDialog, Dialog.Message.CompletedCloseDialog()),
      StoryCommand.expectHas(FocusSearchField),
      StoryCommand.resolve(FocusSearchField, Message.CompletedFocusSearch()),
      StoryCommand.resolve(
        AdvanceLookup,
        Message.GotLookupState({ generation: 1, snapshot: idleLookup() }),
      ),
      model((actual: Model) => {
        expect(actual.dialog.isOpen).toBe(false);
      }),
    );
  });

  test("Escape is ignored while the next stream loads", () => {
    const retrying: Model = {
      ...withDialogOpen(init()),
      lookup: snapshot({
        phase: "retrying",
        result: MATRIX,
        openId: MATRIX.id,
      }),
    };
    story(
      update,
      given(retrying),
      message(Message.GotDialogMessage({ message: Dialog.Message.RequestedClose() })),
      model((actual: Model) => {
        expect(actual.dialog.isOpen).toBe(true);
        expect(actual.lookup.openId).toBe(MATRIX.id);
      }),
    );
  });
});
