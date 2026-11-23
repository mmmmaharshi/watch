// Third-party JSON; call sites check the shape before use.
type JsonValue = string | number | boolean | null | Array<JsonValue> | { [key: string]: JsonValue };
export type LooseJson = { [key: string]: JsonValue };

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return Object.values(value).every(isJsonValue);
}

export function isLooseJson(value: unknown): value is LooseJson {
  return isJsonValue(value) && typeof value === "object" && value !== null && !Array.isArray(value);
}

// Upstream bodies are JSON text; each caller parses and checks the shape.
export interface HttpClient {
  get(
    url: string,
    options?: { signal?: AbortSignal; headers?: Record<string, string> },
  ): Promise<{
    ok: boolean;
    text: () => Promise<string>;
  }>;
}

export const defaultHttpClient: HttpClient = {
  get: async (url, options) => {
    const res = await fetch(url, options);
    return { ok: res.ok, text: () => res.text() };
  },
};

export class Cache<T> {
  private store = new Map<string, { value: T; expires: number }>();

  constructor(
    private ttl: number,
    private maxEntries = 1000,
  ) {}

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (entry && entry.expires > Date.now()) {
      // LRU: move to the end so hot entries survive eviction.
      this.store.delete(key);
      this.store.set(key, entry);
      return entry.value;
    }
    this.store.delete(key);
    return undefined;
  }

  set(key: string, value: T, ttl: number = this.ttl): void {
    if (!this.store.has(key) && this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) {
        this.store.delete(oldest);
      }
    }
    this.store.set(key, { value, expires: Date.now() + ttl });
  }
}
