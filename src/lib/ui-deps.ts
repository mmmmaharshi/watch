import { Effect } from "effect";
import type { LookupDeps, LookupOutcome } from "../../backend/src/lookup-machine";
import { LOOKUP_FAILED, SEARCH_FAILED } from "./messages";
import type { ContentType, SearchOutcome, WatchOutcome } from "./types";

// The Astro action result, structurally. A call that reaches the edge answers
// with data; a call that fails answers with an error, or rejects.
interface ActionResponse<A> {
  readonly data?: A;
  readonly error?: { readonly message?: string };
}

// The two server actions the page exposes. Passed in, so the deps are tested
// without a server.
export interface LookupTransport {
  readonly watch: (input: {
    readonly id: string;
    readonly kind?: ContentType;
    readonly exclude?: string;
  }) => Promise<ActionResponse<WatchOutcome>>;
  readonly search: (input: {
    readonly query: string;
    readonly kind: ContentType;
    readonly language?: string;
  }) => Promise<ActionResponse<SearchOutcome>>;
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
// A reason other than tmdb_not_found keeps a failed bare number from becoming
// a title search.
const LOOKUP_TRANSPORT_FAILURE: LookupOutcome = {
  ok: false,
  reason: "invalid_input",
  error: LOOKUP_FAILED,
};
const SEARCH_TRANSPORT_FAILURE: SearchOutcome = { ok: false, error: SEARCH_FAILED };

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
  search: (input) =>
    Effect.promise(() =>
      resolve(async () => {
        const response = await transport.search(input);
        return response.data ?? SEARCH_TRANSPORT_FAILURE;
      }, SEARCH_TRANSPORT_FAILURE),
    ),
});
