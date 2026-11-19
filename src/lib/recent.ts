// Recent lookups. Pure functions shared by the browser and `bun test`.
const RECENT_MAX = 5;

export interface RecentEntry {
  id: string;
  name?: string;
}

// Newest first, no duplicates, capped. Entries without a string id are dropped.
export function addRecent(list: RecentEntry[], entry: RecentEntry): RecentEntry[] {
  if (!entry || typeof entry.id !== "string") return list.slice(0, RECENT_MAX);
  return [entry, ...list.filter((item) => item && item.id !== entry.id)].slice(0, RECENT_MAX);
}

// localStorage may hold anything: junk, or a shape from an older version.
export function parseRecent(raw: string | null): RecentEntry[] {
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item.id === "string");
  } catch {
    return [];
  }
}
