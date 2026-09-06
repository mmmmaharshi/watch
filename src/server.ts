const DOMAINS_SOURCE = "https://vidsrc.domains";
const REFRESH_INTERVAL = 24 * 60 * 60 * 1000; // 1 day
const FAILED_TTL = 10 * 60 * 1000; // skip failed domains for 10 min
const failures = new Map<string, number>();

let domains: string[] = [];

async function fetchDomains(): Promise<string[]> {
  try {
    const res = await fetch(DOMAINS_SOURCE, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    // Extract domains from <span class="domain-name"> elements
    const domainPattern = /class="domain-name"\s*>([a-z0-9.-]+\.(?:ru|su|ir))</gi;
    const found = new Set<string>();
    let match;
    while ((match = domainPattern.exec(html)) !== null) {
      found.add(match[1].toLowerCase());
    }

    if (found.size === 0) throw new Error("No domains parsed");
    console.log(`[domains] refreshed: ${[...found].join(", ")}`);
    return [...found];
  } catch (err) {
    console.error(`[domains] fetch failed: ${err}`);
    return domains.length > 0 ? domains : [];
  }
}

async function detectType(id: string): Promise<"movie" | "tv"> {
  try {
    const res = await fetch(`https://api.tvmaze.com/lookup/shows?imdb=${id}`, {
      signal: AbortSignal.timeout(5000),
    });
    return res.ok ? "tv" : "movie";
  } catch {
    return "movie";
  }
}

async function checkDomain(domain: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`https://${domain}`, {
      method: "HEAD",
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.status < 400;
  } catch {
    return false;
  }
}

async function getWorkingDomain(): Promise<string | null> {
  const now = Date.now();
  console.log(`[getWorkingDomain] domains array length: ${domains.length}`);
  console.log(`[getWorkingDomain] domains: ${domains.join(", ")}`);
  console.log(`[getWorkingDomain] failures map: ${[...failures.entries()].map(([k,v]) => `${k}=${v > now ? "active" : "expired"}`).join(", ") || "empty"}`);
  const shuffled = [...domains]
    .filter(d => !(failures.get(d)! > now))
    .sort(() => Math.random() - 0.5);
  console.log(`[getWorkingDomain] checking ${shuffled.length} domains (after filter): ${shuffled.join(", ")}`);
  for (const domain of shuffled) {
    const ok = await checkDomain(domain);
    console.log(`[getWorkingDomain] checkDomain(${domain}) = ${ok}`);
    if (ok) return domain;
    failures.set(domain, now + FAILED_TTL);
  }
  return null;
}

// Initial fetch + periodic refresh
fetchDomains().then(u => {
  console.log(`[init] fetchDomains returned ${u.length} domains: ${u.join(", ")}`);
  if (u.length) domains = u;
  console.log(`[init] domains array now has ${domains.length} entries`);
});
setInterval(() => fetchDomains().then(u => { if (u.length) domains = u; }), REFRESH_INTERVAL);

const server = Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/api/watch") {
      const id = url.searchParams.get("id")?.trim().toLowerCase() ?? "";
      if (!id.startsWith("tt")) {
        return new Response(JSON.stringify({ error: "Invalid IMDB ID" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      const domain = await getWorkingDomain();
      if (!domain) {
        return new Response(
          JSON.stringify({ error: "No working domains available" }),
          { status: 503, headers: { "Content-Type": "application/json" } },
        );
      }
      const type = await detectType(id);
      const embedUrl = type === "tv"
        ? `https://${domain}/embed/tv/${id}/1/1`
        : `https://${domain}/embed/movie/${id}`;
      return new Response(
        JSON.stringify({ url: embedUrl, domain, type }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    if (url.pathname === "/") {
      return new Response(Bun.file("public/index.html"));
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Server running at http://localhost:${server.port}`);
