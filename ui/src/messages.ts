import { UiSchema } from "@effect/ui";
import { Schema } from "effect";
import { LookupState } from "./lookup";

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
  ClickedExample: {},
  SubmittedSearch: {},
  ClickedRetry: {},
  NavigatedToHash: { hash: Schema.String, search: Schema.String },
  CompletedLookup: {
    generation: Schema.Number,
    snapshot: LookupState,
  },
  RequestedCloseResult: {},
  ClickedCopy: {},
  SucceededCopyShareLink: {},
  FailedCopyShareLink: { message: Schema.String },
  ClickedWatch: {},
  CompletedDismissNotice: { noticeId: Schema.Number },
});
export type WatchMessage = typeof WatchMessage.Type;
