import type { WatchResult } from "./types";

interface UnknownResult {
  id?: unknown;
  url?: unknown;
  provider?: unknown;
  name?: unknown;
  type?: unknown;
  error?: unknown;
  data?: unknown;
  message?: unknown;
}

function isRecord(value: unknown): value is UnknownResult {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isWatchResult(value: unknown): value is WatchResult {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.id === "string" &&
    typeof value.url === "string" &&
    typeof value.provider === "string" &&
    typeof value.name === "string" &&
    (value.type === "movie" || value.type === "tv")
  );
}

export function unwrapActionResult(value: unknown): WatchResult {
  const fallback = "Something went wrong. Try again.";
  if (!isRecord(value)) {
    throw new Error(fallback);
  }
  if (isRecord(value.error) && typeof value.error.message === "string") {
    throw new Error(value.error.message);
  }
  if (isWatchResult(value.data)) {
    return value.data;
  }
  throw new Error(fallback);
}
