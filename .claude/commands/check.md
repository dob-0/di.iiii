---
allowed-tools: Bash(npm run lint:*), Bash(npm run build:*), Bash(npm test:*), Bash(npm run test:*), Bash(npm run docs:ai:check:*), Bash(npx vitest:*), Bash(git status:*), Bash(git diff:*), Bash(git branch:*)
description: Pre-ship gate — runs the AGENTS.md validation suite + a diff review with a clear go/no-go verdict
---

## Context

- Branch: !`git branch --show-current`
- Status: !`git status --short`
- Diff stat: !`git diff HEAD --stat`

## Task

Run the pre-ship gate. Do **not** commit, push, or change any files — this is read-only verification.

Run the canonical validation suite from `AGENTS.md`, stopping at the first hard failure and reporting it (don't keep running noise after a clear blocker):

1. `npm run lint` — errors block; warnings don't.
2. `npm run build` — **conditional**: skip when the diff touches only docs (`*.md`) and/or styles (`*.css`). Run it whenever any `.js`/`.jsx`/`.ts`/`.tsx`/config/asset file changed. When skipped, note `build: skipped (docs/CSS-only)` in the verdict.
3. `npm test`.
4. If the diff touches `serverXR/` → also `npm run test:server-contracts`.
5. If the diff touches `shared/`, `src/shared/`, or schema → also `npm run test:schema-sync`.
6. If the diff touches `AGENTS.md` or any role/docs source → `npm run docs:ai:check` (bridge files in sync).
7. **Diff review** — review `git diff HEAD` for correctness bugs only (logic errors, broken contracts, regressions). Invoke `/code-review` for a deeper pass when the diff is non-trivial. Skip style nits.

End with one line:
- `GATE: GO` — suite green and no correctness bugs found.
- `GATE: NO-GO` — followed by a short bullet list of each blocker (failing step + the fix).

Keep it tight. Show failing output, not passing noise.
