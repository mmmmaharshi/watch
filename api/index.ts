const DOMAINS_SOURCE = "https://vidsrc.domains";
const REFRESH_INTERVAL = 24 * 60 * 60 * 1000;
const FAILED_TTL = 10 * 60 * 1000;
const failures = new Map<string, number>();
let domains: string[] = [];

async function fetchDomains(): Promise<string[]> {
  try {
    const res = await fetch(DOMAINS_SOURCE, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const domainPattern = /class="domain-name"\s*>([a-z0-9.-]+\.(?:ru|su|ir))</gi;
    const found = new Set<string>();
    let match;
    while ((match = domainPattern.exec(html)) !== null) {
      found.add(match[1].toLowerCase());
    }
    if (found.size === 0) throw new Error("No domains parsed");
    return [...found];
  } catch {
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
    const res = await fetch(`https://${domain}`, {
      method: "HEAD",
      signal: AbortSignal.timeout(8000),
    });
    return res.status < 400;
  } catch {
    return false;
  }
}

async function getWorkingDomain(): Promise<string | null> {
  const now = Date.now();
  const shuffled = [...domains]
    .filter(d => !(failures.get(d)! > now))
    .sort(() => Math.random() - 0.5);
  for (const domain of shuffled) {
    if (await checkDomain(domain)) return domain;
    failures.set(domain, now + FAILED_TTL);
  }
  return null;
}

fetchDomains().then(u => { if (u.length) domains = u; });
setInterval(() => fetchDomains().then(u => { if (u.length) domains = u; }), REFRESH_INTERVAL);

export default async function handler(req: Request): Promise<Response> {
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
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Watch Movies & TV Shows Free</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🔴</text></svg>">
<meta name="description" content="Watch movies and TV shows for free. Paste an IMDB ID to stream instantly.">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { height: 100%; overflow: hidden; }
body { font-family: 'SF Mono', 'Consolas', monospace; background: #000; color: #fff; display: flex; align-items: center; justify-content: center; }
.wrap { display: flex; gap: 0; align-items: center; }
input { padding: 1rem 1.25rem; font-size: 1rem; font-family: inherit; border: 1px solid #222; border-right: none; border-radius: 6px 0 0 6px; background: #0a0a0a; color: #fff; outline: none; width: 280px; transition: border-color 0.2s; }
input:focus { border-color: #e50914; }
input::placeholder { color: #444; }
input.loading { border-color: #e50914; animation: pulse 0.6s infinite alternate; }
@keyframes pulse { to { border-color: #555; } }
button { padding: 1rem 1.5rem; font-size: 1rem; font-family: inherit; border: 1px solid #e50914; border-radius: 0 6px 6px 0; background: #e50914; color: #fff; cursor: pointer; transition: background 0.2s; }
button:hover { background: #b0060f; }
button:active { transform: scale(0.97); }
button:disabled { background: #444; border-color: #444; cursor: wait; }
@media (max-width: 480px) {
  .wrap { flex-direction: column; width: 90%; gap: 8px; }
  input { width: 100%; border-right: 1px solid #222; border-radius: 6px 6px 0 0; }
  button { width: 100%; border-radius: 0 0 6px 6px; }
}
</style>
</head>
<body>
<div class="wrap">
<input type="text" id="imdb" placeholder="tt1300854" autocomplete="off" spellcheck="false">
<button id="go">watch</button>
</div>
<script>
const input = document.getElementById('imdb');
const btn = document.getElementById('go');
const params = new URLSearchParams(location.search);
if (params.get('id')) input.value = params.get('id');
async function go() {
  const id = input.value.trim().toLowerCase();
  if (!id.startsWith('tt')) { input.style.borderColor = '#e50914'; setTimeout(() => input.style.borderColor = '#222', 1200); return; }
  history.pushState(null, '', '?id=' + id);
  btn.disabled = true; input.classList.add('loading');
  try {
    const res = await fetch('/api/watch?id=' + encodeURIComponent(id));
    if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
    const { url } = await res.json();
    window.open(url, '_blank');
  } catch (err) { input.style.borderColor = '#e50914'; console.error(err.message); }
  finally { btn.disabled = false; input.classList.remove('loading'); }
}
btn.addEventListener('click', go);
input.addEventListener('keydown', e => { if (e.key === 'Enter' && !btn.disabled) go(); });
input.focus();
</script>
</body>
</html>`;
    return new Response(html, {
      headers: { "Content-Type": "text/html" },
    });
  }

  return new Response("Not Found", { status: 404 });
}
