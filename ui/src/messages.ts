import { Schema } from "effect";
import { Dialog } from "@foldkit/ui";
import { defineMessageUnion } from "foldkit/message";
import { Candidate, Kind, LookupState } from "./lookup";

// Fact-named messages. Anything the lookup lifecycle owns is sent to the
// machine; these messages only describe what the person did or what came back.
export const Message = defineMessageUnion({
  MountedSearch: {
    fieldText: Schema.String,
    hash: Schema.String,
    search: Schema.String,
    isTouch: Schema.Boolean,
  },
  ChangedQuery: { value: Schema.String },
  ChangedKind: { kind: Kind },
  ChangedLanguage: { language: Schema.String },
  SubmittedSearch: {},
  PickedCandidate: { candidate: Candidate },
  FailedPoster: { imdbId: Schema.String },
  ClickedRetry: {},
  NavigatedToHash: { hash: Schema.String, search: Schema.String },
  GotDialogMessage: { message: Dialog.Message },
  GotLookupState: { generation: Schema.Number, snapshot: LookupState },
  ClickedCopy: {},
  CopiedLink: {},
  CopyFailed: { message: Schema.String },
  ClickedWatch: {},
  OpenedStream: {},
  CompletedFocusSearch: {},
  CompletedWriteHash: {},
  CompletedClearHash: {},
  DismissedNotice: {},
});
export type Message = typeof Message.Type;
