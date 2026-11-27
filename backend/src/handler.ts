import { Context, Effect, Layer, Option, Result } from "effect";
import { COPY } from "../../src/lib/copy";
import { parseTitleInput } from "../../src/lib/parse-input";
import type {
  ContentType,
  LookupInput,
  Mutable,
  WatchOutcome,
  WatchResult,
} from "../../src/lib/types";
import { Mapping } from "./mapping";
import { Metadata } from "./metadata";
import type { TitleMeta } from "./metadata";
import { Providers } from "./providers";

export type HandlerOutcome = WatchOutcome;

export interface HandlerShape {
  readonly handle: (input: LookupInput) => Effect.Effect<HandlerOutcome>;
}

// The five failure shapes mirror the old API exactly. The client branches on
// reason, never on the message text.
const INVALID: HandlerOutcome = {
  ok: false,
  status: 400,
  reason: "invalid_input",
  error: COPY.outcome.invalidInput,
};
const AMBIGUOUS: HandlerOutcome = {
  ok: false,
  status: 400,
  reason: "tmdb_ambiguous",
  error: COPY.outcome.tmdbAmbiguous,
};
const NOT_FOUND: HandlerOutcome = {
  ok: false,
  status: 502,
  reason: "tmdb_not_found",
  error: COPY.outcome.tmdbNotFound,
};
const NO_METADATA: HandlerOutcome = {
  ok: false,
  status: 502,
  reason: "metadata_missing",
  error: COPY.outcome.metadataMissing,
};
const NO_PROVIDERS: HandlerOutcome = {
  ok: false,
  status: 503,
  reason: "no_providers",
  error: COPY.outcome.noProviders,
};

export class Handler extends Context.Service<Handler, HandlerShape>()("watch/backend/Handler") {
  static readonly layer: Layer.Layer<Handler, never, Mapping | Metadata | Providers> = Layer.effect(
    Handler,
    Effect.gen(function* () {
      const mapping = yield* Mapping;
      const metadata = yield* Metadata;
      const providers = yield* Providers;

      const handle = Effect.fnUntraced(function* (input: LookupInput) {
        const parsed = parseTitleInput(input.id, input.kind);
        if (parsed === null) {
          return INVALID;
        }

        let id: string;
        let preferred: ContentType | undefined;
        if (parsed.kind === "imdb") {
          id = parsed.id;
        } else {
          const mapped = yield* mapping.resolve(parsed.id, parsed.type).pipe(Effect.result);
          if (Result.isFailure(mapped)) {
            // A lookup failure is a miss, as in the old client.
            return mapped.failure._tag === "TmdbAmbiguous" ? AMBIGUOUS : NOT_FOUND;
          }
          id = mapped.success.id;
          preferred = mapped.success.type;
        }

        const resolved = yield* metadata
          .resolve(id, preferred ?? input.kind, input.strictKind === true)
          .pipe(Effect.result);
        let meta: TitleMeta;
        if (Result.isFailure(resolved)) {
          if (input.name === undefined) {
            return NO_METADATA;
          }
          const fallback: Mutable<TitleMeta> = {
            type: input.kind ?? "movie",
            name: input.name,
          };
          if (input.year !== undefined) {
            fallback.year = input.year;
          }
          meta = fallback;
        } else {
          meta = resolved.success;
        }

        const { type } = meta;
        const stream = yield* providers.selectStream(
          input.exclude === undefined ? { type, id } : { type, id, exclude: input.exclude },
        );
        if (Option.isNone(stream)) {
          return NO_PROVIDERS;
        }

        const { url, provider } = stream.value;
        const result: Mutable<WatchResult> = {
          id,
          url,
          provider,
          type: meta.type,
          name: meta.name,
        };
        if (meta.year !== undefined) {
          result.year = meta.year;
        }
        if (meta.rating !== undefined) {
          result.rating = meta.rating;
        }
        if (meta.description !== undefined) {
          result.description = meta.description;
        }
        return { ok: true as const, result };
      });

      return Handler.of({ handle });
    }),
  );
}
