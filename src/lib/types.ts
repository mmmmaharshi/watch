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

export const Candidate = Schema.Struct({
  imdbId: Schema.String,
  name: Schema.String,
  year: Schema.optionalKey(Schema.String),
  kind: Kind,
  poster: Schema.optionalKey(Schema.String),
});
export type Candidate = typeof Candidate.Type;

// What the official services row shows: names plus the TMDB page that holds
// the per-country availability.
export const Official = Schema.Struct({
  services: Schema.Array(Schema.String),
  link: Schema.String,
});
export type Official = typeof Official.Type;

export const Result = Schema.Struct({
  id: Schema.String,
  url: Schema.String,
  provider: Schema.String,
  type: Kind,
  name: Schema.String,
  year: Schema.optionalKey(Schema.String),
  rating: Schema.optionalKey(Schema.String),
  description: Schema.optionalKey(Schema.String),
  official: Schema.optionalKey(Official),
});
export type Result = typeof Result.Type;
export type WatchResult = Result;

export const SearchOutcome = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true), candidates: Schema.Array(Candidate) }),
  Schema.Struct({ ok: Schema.Literal(false), error: Schema.String }),
]);
export type SearchOutcome = typeof SearchOutcome.Type;

export const SearchInput = Schema.Struct({
  query: Schema.String,
  kind: Kind,
  language: Schema.String,
});
export type SearchInput = typeof SearchInput.Type;

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

export type WatchOutcome =
  | { ok: true; result: Result }
  | { ok: false; status: 400 | 502 | 503; reason: WatchFailureReason; error: string };
