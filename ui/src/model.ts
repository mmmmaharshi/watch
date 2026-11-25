import { Schema } from "effect";
import { Dialog } from "@foldkit/ui";
import { idleLookup, LookupState } from "./lookup";

export const Model = Schema.Struct({
  query: Schema.String,
  lookup: LookupState,
  dialog: Dialog.Model,
  // Bumped for every machine event. A reply from an older generation is a
  // stale answer and is dropped.
  generation: Schema.Number,
  // The generation whose snapshot the page has applied.
  applied: Schema.Number,
  // False on a touch device: the on-screen keyboard must not open on its own.
  canAutoFocus: Schema.Boolean,
  // Posters that failed to load are hidden by id, not by touching the DOM.
  hiddenPosters: Schema.Array(Schema.String),
  notice: Schema.NullOr(Schema.String),
});
export type Model = typeof Model.Type;

export const init = (): Model => ({
  query: "",
  lookup: idleLookup(),
  dialog: Dialog.init({ id: "result", focusSelector: "#watch-result" }),
  generation: 0,
  applied: 0,
  canAutoFocus: false,
  hiddenPosters: [],
  notice: null,
});
