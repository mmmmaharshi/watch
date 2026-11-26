import { Schema } from "effect";
import { LookupState, idleLookup } from "./lookup";

export const WatchProps = Schema.Struct({});
export type WatchProps = typeof WatchProps.Type;

export const WatchModel = Schema.Struct({
  query: Schema.String,
  lookup: LookupState,
  // Bumped for every machine event. A reply from an older generation is a
  // stale answer and is dropped.
  generation: Schema.Number,
  // The generation whose snapshot the page has applied.
  applied: Schema.Number,
  // False on a touch device: the on-screen keyboard must not open on its own.
  canAutoFocus: Schema.Boolean,
  notice: Schema.NullOr(Schema.String),
});
export type WatchModel = typeof WatchModel.Type;

export const initModel = (): WatchModel => ({
  query: "",
  lookup: idleLookup(),
  generation: 0,
  applied: 0,
  canAutoFocus: false,
  notice: null,
});
