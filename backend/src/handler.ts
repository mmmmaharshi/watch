import { Context, Effect, Layer, Option, Result } from "effect";
import { TMDB_NOT_FOUND } from "../../src/lib/messages";
import { parseTitleInput } from "../../src/lib/parse-input";
import type { Mutable, WatchOutcome, WatchResult } from "../../src/lib/types";
import { Mapping } from "./mapping";
import { Metadata } from "./metadata";
import { Providers } from "./providers";
import type { ContentType } from "../../src/lib/types";

export type HandlerOutcome = WatchOutcome;

export interface HandlerInput {
  readonly id: string;
  readonly kind?: ContentType;
  readonly exclude?: string;
}

export interface HandlerShape {
  readonly handle: (input: HandlerInput) => Effect.Effect<HandlerOutcome>;
}

// The five failure shapes mirror the old API exactly. The client branches on
// reason, never on the message text.
const INVALID: HandlerOutcome = {
  ok: false,
  status: 400,
  reason: "invalid_input",
  error: "Invalid IMDb or TMDB ID",
};
const AMBIGUOUS: HandlerOutcome = {
  ok: false,
  status: 400,
  reason: "tmdb_ambiguous",
  error: "TMDB ID is ambiguous. Use a movie or TV link.",
};
const NOT_FOUND: HandlerOutcome = {
  ok: false,
  status: 502,
  reason: "tmdb_not_found",
  error: TMDB_NOT_FOUND,
};
const NO_METADATA: HandlerOutcome = {
  ok: false,
  status: 502,
  reason: "metadata_missing",
  error: "Failed to detect content type",
};
const NO_PROVIDERS: HandlerOutcome = {
  ok: false,
  status: 503,
  reason: "no_providers",
  error: "No working providers available",
};

export class Handler extends Context.Service<Handler, HandlerShape>()("watch/backend/Handler") {
  static readonly layer: Layer.Layer<Handler, never, Mapping | Metadata | Providers> = Layer.effect(
    Handler,
    Effect.gen(function* () {
      const mapping = yield* Mapping;
      const metadata = yield* Metadata;
      const providers = yield* Providers;

      const handle = Effect.fnUntraced(function* (input: HandlerInput) {
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

        const resolved = yield* metadata.resolve(id, preferred).pipe(Effect.result);
        if (Result.isFailure(resolved)) {
          return NO_METADATA;
        }

        const { type } = resolved.success;
        const stream = yield* providers.selectStream(
          input.exclude === undefined ? { type, id } : { type, id, exclude: input.exclude },
        );
        if (Option.isNone(stream)) {
          return NO_PROVIDERS;
        }

        const { url, provider } = stream.value;
        const meta = resolved.success;
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
