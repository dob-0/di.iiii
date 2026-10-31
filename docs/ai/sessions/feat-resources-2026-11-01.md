## 2026-11-01 — Resources: one list of what we can run work on

- Owner 01:0x: "i want to add all what we have in di.iiii … resources all kind of". New contract `shared/resources/resourceModel.mjs` (`di.resources/1`: six kinds, states with proof, who may use, best-for jobs, secret-value guard, `bestFor` pick) and page renderer `scripts/resources/render-resources.mjs`; example file `shared/resources/example.resources.json` (made up).
- Decision record: `docs/ai/decisions/2026-11-01-resources-one-list.md`. The team's real file stays private (this repo is public): di-atlas `resources/resources.json`.
- Tests: `npx vitest run resourceModel render-resources` — 17 passed. Screenshots light/dark, desk/phone on the agent screen.
- Not done here: a space door for a private file (`space-code-push.mjs --from <dir>`), a timer that re-checks states.
