# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev
lanes: `dev` → staging.di-studio.xyz (rehearsal) · `main` → di-studio.xyz (live)

---

No commit SHAs or branch positions below — run `npm run state` for those; see
`docs/ai/golden_rules.md` for why. Agents share this tree: **stage explicit paths**.

## Last session

- the badge that advertised the work by covering it
- the dark theme's secondary text was below the readability floor, and nothing could have told us
- "where did my cube go", and the phone topbar that had already lost its ⋯
- the crossing from Studio to Nodes landed on a screen that said the work was gone

Full detail: `PROGRESS.md`.

## What works

Studio (six panels + phone), Raw, WCC, viewer; auth (session-cookie, roles, OAuth-first)
+ open-space/sandbox grants; Open Jam and vanity links; deploy by push; nightly VPS backups.

## Open

- **PROD IS BEHIND** — everything of 2026-08-22/23 sits on staging only; prod still serves the retired three-door landing. Owner promotes after checking staging.
- Doors waves B–E: publishing-a-graph, §6 and where "Step inside" lands are all DECIDED and shipped; what remains is embed-link copy. Ledger: memory `project_dii_doors_audit_2026_08_22`.
- Walk / Fly cannot render a node graph, so it is hidden on a node room — the honest gap.
- `stash@{0}` (a sibling session's CURRENT.md pre-write) is still parked — owner's call, don't clear blind.
- **Sharing the bare domain previews as an Express error page** — `/og/*splat` never matches an empty splat; the fallback card already exists (`ogRoutes.js:108-119`). Smallest fix on the list, worst symptom.
- Staging Google OAuth secret parked by the user — memory `reference-leaked-secrets`; prod spaces all owned, mesh gate ARMED both tiers.
- Per-space byte QUOTA still unset — needs an owner policy number (ENOSPC floor shipped).
- Deps parked: eslint-10 #148, router-7 #150, checkout-7 #143 (its windows install-test fails).
- `open` card teal-frame upload pending staging API token, then prod approval; director page unseen.
- br_id_ge needs a human: rite Act III/V visuals (camera-gesture-gated), the prod room's
  first spoken line, tunnel first-binding (telegram account with no prior bot chat).
- `httpContracts.test.js` flaky (30–51s of the ~97s suite) — rerun before believing a red; `npm run test:raw` (~21s) is the node loop, never the gate. Green PRs go BEHIND, not CONFLICTING, when dev lands (`gh` calls both "not mergeable") — landing windows: memory `feedback-coordinate-with-peer-agents`.

## Deploy & validation — [docs/ai/known-fixes.md](docs/ai/known-fixes.md), check before any bug hunt

```bash
git push origin dev        # → staging   ·   git push origin main  # → prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts
```
