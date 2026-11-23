// The platform KV calls a Worker gets from a binding. Kept as the raw promise
// API so the Cache and provider-list layers stay free of Worker bindings and
// tests need only a Map.
export interface KvPutOptions {
  // KV refuses an expiry under 60 seconds.
  readonly expirationTtl?: number;
}

export interface KvNamespace {
  readonly get: (key: string) => Promise<string | null>;
  readonly put: (key: string, value: string, options?: KvPutOptions) => Promise<void>;
}
