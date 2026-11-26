import { Option, Schema } from "effect";
import { WatchOutcome } from "./types";
import type { LookupTransport } from "./ui-deps";

interface ApiResponse<A> {
  readonly data?: A;
  readonly error?: { readonly message?: string };
}

const errorMessage = (payload: unknown, status: number): string => {
  if (typeof payload === "object" && payload !== null && "error" in payload) {
    const error = payload.error;
    return typeof error === "string" && error.length > 0 ? error : `HTTP ${status}`;
  }
  return `HTTP ${status}`;
};

const post = async <A>(
  path: string,
  body: unknown,
  schema: Schema.ConstraintDecoder<A>,
): Promise<ApiResponse<A>> => {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload: unknown = await response.json();
    // The wire contract is decoded, not asserted: a server change that breaks
    // the shape reads as a transport failure, not as a bad result on screen.
    const decoded = Schema.decodeUnknownOption(schema)(payload);
    return Option.isSome(decoded)
      ? { data: decoded.value }
      : { error: { message: errorMessage(payload, response.status) } };
  } catch (error) {
    return { error: { message: error instanceof Error ? error.message : "Network error" } };
  }
};

// The site's one endpoint.
export const httpTransport: LookupTransport = {
  watch: (input) => post("/api/watch", input, WatchOutcome),
};
