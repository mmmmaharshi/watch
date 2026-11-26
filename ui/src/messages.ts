import { UiSchema } from "@effect/ui";
import { Schema } from "effect";
import { Candidate, LookupState } from "./lookup";

// Fact-named messages. Anything the lookup lifecycle owns is sent to the
// machine; these messages only describe what the person did or what came back.
export const WatchMessage = UiSchema.TaggedEnum({
  MountedSearch: {
    fieldText: Schema.String,
    hash: Schema.String,
    search: Schema.String,
    isTouch: Schema.Boolean,
  },
  UpdatedQuery: { value: Schema.String },
  SubmittedSearch: {},
  PickedCandidate: { candidate: Candidate },
  ClickedRetry: {},
  NavigatedToHash: { hash: Schema.String, search: Schema.String },
  CompletedAdvanceLookup: {
    generation: Schema.Number,
    snapshot: LookupState,
  },
  CompletedAwaitLookupSettle: {
    generation: Schema.Number,
    snapshot: LookupState,
  },
  RequestedCloseResult: { reason: Schema.String },
  ClickedCopy: {},
  SucceededCopyShareLink: {},
  FailedCopyShareLink: { message: Schema.String },
  ClickedWatch: {},
  CompletedDismissNotice: {},
});
export type WatchMessage = typeof WatchMessage.Type;
