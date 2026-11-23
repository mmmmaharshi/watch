import { Option } from "effect";
import { Update } from "foldkit";
import { Dialog } from "@foldkit/ui";
import { modifyFields } from "foldkit/struct";
import { fullLinkForId, parseSharedId } from "../../src/lib/parse-input";
import {
  AdvanceLookup,
  AwaitLookupSettle,
  CopyShareLink,
  DismissNotice,
  FocusSearchField,
  OpenStream,
  WriteHistoryHash,
} from "./commands";
import type { LookupEvent, LookupState, Result } from "./lookup";
import { Message } from "./messages";
import type { Model } from "./model";
import { COPY } from "./copy";
import type { LookupEngine } from "./commands";

type Commands = NonNullable<Update.Return<Model, Message, LookupEngine>["commands"]>;

const readDialog = (model: Model) => Option.some(model.dialog);
const writeDialog = (model: Model, dialog: Dialog.Model): Model =>
  modifyFields(model, { dialog: () => dialog });
const toGotDialogMessage = (message: Dialog.Message): Message =>
  Message.GotDialogMessage({ message });

const send = (model: Model, event: LookupEvent): Update.Return<Model, Message, LookupEngine> => {
  const generation = model.generation + 1;
  return {
    model: modifyFields(model, { generation: () => generation }),
    commands: [AdvanceLookup({ generation, event })],
  };
};

const closeLookup = (model: Model): Update.Return<Model, Message, LookupEngine> =>
  send(model, { type: "close" });

// Closing the dialog for any reason tells the machine the dialog is gone.
// Focus return waits for CompletedCloseDialog, so it cannot race the close.
const foldDialogOutMessage = Dialog.OutMessage.match<Update.Step<Model, Message, LookupEngine>>({
  Opened: () => (model) => ({ model }),
  Closed: () => closeLookup,
});

const foldDialog = Update.foldChild({
  update: Dialog.update,
  read: readDialog,
  write: writeDialog,
  toParentMessage: toGotDialogMessage,
  foldOutMessage: foldDialogOutMessage,
});

const openDialog = Update.foldChildStep({
  update: Dialog.open,
  read: readDialog,
  write: writeDialog,
  toParentMessage: toGotDialogMessage,
  foldOutMessage: foldDialogOutMessage,
});

const closeDialog = Update.foldChildStep({
  update: Dialog.close,
  read: readDialog,
  write: writeDialog,
  toParentMessage: toGotDialogMessage,
  foldOutMessage: foldDialogOutMessage,
});

const mergeCommands = (
  step: Update.Return<Model, Message, LookupEngine>,
  commands: ReadonlyArray<Commands[number]>,
): Update.Return<Model, Message, LookupEngine> => ({
  model: step.model,
  commands: [...(step.commands ?? []), ...commands],
});

const isBusy = (lookup: LookupState): boolean => lookup.phase !== "idle";

const appliedLookup = (model: Model, lookup: LookupState): Model =>
  modifyFields(model, { lookup: () => lookup });

// A successful lookup is the only thing that opens the dialog. The same
// snapshot also writes the shareable hash, once, from the update.
const applySnapshot = (
  model: Model,
  generation: number,
  lookup: LookupState,
): Update.Return<Model, Message, LookupEngine> => {
  if (generation < model.generation) {
    return { model };
  }

  const previous = model.lookup.openId;
  let next = appliedLookup(model, lookup);
  const extra: Array<Commands[number]> = [];

  if (lookup.phase !== "idle") {
    extra.push(AwaitLookupSettle({ generation }));
  }

  if (previous === null && lookup.openId !== null) {
    const opened = openDialog(next);
    next = opened.model;
    extra.push(...(opened.commands ?? []), WriteHistoryHash({ id: lookup.openId }));
  } else if (previous !== null && lookup.openId === null) {
    const closed = closeDialog(next);
    next = closed.model;
    extra.push(...(closed.commands ?? []));
  }

  // An empty submit is a field error, and the field takes the cursor back.
  if (lookup.status.kind === "field") {
    extra.push(FocusSearchField());
  }

  return { model: next, commands: extra };
};

