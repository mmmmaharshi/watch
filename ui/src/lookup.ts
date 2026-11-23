import { Schema } from "effect";

// Mirrors the shapes declared in backend/src/lookup-machine.ts. The machine's
// snapshot is the single source of lookup state; these schemas only make it
// storable in the Foldkit Model and visible to Messages.
export const Kind = Schema.Literals(["movie", "tv"]);
export type Kind = typeof Kind.Type;

export const Phase = Schema.Literals(["idle", "searching", "looking", "retrying"]);
export type Phase = typeof Phase.Type;

export const Candidate = Schema.Struct({
  imdbId: Schema.String,
  name: Schema.String,
  year: Schema.optionalKey(Schema.String),
  kind: Kind,
  poster: Schema.optionalKey(Schema.String),
});
export type Candidate = typeof Candidate.Type;

export const Result = Schema.Struct({
  id: Schema.String,
  url: Schema.String,
  provider: Schema.String,
  type: Kind,
  name: Schema.String,
  year: Schema.optionalKey(Schema.String),
  rating: Schema.optionalKey(Schema.String),
  description: Schema.optionalKey(Schema.String),
});
export type Result = typeof Result.Type;

export const Status = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("idle") }),
  Schema.Struct({ kind: Schema.Literal("info"), text: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("loading"), text: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("error"), text: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("field"), text: Schema.String }),
]);
export type Status = typeof Status.Type;

export const LookupState = Schema.Struct({
  phase: Phase,
  kind: Kind,
  candidates: Schema.Array(Candidate),
  result: Schema.NullOr(Result),
  status: Status,
  openId: Schema.NullOr(Schema.String),
});
export type LookupState = typeof LookupState.Type;

export const idleLookup = (): LookupState => ({
  phase: "idle",
  kind: "movie",
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
]);
export type LookupEvent = typeof LookupEvent.Type;

export const busy = (phase: Phase): boolean => phase === "searching" || phase === "looking";

export const resultTitle = (data: Pick<Result, "id" | "name">): string =>
  data.name || data.id.toUpperCase();

export const resultMeta = (data: Pick<Result, "year" | "rating">): string =>
  [data.year, data.rating ? `IMDb ${data.rating}` : null].filter(Boolean).join(" · ");

export const resultType = (type: Kind): string => (type === "tv" ? "TV Show" : "Movie");
