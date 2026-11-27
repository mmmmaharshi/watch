import { Component } from "@effect/ui";
import { HtmlCommand } from "@effect/ui/html";
import { Story } from "@effect/ui/testing";
import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import {
  AdvanceLookup,
  AwaitLookupSettle,
  ClearHistoryHash,
  CopyShareLink,
  DismissNotice,
  OpenStream,
  WriteHistoryHash,
} from "../src/commands";
import { COPY } from "../../src/lib/copy";
import { idleLookup } from "../src/lookup";
import type { LookupState, Result } from "../src/lookup";
import { WatchMessage } from "../src/messages";
import { initModel } from "../src/model";
import { WatchNoDeps } from "../src/watch";

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

describe("A9 — a phone does not open the keyboard", () => {
  it.effect("a desktop mount asks for focus", () =>
    Effect.gen(function* () {
      const s = yield* Story.make(WatchNoDeps, {});
      s.send(WatchMessage.MountedSearch({ fieldText: "", hash: "", search: "", isTouch: false }))
        .expectExact(HtmlCommand.Focus)
        .resolve(HtmlCommand.Focus, { found: true });
    }),
  );
});

describe("A10 — a paste before load finishes survives it", () => {
  it.effect("the text already in the field is adopted, not wiped", () =>
    Effect.gen(function* () {
      const s = yield* Story.make(WatchNoDeps, {});
      s.send(
        WatchMessage.MountedSearch({
          fieldText: LINK,
          hash: "#id=tt0133093",
          search: "",
          isTouch: false,
        }),
      ).expectNone();
      assert.strictEqual(s.model.query, LINK);
    }),
  );
});

describe("a successful lookup", () => {
  it.effect("opens the dialog and writes the shareable hash", () =>
    Effect.gen(function* () {
      const s = yield* Story.make(WatchNoDeps, {});
      s.send(WatchMessage.SubmittedSearch())
        .expectExact(AdvanceLookup)
        .resolve(
          AdvanceLookup,
          WatchMessage.CompletedAdvanceLookup({ generation: 1, snapshot: opened }),
        )
        .expectExact(WriteHistoryHash)
        .resolve(WriteHistoryHash, Component.noop);
      assert.strictEqual(s.model.lookup.openId, MATRIX.id);
      assert.deepStrictEqual(s.model.lookup.result, MATRIX);
      assert.strictEqual(s.model.query, "");
    }),
  );

  it.effect("a stale reply is dropped by generation", () =>
    Effect.gen(function* () {
      const stale = snapshot({ result: MATRIX, openId: MATRIX.id });
      const current = idleLookup();
      const s = yield* Story.make(WatchNoDeps, {});
      s.send(WatchMessage.SubmittedSearch()).resolve(
        AdvanceLookup,
        WatchMessage.CompletedAdvanceLookup({ generation: 1, snapshot: current }),
      );
      s.send(WatchMessage.SubmittedSearch()).resolve(
        AdvanceLookup,
        WatchMessage.CompletedAdvanceLookup({ generation: 2, snapshot: current }),
      );
      // A late reply from the first attempt must not touch the page.
      s.send(WatchMessage.CompletedAdvanceLookup({ generation: 1, snapshot: stale })).expectNone();
      assert.strictEqual(s.model.lookup.result, null);
      assert.strictEqual(s.model.lookup.openId, null);
    }),
  );

  it.effect("a busy snapshot asks for the settled one", () =>
    Effect.gen(function* () {
      const s = yield* Story.make(WatchNoDeps, {});
      s.send(WatchMessage.SubmittedSearch())
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
          WatchMessage.CompletedAwaitLookupSettle({ generation: 1, snapshot: opened }),
        )
        .expectExact(WriteHistoryHash)
        .resolve(WriteHistoryHash, Component.noop);
      assert.strictEqual(s.model.lookup.openId, MATRIX.id);
    }),
  );
});

describe("typing", () => {
  it.effect("clears the status line", () =>
    Effect.gen(function* () {
      const failing = {
        ...initModel(),
        lookup: snapshot({
          status: { kind: "error", text: "No other providers available." },
        }),
      };
      const s = yield* Story.make(WatchNoDeps, {});
      s.given(failing)
        .send(WatchMessage.UpdatedQuery({ value: "ma" }))
        .expectNone();
      assert.strictEqual(s.model.query, "ma");
      assert.deepStrictEqual(s.model.lookup.status, { kind: "idle" });
    }),
  );
});

