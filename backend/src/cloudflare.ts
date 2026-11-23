import { KV } from "@alchemy.run/cloudflare";
import { CACHE_NAMESPACE, PROVIDER_LIST_NAMESPACE } from "./resources";

// Descriptions only: Alchemy provisions the real namespaces on deploy because
// the website and the refresh Worker bind them.
export const ProviderListKv = KV.Namespace(PROVIDER_LIST_NAMESPACE);
export const CacheKv = KV.Namespace(CACHE_NAMESPACE);
