- Always follow $coding-standards.
- Never push, open a pull request, or merge without explicit user consent. Ask first and wait.
- For syntax-aware code search, default to `ast-grep --lang <language> -p '<pattern>'` (adjust `--lang` per language); use text-only search only when explicitly requested.
- Use `git twig new` in place of `git worktree add` when creating a worktree (see the `git-twig` skill).
- Use Astro as much as possible. Check the Astro docs MCP before editing when an Astro API is missing, renamed, or behaves differently at runtime: the adapter and runtime APIs move between majors.
- Before trusting browser-measured numbers, curl-verify the dev server serves current code (grep the response for a string from the working tree).
- On Windows, write multi-line issue, PR, and release bodies to a file and pass `--body-file`. Inline newlines in `--body` break.
- Shell is Windows PowerShell 5.1: pass quoted or regex patterns to the `grep` tool, because shell `rg` rejects escaped quotes; write files with the file tools, because `Set-Content -NoNewline` does not exist.
- `astro dev` refuses a second server on the same port. `bun run e2e` starts its own on 4321 and stops it at the end (see `playwright.config.ts`), so start `bunx astro dev` yourself when you want to curl the app.
- `agent-browser` hides scrollbars by default. Pass `--hide-scrollbars false` when a scrollbar is under review.
- Respond to me with $simple-english and $i-have-adhd.
- Use $simple-english for every written part in the repo.

## Agent skills

### Layout

One owner per folder: shared contracts in `src/lib`, Effect services in
`backend/src`, Foldkit view in `ui/src`, Bun entry points in `scripts`. Read
`docs/agents/layout.md` before adding a module or a shape that crosses layers.

### Issue tracker

Issues and specs live in this repo's GitHub Issues, accessed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) map 1:1 to GitHub labels. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` at the repo root plus `docs/adr/`. See `docs/agents/domain.md`.

### Verification

Never grade your own change. The criteria live in `docs/agents/acceptance.md`.
The verifier runs `$verify`, with fresh context and another provider. See
`docs/agents/qa.md`.

### Deploys

The site runs on Cloudflare. The Worker, the host, and the security header rule
are in `docs/agents/deploy.md`. Use the `cf` CLI for Cloudflare commands.
