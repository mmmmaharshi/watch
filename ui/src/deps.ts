import { Effect } from "effect";
import { COPY } from "../../src/lib/copy";
import type { LookupTransport } from "../../src/lib/transport";
import type { LookupOutcome } from "../../src/lib/types";
import type { LookupDeps } from "./lookup-machine";

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
  error: COPY.machine.failed,
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
