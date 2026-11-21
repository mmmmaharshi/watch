import { isAllowedProviderHost, parseActiveDomains } from "../src/lib/watch";

// Twice-weekly probe. Reads the live directory, keeps only hosts that pass
// a real check, and writes public/providers.json. A plain HTTP 200 proves
// nothing: valid and bogus titles return the same shell, so each host must
// show its own alive signal (see research/probe-26.md).
const DIRECTORY_URL = "https://vidsrc.domains/";
const PROBE_ID = "tt0133093";
const VIDLINK_URL = `https://vidlink.pro/movie/${PROBE_ID}`;
const VIDFAST_URL = "https://vidfast.vc";
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

// One entry per origin. VidFast is always last: it is the hardcoded
// fallback the app uses when every VidSrc domain fails.
export function buildProvidersJson(
  baseUrls: Array<string>,
  updatedAt: string = new Date().toISOString(),
): ProvidersFile {
  const seen = new Set<string>();
  const providers: Array<ProviderEntry> = [];
  for (const baseUrl of [...baseUrls, VIDFAST_URL]) {
    const base = new URL(baseUrl).origin;
    if (seen.has(base)) {
      continue;
    }
    seen.add(base);
    providers.push({ name: new URL(base).host, baseUrl: base });
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
  const candidates = parseActiveDomains(directory).filter((url) => {
    try {
      return isAllowedProviderHost(new URL(url).host);
    } catch {
      return false;
    }
  });

  const alive: Array<string> = [];
  for (const url of candidates) {
    try {
      const origin = new URL(url).origin;
      if (await isVidSrcAlive(origin)) {
        alive.push(origin);
      } else {
        process.stdout.write(`Skip ${origin}: no signed vs_src answer.\n`);
      }
    } catch {
      process.stdout.write(`Skip ${url}: probe failed.\n`);
    }
  }

  try {
    const checked = await getText(VIDLINK_URL);
    process.stdout.write(
      isVidLinkAlive(checked.status, checked.body)
        ? "VidLink answers 200 for the probe title.\n"
        : "VidLink is not usable; left out.\n",
    );
  } catch {
    process.stdout.write("VidLink probe failed; left out.\n");
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
