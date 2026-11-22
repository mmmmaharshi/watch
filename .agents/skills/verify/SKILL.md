---
name: verify
description: Grade a change against docs/agents/acceptance.md with a fresh-context verifier from another provider. Use when asked to verify, QA, or grade a pull request, a branch, or the live app.
---

# Verify

You are arranging a grade, not giving one. The agent that wrote the change
never grades it, and neither do its tests.

## Steps

1. Pick the target. A pull request needs its branch checked out or deployed.
   For the deployed site use `LIVE_URL=https://watch.maharshi.work`. For a local
   branch use `PORT=4400` so you do not fight the main checkout's server.

2. Run the scripted subset yourself. It costs seconds and tells you whether the
   app is alive:

   ```sh
   bun run e2e          # offline criteria
   bun run e2e:live     # real search and providers
   ```

3. Delegate the grade to an agent with fresh context and a different provider
   than the one that wrote the change. Send exactly this brief, filled in. Send
   nothing else. No diff, no summary, no review notes, no file list.

   ```text
   You are the independent verifier for a web app. A different agent wrote the
   change; do not read its conversation, its diff, or the source.

   Read docs/agents/acceptance.md in <checkout>. Read it from disk now, not from
   memory. That file is the only specification. Ignore the code.

   Target: <url> (start <server command> if needed).

   Test every criterion in a real browser, on desktop and on a phone viewport.
   Then explore beyond the list: press buttons twice, reload mid-lookup, close
   and reopen, use the back button, paste odd input. After every step check the
   browser console and failed requests; an error there is a bug even when the
   screen looks right.

   Report only defects, in this shape:

   ## Verification
   - Verifier: <provider/model>
   - Target: <url> at <commit>
   - Criteria: <n> pass, <m> fail

   | ID | Result | Note |
   | -- | ------ | ---- |

   ### B1 — <one line, the user-visible symptom>
   - Steps: <what you clicked>
   - Expected: <the criterion>
   - Got: <what happened, with the exact text>
   - Evidence: <screenshot path or console line>

   Do not edit any file. Do not fix anything. Report only.
   ```

4. Post the report on the pull request:

   ```sh
   gh pr comment <number> --body-file <report.md>
   ```

   Write the body to a file. Inline newlines break `--body` on Windows.

5. Hand back. The implementer fixes the findings; you do not. A passing grade is
   a report with no bug sections, not silence.

## Rules

- One provider is not a perspective. When a second provider is unavailable, the
  report opens with that limit.
- A screenshot or an exact string beats a description. A bug a human cannot
  reproduce is not reported as a bug.
- Never add, edit, or delete a test to make a run green. `bun test` fails when a
  criterion and its test drift apart; that guard is the point.
