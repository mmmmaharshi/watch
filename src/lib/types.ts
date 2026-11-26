import { Schema } from "effect";

// The wire shapes that cross the action boundary. The page, the UI, and the
// machine all import these, so one edit moves all of them.
export const KINDS = ["movie", "tv"] as const;
export const Kind = Schema.Literals(KINDS);
export type Kind = typeof Kind.Type;
export type ContentType = Kind;

// Build one field at a time on a Schema-derived type: the keys are read-only
// and optional, so a literal cannot assign conditionally.
export type Mutable<T> = { -readonly [K in keyof T]: T[K] };

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
export type WatchResult = Result;

// One shape for every transport. The client branches on `reason`, never on the
// message text.
export const FAILURE_REASONS = [
  "invalid_input",
  "tmdb_ambiguous",
  "tmdb_not_found",
  "metadata_missing",
  "no_providers",
] as const;
export type WatchFailureReason = (typeof FAILURE_REASONS)[number];

export const WatchOutcome = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true), result: Result }),
  Schema.Struct({
    ok: Schema.Literal(false),
    status: Schema.Literals([400, 502, 503]),
    reason: Schema.Literals(FAILURE_REASONS),
    error: Schema.String,
  }),
]);
export type WatchOutcome = typeof WatchOutcome.Type;
