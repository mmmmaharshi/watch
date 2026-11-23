import { originIfHttps } from "./providers";
import type { ProviderEntry, ProvidersFile } from "./providers";

// Probe rules shared by the Bun script and the Worker cron. A plain HTTP 200
// proves nothing: valid and bogus titles return the same shell, so each host
// must show its own alive signal (see research/probe-26.md).
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

// VidLink is the only host with a per-title signal: 200 for a real title, 500
// for a bogus one. The body marker guards against a parked domain.
export function isVidLinkAlive(status: number, body: string): boolean {
  return status === 200 && /tmdb|vidlink/i.test(body);
}

// Both halves must hold: a parked domain answers 200 with a marker to every
// title, so the bogus title has to stay dead.
export function isVidLinkPairAlive(
  valid: { status: number; body: string },
  bogus: { status: number; body: string },
): boolean {
  return isVidLinkAlive(valid.status, valid.body) && !isVidLinkAlive(bogus.status, bogus.body);
}

// VidZee has no per-title signal (valid and bogus return the same shell), so
// this only proves the player shell is up. Left shallow on purpose; a deeper
// API check is out of scope (see research/probe-26.md).
export function isVidZeeAlive(status: number, body: string): boolean {
  return status === 200 && /tmdb|vidzee/i.test(body);
}

// VidFast is the static last resort, but even it gets probed: a blocked host is
// left out of the list.
export function isVidFastAlive(status: number): boolean {
  return status === 200;
}

export function buildProvidersJson(
  baseUrls: Array<string>,
  updatedAt: string,
  fallbacks: Array<string>,
): ProvidersFile {
  const seen = new Set<string>();
  const providers: Array<ProviderEntry> = [];
  for (const baseUrl of [...baseUrls, ...fallbacks]) {
    const origin = originIfHttps(baseUrl);
    if (!origin || seen.has(origin)) {
      continue;
    }
    seen.add(origin);
    providers.push({ name: new URL(origin).host, baseUrl: origin });
  }
  return { updatedAt, providers };
}

// Twice the Tue+Sat schedule, plus margin. Older than this with no live
// directory, the run fails red so someone looks before users notice rot.
export const ROT_ALARM_MS = 7 * 24 * 60 * 60 * 1000;

export function needsRotAlarm(ageMs: number | null): boolean {
  return ageMs === null || ageMs > ROT_ALARM_MS;
}
