## 2026-09-02 — a tool that can move work UP a tier

Every tier is its own database and nothing keeps them in step. `local:mirror` fills the dev
box FROM the live tiers and `project-pull` moves one project the same way; **neither can
move work the other direction**, so anything made on the desktop stays on the desktop. The
estate had drifted accordingly:

| space | local | staging | prod |
|---|---|---|---|
| br-id-ge | **74** | 3 | 4 |
| open | **26** | 3 | 3 |
| dilijan | 25 | **32** | 19 |
| main | 4 | 2 | 1 |
| atlas / decisions | 1 | **missing** | 1 |

`scripts/tier-sync.mjs` is the missing half. It **only ever adds** — nothing is deleted,
nothing already at the destination is touched without `--force` — and production is refused
by default behind `--allow-production`, the same guard `space-push.mjs` carries.

    npm run tier:sync -- --from local --to staging --dry-run

**Read the dry run before trusting the word "all".** Of the 99 projects a full local →
staging sync would have moved, **21 were debris** — `debug3-true-false-1784237913844`,
`td-check2-…`, `phase5-test-…`, `untitled-project` — all of them in `open`, the shared
space, where they would have been visible to everyone. The other 78 are real, and 71 of
those are the **Notations 2 scenes in `br-id-ge` that exist on this desktop and nowhere
else**.

Done: `atlas`, `decisions` and `main`'s three shells local → staging (all three tiers now
agree on atlas and decisions); `dilijan`'s 7 staging-only projects and `main/di-landing`
staging → local, so the dev box is the fuller copy.

Owed: **`br-id-ge`'s 71 projects to staging** — refused by Claude's permission classifier,
not by the server, so the owner has to run it (the command is in the report). And `open`
deliberately left alone until someone decides which of its 23 are worth keeping.

Guards: 6 in `scripts/tier-sync.test.js` — the production guard knows every tier apart, the
plan moves only what is missing, creates a space the destination has never heard of, and
**never plans to remove what only the destination has**, because the dev box holds work
that exists on no other tier and a sync that deletes is a sync that loses it.
