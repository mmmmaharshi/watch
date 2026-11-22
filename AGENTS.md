- Always follow $coding-standards.
- Never push, open a pull request, or merge without explicit user consent. Ask first and wait.
- For syntax-aware code search, default to `ast-grep --lang <language> -p '<pattern>'` (adjust `--lang` per language); use text-only search only when explicitly requested.
- Use `git twig new` in place of `git worktree add` when creating a worktree (see the `git-twig` skill).
- Use Astro as much as possible. Use the Astro MCP server for the latest docs.
- Before trusting browser-measured numbers, curl-verify the dev server serves current code (grep the response for a string from the working tree).
- On Windows, write multi-line issue, PR, and release bodies to a file and pass `--body-file`. Inline newlines in `--body` break.
- `astro dev` refuses a second server on the same port. Reuse the running one, or stop it first.
- `agent-browser` hides scrollbars by default. Pass `--hide-scrollbars false` when a scrollbar is under review.
- Respond to me with $simple-english and $i-have-adhd.
- Use $simple-english for every written part in the repo.

## Agent skills

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
