import { Context, Effect, Layer, Schema } from "effect";
import type { SnapshotFrom } from "xstate";
import { Command } from "foldkit";
import { createEffectActor, sendAndAwait, waitFor } from "@xstate/effect";
import { createLookupMachine } from "../../backend/src/lookup-machine";
import type { LookupDeps } from "../../backend/src/lookup-machine";
import { hashForId, shareUrl } from "../../src/lib/parse-input";
import { LookupEvent, Phase } from "./lookup";
import type { LookupState } from "./lookup";
import { COPY } from "./copy";
import { Message } from "./messages";
import { SEARCH_FIELD_ID } from "./view";

type Machine = ReturnType<typeof createLookupMachine>;
type Snapshot = SnapshotFrom<Machine>;

// The machine's snapshot is the only lookup state. Plain data goes in the
// Model; the machine stays the owner of the moves.
const toLookupState = (snapshot: Snapshot): LookupState => ({
  phase: Schema.is(Phase)(snapshot.value) ? snapshot.value : "idle",
  kind: snapshot.context.kind,
  language: snapshot.context.language,
  candidates: snapshot.context.candidates,
  result: snapshot.context.result,
  status: snapshot.context.status,
  openId: snapshot.context.openId,
});

export interface LookupEngineShape {
  /** Sends one machine event and returns the snapshot its transition left. */
  readonly advance: (event: LookupEvent) => Effect.Effect<LookupState>;
  /** Waits for the running work to settle, then returns the snapshot. */
  readonly settle: () => Effect.Effect<LookupState>;
}

export class LookupEngine extends Context.Service<LookupEngine, LookupEngineShape>()(
  "watch/ui/LookupEngine",
) {}

export const lookupEngineLayer = (deps: LookupDeps) =>
  Layer.effect(
    LookupEngine,
    Effect.gen(function* () {
      const actor = yield* createEffectActor(createLookupMachine(deps));
      const current = () => toLookupState(actor.getSnapshot());

      return LookupEngine.of({
        advance: (event) =>
          sendAndAwait(actor, event).pipe(
            Effect.map((snapshot) => toLookupState(snapshot)),
            Effect.orElseSucceed(current),
          ),
        // A stopped actor or a timeout must not leave the page busy forever.
        settle: () =>
          waitFor(actor, (snapshot) => snapshot.matches("idle"), {
            timeout: "60 seconds",
          }).pipe(
            Effect.map((snapshot) => toLookupState(snapshot)),
            Effect.orElseSucceed(current),
          ),
      });
    }),
  );

export const AdvanceLookup = Command.define("AdvanceLookup", {
  args: { generation: Schema.Number, event: LookupEvent },
  messages: [Message.GotLookupState],
  execute: ({ generation, event }) =>
    Effect.gen(function* () {
      const engine = yield* LookupEngine;
      const snapshot = yield* engine.advance(event);
      return Message.GotLookupState({ generation, snapshot });
    }),
});

export const AwaitLookupSettle = Command.define("AwaitLookupSettle", {
  args: { generation: Schema.Number },
  messages: [Message.GotLookupState],
  execute: ({ generation }) =>
    Effect.gen(function* () {
      const engine = yield* LookupEngine;
      const snapshot = yield* engine.settle();
      return Message.GotLookupState({ generation, snapshot });
    }),
});

export const FocusSearchField = Command.define("FocusSearchField", {
  messages: [Message.CompletedFocusSearch],
  execute: Effect.sync(() => {
    document.getElementById(SEARCH_FIELD_ID)?.focus();
    return Message.CompletedFocusSearch();
  }),
});

export const WriteHistoryHash = Command.define("WriteHistoryHash", {
  args: { id: Schema.String },
  messages: [Message.CompletedWriteHash],
  execute: ({ id }) =>
    Effect.sync(() => {
      const hash = hashForId(id);
      if (location.hash !== hash) {
        history.pushState(null, "", hash);
      }
      return Message.CompletedWriteHash();
    }),
});

export const CopyShareLink = Command.define("CopyShareLink", {
  args: { id: Schema.String },
  messages: [Message.CopiedLink, Message.CopyFailed],
  execute: ({ id }) =>
    Effect.tryPromise(() => navigator.clipboard.writeText(shareUrl(location.origin, id))).pipe(
      Effect.as(Message.CopiedLink()),
      Effect.catch((error) =>
        Effect.succeed(
          Message.CopyFailed({
            message: error instanceof Error && error.message ? error.message : COPY.copyFailed,
          }),
        ),
      ),
    ),
});

export const DismissNotice = Command.define("DismissNotice", {
  messages: [Message.DismissedNotice],
  execute: Effect.sleep("4 seconds").pipe(Effect.as(Message.DismissedNotice())),
});

export const OpenStream = Command.define("OpenStream", {
  args: { url: Schema.String },
  messages: [Message.OpenedStream],
  execute: ({ url }) =>
    Effect.sync(() => {
      window.open(url, "_blank", "noopener");
      return Message.OpenedStream();
    }),
});
