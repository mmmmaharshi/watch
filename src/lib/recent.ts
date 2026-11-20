// Recent lookups. Pure functions shared by the browser and `bun test`.
const RECENT_MAX = 5;

export interface RecentEntry {
  id: string;
  name?: string;
}

// Newest first, no duplicates, capped. Entries without a string id are dropped.
export function addRecent(list: Array<RecentEntry>, entry: RecentEntry): Array<RecentEntry> {
  if (!entry || typeof entry.id !== "string") {
    return list.slice(0, RECENT_MAX);
  }
  return [entry, ...list.filter((item) => item && item.id !== entry.id)].slice(0, RECENT_MAX);
}

// localStorage may hold anything: junk, or a shape from an older version.
function hasId(value: unknown): value is { id: unknown } {
  return typeof value === "object" && value !== null && "id" in value;
}

export function parseRecent(raw: string | null): Array<RecentEntry> {
  if (typeof raw !== "string") {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.filter((item): item is RecentEntry => {
    if (!hasId(item) || typeof item.id !== "string") {
      return false;
    }
    return true;
  });
}
