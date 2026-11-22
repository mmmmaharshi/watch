import { z } from "astro/zod";

// Vercel deploys outside this workflow, so a green build says nothing about
// the live site. Wait for this commit's deployment, then load the page.
const site = process.env.LIVE_URL ?? "https://watch.maharshi.work";
const repo = process.env.GITHUB_REPOSITORY;
const sha = process.env.GITHUB_SHA;
const token = process.env.GITHUB_TOKEN;
const deadline = Date.now() + 10 * 60_000;

const deployments = z.array(z.object({ id: z.number() }));
const statuses = z.array(z.object({ state: z.string(), description: z.string().optional() }));

if (!repo || !sha || !token) {
  throw new Error("GITHUB_REPOSITORY, GITHUB_SHA, and GITHUB_TOKEN are required.");
}

const api = `https://api.github.com/repos/${repo}`;

async function get(url: string) {
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
    },
  });
  if (!response.ok) {
    throw new Error(`${url} answered ${response.status}`);
  }
  return response;
}

async function waitForSuccess() {
  while (Date.now() < deadline) {
    const list = deployments.parse(
      await (await get(`${api}/deployments?sha=${sha}&per_page=5`)).json(),
    );
    for (const deployment of list) {
      const history = statuses.parse(
        await (await get(`${api}/deployments/${deployment.id}/statuses`)).json(),
      );
      const latest = history[0];
      if (latest?.state === "success") {
        return;
      }
      if (latest?.state === "failure" || latest?.state === "error") {
        throw new Error(`Deployment failed: ${latest.description ?? latest.state}`);
      }
    }
    await Bun.sleep(10_000);
  }
  throw new Error("No successful deployment within 10 minutes.");
}

await waitForSuccess();

const page = await fetch(site);
if (!page.ok) {
  throw new Error(`${site} answered ${page.status}`);
}
const html = await page.text();
if (!html.includes('id="status"')) {
  throw new Error(`${site} is missing the island markup.`);
}
process.stdout.write(`${site} is live for ${sha}.\n`);
