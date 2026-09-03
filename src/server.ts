const DOMAINS_SOURCE = "https://vidsrc.domains";
const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

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

async function refreshDomains() {
  const updated = await fetchDomains();
  if (updated.length > 0) domains = updated;
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
    return res.ok || (res.status >= 300 && res.status < 400);
  } catch {
    return false;
  }
}

async function getWorkingDomain(): Promise<string | null> {
  const shuffled = [...domains].sort(() => Math.random() - 0.5);
  for (const domain of shuffled) {
    if (await checkDomain(domain)) return domain;
  }
  return null;
}

// Initial fetch + periodic refresh
await refreshDomains();
setInterval(refreshDomains, REFRESH_INTERVAL);

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
      return new Response(
        JSON.stringify({ url: `https://${domain}/embed/movie/${id}`, domain }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    if (url.pathname === "/api/domains") {
      return new Response(JSON.stringify({ domains }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.pathname === "/") {
      return new Response(Bun.file("public/index.html"));
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Server running at http://localhost:${server.port}`);
