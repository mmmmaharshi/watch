# Verification

An agent that writes a change must not grade it. It passes its own assumptions
into its own tests, and it feels pressure to finish. So the verifier is separate.

## Who verifies

A model from a different provider than the one that wrote the change. Two runs
from the same family share blind spots. When only one provider is available,
one run is still better than none, but the report must say so.

The verifier starts with fresh context. It gets three things:

1. `docs/agents/acceptance.md` (the criteria).
2. The URL to test.
3. The report format below.

It does not get the diff, the conversation, the tests, or the source. If it
reads the source, it starts to test what was built instead of what was promised.

## What it may do

- Use a real browser on the live app. Never infer behavior from code.
- Walk the app as a person would, including paths the criteria do not list.
- Read the browser console and network log. A hidden error is a bug.

It may not edit `docs/agents/acceptance.md`, `e2e/`, or the source. It reports.
Someone else fixes.

## Report format

Post it on the pull request with `gh pr comment <n> --body-file <file>`:

```md
## Verification

- Verifier: <provider/model>
- Target: <url> at <commit>
- Criteria: 7 pass, 1 fail

| ID  | Result | Note   |
| --- | ------ | ------ |
| A1  | pass   |        |
| A4  | fail   | See B1 |

### B1 — <one line, the user-visible symptom>

- Steps: <what I clicked>
- Expected: <the criterion>
- Got: <what happened, with the exact text>
- Evidence: <screenshot path or console line>
- Likely area: <file or component, if obvious. Do not fix it.>
```

One bug per section. No praise, no summary of the code.

## Two speeds

| Command            | Covers                            | Runs                      |
| ------------------ | --------------------------------- | ------------------------- |
| `bun run e2e`      | A1, A2, A9 — no network           | every pull request        |
| `bun run e2e:live` | A3–A8 — real search and providers | nightly, and after deploy |

`bun run e2e:live` uses the local dev server by default. Set `LIVE_URL` to
grade the deployed site:

```sh
LIVE_URL=https://watch.maharshi.work bun run e2e:live
```

The scripted suite covers the listed criteria. The verifier still explores by
hand, because a script only finds what it was told to look for.
