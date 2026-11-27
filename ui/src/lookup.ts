import { Schema } from "effect";
import { Kind, Result } from "../../src/lib/types";
import { Status } from "./lookup-machine";

// The kind and result shapes come from the wire contract, and the status comes
// from the machine, so the UI cannot drift from what it renders.
export { Kind, Result, Status };

export const Phase = Schema.Literals(["idle", "looking", "retrying"]);
export type Phase = typeof Phase.Type;

// The machine's context minus `value`, which the page Model holds as `query`.
export const LookupState = Schema.Struct({
  phase: Phase,
  kind: Kind,
  result: Schema.NullOr(Result),
  status: Status,
  openId: Schema.NullOr(Schema.String),
  linkSubmit: Schema.Boolean,
});
export type LookupState = typeof LookupState.Type;

export const idleLookup = (): LookupState => ({
  phase: "idle",
  kind: "movie",
  result: null,
  status: { kind: "idle" },
  openId: null,
  linkSubmit: false,
});

export const isLooking = (phase: Phase): boolean => phase === "looking";

export const resultTitle = (data: Pick<Result, "id" | "name">): string =>
  data.name || data.id.toUpperCase();

export const resultMeta = (data: Pick<Result, "year" | "rating">): string =>
  [data.year, data.rating ? `IMDb ${data.rating}` : null].filter(Boolean).join(" · ");

export const resultType = (type: Kind): string => (type === "tv" ? "TV Show" : "Movie");
