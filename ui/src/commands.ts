import { Context, Effect, Layer, Schema } from "effect";
import type { SnapshotFrom } from "xstate";
import { Command, Component } from "@effect/ui";
import { createEffectActor, sendAndAwait, waitFor } from "@xstate/effect";
import { hashForId, shareUrl } from "../../src/lib/parse-input";
import { LookupCommand, createLookupMachine } from "./lookup-machine";
import type { LookupDeps } from "./lookup-machine";
import { Phase } from "./lookup";
import type { LookupState } from "./lookup";
import { COPY } from "../../src/lib/copy";
import { WatchMessage } from "./messages";

type Machine = ReturnType<typeof createLookupMachine>;
type Snapshot = SnapshotFrom<Machine>;

// The machine's snapshot is the only lookup state. Plain data goes in the
// Model; the machine stays the owner of the moves.
const toLookupState = (snapshot: Snapshot): LookupState => ({
  phase: Schema.is(Phase)(snapshot.value) ? snapshot.value : "idle",
  ...snapshot.context,
});

export interface LookupEngineShape {
  /** Sends one machine event and returns the snapshot its transition left. */
  readonly advance: (event: LookupCommand) => Effect.Effect<LookupState>;
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

// Sends one machine event, then reports the snapshot the transition left.
export class AdvanceLookup extends Command.Service<AdvanceLookup>()("watch/AdvanceLookup", {
  args: { generation: Schema.Number, event: LookupCommand },
  success: WatchMessage,
}) {
  static readonly layer = this.toLayer(
    Effect.gen(function* () {
      const engine = yield* LookupEngine;
      return ({ generation, event }) =>
        engine
          .advance(event)
          .pipe(
            Effect.map((snapshot) => WatchMessage.CompletedAdvanceLookup({ generation, snapshot })),
          );
    }),
  );
}

// Waits for running work to settle, then reports the snapshot it left.
export class AwaitLookupSettle extends Command.Service<AwaitLookupSettle>()(
  "watch/AwaitLookupSettle",
  {
    args: { generation: Schema.Number },
    success: WatchMessage,
  },
) {
  static readonly layer = this.toLayer(
    Effect.gen(function* () {
      const engine = yield* LookupEngine;
      return ({ generation }) =>
        engine
          .settle()
          .pipe(
            Effect.map((snapshot) =>
              WatchMessage.CompletedAwaitLookupSettle({ generation, snapshot }),
            ),
          );
    }),
  );
}

// Writes the shareable hash for the open result. The update ignores the
// result, so the Command ends silent.
export const WriteHistoryHash = Command.make(
  "watch/WriteHistoryHash",
  { args: { id: Schema.String } },
  ({ id }) =>
    Effect.as(
      Effect.sync(() => {
        const hash = hashForId(id);
        if (location.hash !== hash) {
          history.pushState(null, "", hash);
        }
      }),
      Component.noop,
    ),
);

// Clears the shareable hash when the dialog closes. Silent like the write.
export const ClearHistoryHash = Command.make("watch/ClearHistoryHash", { args: {} }, () =>
  Effect.as(
    Effect.sync(() => {
      if (location.hash !== "") {
        history.replaceState(null, "", location.pathname + location.search);
      }
    }),
    Component.noop,
  ),
);

export const CopyShareLink = Command.make(
  "watch/CopyShareLink",
  { args: { id: Schema.String } },
  ({ id }) =>
    Effect.tryPromise({
      try: () => navigator.clipboard.writeText(shareUrl(location.origin, id)),
      catch: () => COPY.copyFailed,
    }).pipe(
      Effect.as(WatchMessage.SucceededCopyShareLink()),
      Effect.catch(() =>
        Effect.succeed(WatchMessage.FailedCopyShareLink({ message: COPY.copyFailed })),
      ),
    ),
);

export const DismissNotice = Command.make(
  "watch/DismissNotice",
  { args: { noticeId: Schema.Number } },
  ({ noticeId }) =>
    Effect.as(Effect.sleep("4 seconds"), WatchMessage.CompletedDismissNotice({ noticeId })),
);

export const OpenStream = Command.make(
  "watch/OpenStream",
  { args: { url: Schema.String } },
  ({ url }) =>
    Effect.as(
      Effect.sync(() => {
        window.open(url, "_blank", "noopener");
      }),
      Component.noop,
    ),
);
