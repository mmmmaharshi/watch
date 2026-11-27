import { providerEntries } from "./providers";
import type { Provider, ProvidersFile } from "./providers";

// Probe rules shared by the Bun script and the Worker cron. A plain HTTP 200
// proves nothing: valid and bogus titles return the same shell, so each host
// carries its own alive check (see research/probe-26.md).
export const PROBE_ID = "tt0133093";
export const BOGUS_ID = "tt0000000";
export const PROBE_TIMEOUT_MS = 8000;

// The embed page is wired when it points at the vs_src API hook.
export function hasPlayerApi(embedHtml: string): boolean {
  return embedHtml.includes('data-api="/vs_src.php?');
}

// The vs_src endpoint is alive when it signs a player URL with a token.
// A bogus title gets the same shape, so this proves wiring, not the title.
export function hasSignedSrc(apiBody: string): boolean {
  return apiBody.includes('"src"') && apiBody.includes("?vs=");
}

// One answer is alive when the host answered 200 and its own body check, if
// any, passes. The cron and the request path share this rule.
export function isAlive(
  provider: Provider,
  response: { readonly status: number; readonly body: string },
): boolean {
  return response.status === 200 && (provider.alive === undefined || provider.alive(response.body));
}

export function buildProvidersJson(baseUrls: Array<string>, updatedAt: string): ProvidersFile {
  return { updatedAt, providers: providerEntries(baseUrls) };
}

// Twice the Tue+Sat schedule, plus margin. Older than this with no live
// directory, the run fails red so someone looks before users notice rot.
export const ROT_ALARM_MS = 7 * 24 * 60 * 60 * 1000;