describe("Escape and the dialog", () => {
  it.effect("Escape closes the dialog when the page is idle", () =>
    Effect.gen(function* () {
      const s = yield* Story.make(WatchNoDeps, {});
      s.given({ ...initModel(), lookup: opened, canAutoFocus: true })
        .send(WatchMessage.RequestedCloseResult())
        .expectExact(AdvanceLookup)
        .resolve(
          AdvanceLookup,
          WatchMessage.CompletedAdvanceLookup({ generation: 1, snapshot: idleLookup() }),
        )
        .expectExact(ClearHistoryHash, HtmlCommand.Focus)
        .resolve(ClearHistoryHash, Component.noop)
        .resolve(HtmlCommand.Focus, { found: true });
      assert.strictEqual(s.model.lookup.openId, null);
    }),
  );

  it.effect("removing the hash closes an open dialog", () =>
    Effect.gen(function* () {
      const s = yield* Story.make(WatchNoDeps, {});
      s.given({ ...initModel(), lookup: opened })
        .send(WatchMessage.NavigatedToHash({ hash: "", search: "" }))
        .expectExact(AdvanceLookup)
        .resolve(
          AdvanceLookup,
          WatchMessage.CompletedAdvanceLookup({ generation: 1, snapshot: idleLookup() }),
        )
        .expectExact(ClearHistoryHash)
        .resolve(ClearHistoryHash, Component.noop);
      assert.strictEqual(s.model.lookup.openId, null);
    }),
  );

  it.effect("Escape is ignored while the next stream loads", () =>
    Effect.gen(function* () {
      const retrying = snapshot({ phase: "retrying", result: MATRIX, openId: MATRIX.id });
      const s = yield* Story.make(WatchNoDeps, {});
      s.given({ ...initModel(), lookup: retrying })
        .send(WatchMessage.RequestedCloseResult())
        .expectNone();
      assert.strictEqual(s.model.lookup.openId, MATRIX.id);
    }),
  );
});

describe("copying the share link", () => {
  it.effect("shows the notice and dismisses it", () =>
    Effect.gen(function* () {
      const s = yield* Story.make(WatchNoDeps, {});
      s.given({ ...initModel(), lookup: opened })
        .send(WatchMessage.ClickedCopy())
        .expectExact(CopyShareLink)
        .resolve(CopyShareLink, WatchMessage.SucceededCopyShareLink())
        .expectExact(DismissNotice)
        .resolve(DismissNotice, WatchMessage.CompletedDismissNotice({ noticeId: 1 }))
        .expectNone();
      assert.strictEqual(s.model.notice, null);
    }),
  );

  it.effect("a stale dismissal leaves a newer notice alone", () =>
    Effect.gen(function* () {
      const s = yield* Story.make(WatchNoDeps, {});
      s.given({ ...initModel(), notice: COPY.copied, noticeId: 2 })
        .send(WatchMessage.CompletedDismissNotice({ noticeId: 1 }))
        .expectNone();
      assert.strictEqual(s.model.notice, COPY.copied);
    }),
  );

  it.effect("a clipboard failure reads as a page error", () =>
    Effect.gen(function* () {
      const s = yield* Story.make(WatchNoDeps, {});
      s.given({ ...initModel(), lookup: opened })
        .send(WatchMessage.ClickedCopy())
        .resolve(CopyShareLink, WatchMessage.FailedCopyShareLink({ message: "Denied" }))
        .expectNone();
      assert.deepStrictEqual(s.model.lookup.status, { kind: "error", text: "Denied" });
    }),
  );
});

describe("watching the stream", () => {
  it.effect("closes the dialog and opens the stream link", () =>
    Effect.gen(function* () {
      const s = yield* Story.make(WatchNoDeps, {});
      s.given({ ...initModel(), lookup: opened })
        .send(WatchMessage.ClickedWatch())
        .expectExact(AdvanceLookup, OpenStream)
        .resolve(
          AdvanceLookup,
          WatchMessage.CompletedAdvanceLookup({ generation: 1, snapshot: idleLookup() }),
        )
        .expectExact(OpenStream, ClearHistoryHash)
        .resolve(OpenStream, Component.noop)
        .resolve(ClearHistoryHash, Component.noop)
        .expectNone();
      assert.strictEqual(s.model.lookup.openId, null);
      assert.strictEqual(s.model.notice, null);
    }),
  );
});

describe("double press", () => {
  it.effect("a submit is ignored while a snapshot is pending", () =>
    Effect.gen(function* () {
      const s = yield* Story.make(WatchNoDeps, {});
      s.given({ ...initModel(), generation: 1, applied: 0 })
        .send(WatchMessage.SubmittedSearch())
        .expectNone();
      assert.strictEqual(s.model.generation, 1);
    }),
  );

  it.effect("a submit is ignored while a lookup is running", () =>
    Effect.gen(function* () {
      const looking = { ...initModel(), lookup: snapshot({ phase: "looking" }) };
      const s = yield* Story.make(WatchNoDeps, {});
      s.given(looking).send(WatchMessage.SubmittedSearch()).expectNone();
      assert.strictEqual(s.model.lookup.phase, "looking");
    }),
  );

  it.effect("a retry is ignored while a snapshot is pending", () =>
    Effect.gen(function* () {
      const pending = { ...initModel(), lookup: opened, generation: 1, applied: 0 };
      const s = yield* Story.make(WatchNoDeps, {});
      s.given(pending).send(WatchMessage.ClickedRetry()).expectNone();
      assert.strictEqual(s.model.generation, 1);
    }),
  );
});

describe("history", () => {
  it.effect("a forward to the open result keeps the field", () =>
    Effect.gen(function* () {
      const model = {
        ...initModel(),
        query: "The Matrix",
        lookup: snapshot({
          result: MATRIX,
          openId: null,
        }),
      };
      const s = yield* Story.make(WatchNoDeps, {});
      s.given(model)
        .send(WatchMessage.NavigatedToHash({ hash: `#id=${MATRIX.id}`, search: "" }))
        .expectExact(AdvanceLookup)
        .resolve(
          AdvanceLookup,
          WatchMessage.CompletedAdvanceLookup({ generation: 1, snapshot: model.lookup }),
        )
        .expectNone();
      assert.strictEqual(s.model.query, "The Matrix");
    }),
  );
});
