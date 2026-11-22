import {
  buildEmbedUrl,
  DIRECTORY_URL,
  originIfAllowed,
  parseActiveDomains,
  VIDFAST,
  VIDLINK,
  VIDZEE,
} from "../src/lib/watch";

// Twice-weekly probe. Reads the live directory, keeps only hosts that pass
// a real check, and writes public/providers.json. A plain HTTP 200 proves
// nothing: valid and bogus titles return the same shell, so each host must
// show its own alive signal (see research/probe-26.md).
const PROBE_ID = "tt0133093";
const BOGUS_ID = "tt0000000";
const TIMEOUT_MS = 8000;

export interface ProviderEntry {
  name: string;
  baseUrl: string;
}

export interface ProvidersFile {
  updatedAt: string;
  providers: Array<ProviderEntry>;
}

// The embed page is wired when it points at the vs_src API hook.
export function hasPlayerApi(embedHtml: string): boolean {
  return embedHtml.includes('data-api="/vs_src.php?');
}

// The vs_src endpoint is alive when it signs a player URL with a token.
// A bogus title gets the same shape, so this proves wiring, not the title.
export function hasSignedSrc(apiBody: string): boolean {
  return apiBody.includes('"src"') && apiBody.includes("?vs=");
}

// VidLink is the only host with a per-title signal: 200 for a real title,
// 500 for a bogus one. The body marker guards against a parked domain.
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

// VidZee has no per-title signal (valid and bogus return the same shell),
// so this only proves the player shell is up. Left shallow on purpose;
// a deeper API check is out of scope (see research/probe-26.md).
export function isVidZeeAlive(status: number, body: string): boolean {
  return status === 200 && /tmdb|vidzee/i.test(body);
}

// One entry per origin. VidFast is always last: it is the hardcoded
// fallback the app uses when every VidSrc domain fails.
export function buildProvidersJson(
  baseUrls: Array<string>,
  updatedAt: string = new Date().toISOString(),
): ProvidersFile {
  const seen = new Set<string>();
  const providers: Array<ProviderEntry> = [];
  for (const baseUrl of [...baseUrls, VIDFAST.baseUrl]) {
    let url: URL;
    try {
      url = new URL(baseUrl);
    } catch {
      // Skip the bad entry; the rest of the file still applies.
      continue;
    }
    if (seen.has(url.origin)) {
      continue;
    }
    seen.add(url.origin);
    providers.push({ name: url.host, baseUrl: url.origin });
  }
  return { updatedAt, providers };
}

async function getText(url: string): Promise<{ status: number; body: string }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  return { status: res.status, body: await res.text() };
}

async function isVidSrcAlive(origin: string): Promise<boolean> {
  const embed = await getText(`${origin}/embed/movie/${PROBE_ID}`);
  if (!embed.body || !hasPlayerApi(embed.body)) {
    return false;
  }
  const api = await getText(`${origin}/vs_src.php?type=movie&id=${PROBE_ID}`);
  return hasSignedSrc(api.body);
}

async function refresh(): Promise<void> {
  let directory: string;
  try {
    directory = (await getText(DIRECTORY_URL)).body;
  } catch {
    // Directory unreachable. Keep the last good file; do not blank it.
    process.stdout.write("Directory fetch failed; keeping the current providers.json.\n");
    return;
  }
  const candidates = parseActiveDomains(directory).filter((url) => originIfAllowed(url) !== null);

  const alive: Array<string> = [];
  for (const origin of candidates) {
    try {
      if (await isVidSrcAlive(origin)) {
        alive.push(origin);
      } else {
        process.stdout.write(`Skip ${origin}: no signed vs_src answer.\n`);
      }
    } catch {
      process.stdout.write(`Skip ${origin}: probe failed.\n`);
    }
  }

  try {
    const valid = await getText(buildEmbedUrl(VIDLINK, "movie", PROBE_ID));
    const bogus = await getText(buildEmbedUrl(VIDLINK, "movie", BOGUS_ID));
    if (isVidLinkPairAlive(valid, bogus)) {
      alive.push(VIDLINK.baseUrl);
      process.stdout.write("VidLink answers 200 for the probe title, 500 for the bogus one.\n");
    } else {
      process.stdout.write("VidLink is not usable; left out.\n");
    }
  } catch {
    process.stdout.write("VidLink probe failed; left out.\n");
  }

  try {
    const checked = await getText(buildEmbedUrl(VIDZEE, "movie", PROBE_ID));
    if (isVidZeeAlive(checked.status, checked.body)) {
      alive.push(VIDZEE.baseUrl);
      process.stdout.write("VidZee answers for the probe title.\n");
    } else {
      process.stdout.write("VidZee is not usable; left out.\n");
    }
  } catch {
    process.stdout.write("VidZee probe failed; left out.\n");
  }

  const out = buildProvidersJson(alive);
  await Bun.write(
    new URL("../public/providers.json", import.meta.url),
    `${JSON.stringify(out, null, 2)}\n`,
  );
  process.stdout.write(`Wrote ${out.providers.length} providers.\n`);
}

if (import.meta.main) {
  await refresh();
}
