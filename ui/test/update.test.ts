import { describe, expect, test } from "bun:test";
import { Command as StoryCommand, given, message, model, story } from "foldkit/story";
import { Dialog } from "@foldkit/ui";
import {
  AdvanceLookup,
  AwaitLookupSettle,
  ClearHistoryHash,
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

const opened = snapshot({
  result: MATRIX,
  openId: MATRIX.id,
});

const withDialogOpen = (base: Model): Model => ({
  ...base,
  dialog: Dialog.open(Dialog.init({ id: "result", focusSelector: "#watch-result" })).model,
});

describe("A9 — a phone does not open the keyboard", () => {
  test("a desktop mount asks for focus", () => {
    story(
      update,
      given(init()),
      message(Message.MountedSearch({ fieldText: "", hash: "", search: "", isTouch: false })),
      StoryCommand.expectHas(FocusSearchField),
      StoryCommand.resolve(FocusSearchField, Message.CompletedFocusSearch()),
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

  test("removing the hash closes an open dialog", () => {
    story(
      update,
      given({ ...withDialogOpen(init()), lookup: opened }),
      message(Message.NavigatedToHash({ hash: "", search: "" })),
      StoryCommand.expectHas(AdvanceLookup),
      StoryCommand.resolve(
        AdvanceLookup,
        Message.GotLookupState({ generation: 1, snapshot: idleLookup() }),
      ),
      StoryCommand.resolve(Dialog.CloseDialog, Dialog.Message.CompletedCloseDialog()),
      StoryCommand.resolve(
        AdvanceLookup,
        Message.GotLookupState({ generation: 2, snapshot: idleLookup() }),
      ),
      StoryCommand.resolve(ClearHistoryHash, Message.CompletedClearHash()),
      model((actual: Model) => {
        expect(actual.dialog.isOpen).toBe(false);
        expect(actual.lookup.openId).toBeNull();
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

describe("double press", () => {
  test("a submit is ignored while a snapshot is pending", () => {
    const pending: Model = { ...init(), generation: 1, applied: 0 };
    const result = update(pending, Message.SubmittedSearch());

    expect(result.commands ?? []).toEqual([]);
    expect(result.model.generation).toBe(1);
  });

  test("a submit is ignored while a lookup is running", () => {
    const searching: Model = {
      ...init(),
      lookup: snapshot({ phase: "searching" }),
    };
    const result = update(searching, Message.SubmittedSearch());

    expect(result.commands ?? []).toEqual([]);
    expect(result.model.lookup.phase).toBe("searching");
  });

  test("a retry is ignored while a snapshot is pending", () => {
    const pending: Model = {
      ...withDialogOpen(init()),
      lookup: opened,
      generation: 1,
      applied: 0,
    };
    const result = update(pending, Message.ClickedRetry());

    expect(result.commands ?? []).toEqual([]);
    expect(result.model.generation).toBe(1);
  });
});

describe("history", () => {
  test("a forward to the open result keeps the field and list", () => {
    const model: Model = {
      ...withDialogOpen(init()),
      query: "The Matrix",
      lookup: snapshot({
        candidates: [
          { imdbId: MATRIX.id, name: MATRIX.name, year: "1999", kind: "movie" as const },
        ],
        result: MATRIX,
        openId: null,
      }),
    };
    const result = update(model, Message.NavigatedToHash({ hash: `#id=${MATRIX.id}`, search: "" }));

    expect(result.model.query).toBe("The Matrix");
    expect(result.model.lookup.candidates).toHaveLength(1);
    expect(result.commands ?? []).toHaveLength(1);
  });
});
