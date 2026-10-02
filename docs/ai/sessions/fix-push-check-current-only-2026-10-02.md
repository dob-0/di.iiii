## 2026-10-02 — the push gate looks at its own checkout only

- Found while chasing heat on aylmo during the local-hosting fix (di-atlas `decisions/2026-10-02-local-hosting.md`): every `git push` ran `start-check --code-only`, whose `checkCode` called `repo-state`'s `getState()`, which enriches all 204 worktrees and lists every unmerged branch. The CPU sat at 95-100 °C for minutes per push; two sessions pushing at once doubled it.
- `getState({ currentOnly: true })` describes only the current checkout (promotion plan and unmerged branches come back null); `checkCode` uses it. `npm run state` is unchanged.
- Measured after: the gate takes 0.9 s including the fetch. Guard test in `scripts/start-check.test.js` fails without the fix; start-check + repo-state tests pass. known-fixes row added.
