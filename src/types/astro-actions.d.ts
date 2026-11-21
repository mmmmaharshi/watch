// The generated astro:actions types are virtual and not visible to standalone
// tsrs runs. Declare the one RPC surface the client actually uses.
declare module "astro:actions" {
  export interface WatchInput {
    id: string;
    exclude?: string;
  }
  export interface WatchResponse {
    data?: unknown;
    error?: unknown;
  }
  export interface SearchCandidate {
    imdbId: string;
    name: string;
    year?: string;
    description?: string;
  }
  export interface SearchInput {
    query: string;
  }
  export interface SearchResponse {
    data?: { candidates: Array<SearchCandidate> };
    error?: { message?: string };
  }
  export const actions: {
    watch(input: WatchInput): Promise<WatchResponse>;
    search(input: SearchInput): Promise<SearchResponse>;
  };
}
