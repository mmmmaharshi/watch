// The recent-lookups list. Pure functions, no DOM, in their own module so the
// browser and `bun test` can share the one implementation.

const RECENT_MAX = 5;

// Newest first, no duplicates, capped.
export function addRecent(list, entry) {
  return [entry, ...list.filter(item => item.id !== entry.id)].slice(0, RECENT_MAX);
}

// localStorage may hold anything: junk, or a shape from an older version.
export function parseRecent(raw) {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