const pickedResult = (model: Model): Result | null => model.lookup.result;

export const update = (
  model: Model,
  message: Message,
): Update.Return<Model, Message, LookupEngine> =>
  Message.match<Update.Return<Model, Message, LookupEngine>>(message, {
    MountedSearch: ({ fieldText, hash, search, isTouch }) => {
      const base = modifyFields(model, { canAutoFocus: () => !isTouch });
      if (fieldText !== "") {
        // A paste that landed before hydration wins over everything: never
        // wipe what the person already typed.
        return { model: modifyFields(base, { query: () => fieldText }) };
      }
      const sharedId = parseSharedId(search, hash);
      if (sharedId !== null) {
        const link = fullLinkForId(sharedId, base.lookup.kind) ?? sharedId;
        const prefilled = modifyFields(base, { query: () => link });
        return send(prefilled, { type: "hashNav", id: sharedId });
      }
      return {
        model: modifyFields(base, { query: () => "" }),
        commands: base.canAutoFocus ? [FocusSearchField()] : [],
      };
    },

    ChangedQuery: ({ value }) => ({
      model: modifyFields(model, {
        query: () => value,
        lookup: () => ({ ...model.lookup, candidates: [], status: { kind: "idle" } }),
      }),
    }),

    ChangedKind: ({ kind }) =>
      send(
        modifyFields(model, {
          lookup: () => ({ ...model.lookup, kind, candidates: [] }),
        }),
        { type: "kindChange", kind },
      ),

    SubmittedSearch: () => send(model, { type: "submit", input: model.query }),

    PickedCandidate: ({ candidate }) => send(model, { type: "pick", candidate }),

    FailedPoster: ({ imdbId }) => ({
      model: modifyFields(model, {
        hiddenPosters: () => [...model.hiddenPosters, imdbId],
      }),
    }),

    ClickedRetry: () => send(model, { type: "retry" }),

    NavigatedToHash: ({ hash, search }) => {
      const id = parseSharedId(search, hash);
      if (id === null || id === model.lookup.openId) {
        return { model };
      }
      const link = fullLinkForId(id, model.lookup.kind) ?? id;
      if (model.query === link) {
        return { model };
      }
      return send(
        modifyFields(model, {
          query: () => link,
          lookup: () => ({ ...model.lookup, candidates: [] }),
        }),
        { type: "hashNav", id },
      );
    },

    GotDialogMessage: ({ message: child }) => {
      if (child._tag === "RequestedClose" && isBusy(model.lookup)) {
        return { model };
      }
      const step = foldDialog(model, child);
      // The native close finished, so focus return can no longer be undone by
      // the dialog restoring focus to its opener.
      return child._tag === "CompletedCloseDialog" && model.canAutoFocus
        ? mergeCommands(step, [FocusSearchField()])
        : step;
    },

    GotLookupState: ({ generation, snapshot }) => applySnapshot(model, generation, snapshot),

    ClickedCopy: () => {
      const result = pickedResult(model);
      return result === null ? { model } : { model, commands: [CopyShareLink({ id: result.id })] };
    },

    CopiedLink: () => ({
      model: modifyFields(model, { notice: () => COPY.copied }),
      commands: [DismissNotice()],
    }),

    CopyFailed: ({ message: text }) => ({
      model: modifyFields(model, {
        lookup: () => ({ ...model.lookup, status: { kind: "error", text } }),
      }),
    }),

    ClickedWatch: () => {
      const result = pickedResult(model);
      if (result === null) {
        return { model };
      }
      const closed = closeDialog(model);
      return mergeCommands(
        { model: modifyFields(closed.model, { notice: () => null }), commands: closed.commands },
        [OpenStream({ url: result.url })],
      );
    },

    DismissedNotice: () => ({ model: modifyFields(model, { notice: () => null }) }),
    OpenedStream: () => ({ model }),
    CompletedFocusSearch: () => ({ model }),
    CompletedWriteHash: () => ({ model }),
  });
