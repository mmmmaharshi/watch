import type { WatchResult } from "./watch";

// The ID rides in the hash so a shared link never creates a second URL for
// search engines to index. The query form is still read for older links.
export function parseSharedId(search: string, hash: string): string | null {
  return new URLSearchParams(search || hash.slice(1)).get("id");
}

export function resultTitle(data: Pick<WatchResult, "id" | "name">): string {
  return data.name || data.id.toUpperCase();
}

export function resultMeta(data: Pick<WatchResult, "year" | "rating">): string {
  return [data.year, data.rating ? `IMDb ${data.rating}` : null].filter(Boolean).join(" · ");
}

export function resultType(type: WatchResult["type"]): string {
  return type === "tv" ? "TV Show" : "Movie";
}
