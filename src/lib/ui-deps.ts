import { Effect } from "effect";
import type { LookupDeps, LookupOutcome } from "../../backend/src/lookup-machine";
import { LOOKUP_FAILED } from "./messages";
import type { ContentType, WatchOutcome } from "./types";

// The API response, structurally. A call that reaches the Worker answers
// with data; a call that fails answers with an error, or rejects.
interface ApiResponse<A> {
  readonly data?: A;
  readonly error?: { readonly message?: string };
}

// The endpoint the page exposes. Passed in, so the deps are tested without a
// server.
export interface LookupTransport {
  readonly watch: (input: {
    readonly id: string;
    readonly kind?: ContentType;
    readonly exclude?: string;
  }) => Promise<ApiResponse<WatchOutcome>>;
}

const resolve = async <A>(task: () => Promise<A>, fallback: A): Promise<A> => {
  try {
    return await task();
  } catch {
    return fallback;
  }
};

// The machine takes outcomes, never transport errors. A call that fails at the
// edge reads as a product failure with the same copy the machine shows.
const LOOKUP_TRANSPORT_FAILURE: LookupOutcome = {
  ok: false,
  reason: "invalid_input",
  error: LOOKUP_FAILED,
};

export const makeLookupDeps = (transport: LookupTransport): LookupDeps => ({
  lookup: (input) =>
    Effect.promise(() =>
      resolve(async () => {
        const response = await transport.watch(input);
        const outcome = response.data;
        if (outcome === undefined) {
          return LOOKUP_TRANSPORT_FAILURE;
        }
        return outcome.ok
          ? { ok: true as const, result: outcome.result }
          : { ok: false as const, reason: outcome.reason, error: outcome.error };
      }, LOOKUP_TRANSPORT_FAILURE),
    ),
});
