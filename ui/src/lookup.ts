import { Schema } from "effect";
import { Status } from "../../backend/src/lookup-machine";
import { Candidate, Kind, Result } from "../../src/lib/types";

// The candidate, kind, and result shapes come from the wire contract, and the
// status comes from the machine, so the UI cannot drift from what it renders.
export { Candidate, Kind, Result, Status };

export const Phase = Schema.Literals(["idle", "searching", "looking", "retrying"]);
export type Phase = typeof Phase.Type;

// The machine's context minus `value`, which the Foldkit Model holds as `query`.
export const LookupState = Schema.Struct({
  phase: Phase,
  kind: Kind,
  language: Schema.String,
  candidates: Schema.Array(Candidate),
  result: Schema.NullOr(Result),
  status: Status,
  openId: Schema.NullOr(Schema.String),
});
export type LookupState = typeof LookupState.Type;

export const idleLookup = (): LookupState => ({
  phase: "idle",
  kind: "movie",
  language: "",
  candidates: [],
  result: null,
  status: { kind: "idle" },
  openId: null,
});

// The machine events the UI sends. Everything that moves the lifecycle goes
// through the machine, so its context stays the one authority.
export const LookupEvent = Schema.Union([
  Schema.Struct({ type: Schema.Literal("submit"), input: Schema.String }),
  Schema.Struct({ type: Schema.Literal("pick"), candidate: Candidate }),
  Schema.Struct({ type: Schema.Literal("retry") }),
  Schema.Struct({ type: Schema.Literal("close") }),
  Schema.Struct({ type: Schema.Literal("hashNav"), id: Schema.String }),
  Schema.Struct({ type: Schema.Literal("kindChange"), kind: Kind }),
  Schema.Struct({ type: Schema.Literal("languageChange"), language: Schema.String }),
]);
export type LookupEvent = typeof LookupEvent.Type;

export const busy = (phase: Phase): boolean => phase === "searching" || phase === "looking";

export const resultTitle = (data: Pick<Result, "id" | "name">): string =>
  data.name || data.id.toUpperCase();

export const resultMeta = (data: Pick<Result, "year" | "rating">): string =>
  [data.year, data.rating ? `IMDb ${data.rating}` : null].filter(Boolean).join(" · ");

export const resultType = (type: Kind): string => (type === "tv" ? "TV Show" : "Movie");
