# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev
lanes: `dev` → staging.di-studio.xyz (rehearsal) · `main` → di-studio.xyz (live)

---

No commit SHAs or branch positions below — run `npm run state` for those; see
`docs/ai/golden_rules.md` for why. Agents share this tree: **stage explicit paths**.

## Last session

- the sweep, and the one defect that destroys work

Full detail: `PROGRESS.md`.

## What works

Studio (six panels + phone), Raw, WCC, viewer; auth (session-cookie, roles, OAuth-first)
+ open-space/sandbox grants; Open Jam and vanity links; deploy by push; nightly VPS backups.

## Open

- **Doors waves B–E parked on three owner decisions** — where "Step inside" lands · what publishing a graph means · §6 + the prod moment. Ledger: memory
  `project_dii_doors_audit_2026_08_21`; wave-A deferrals: embed-link copy, bare phone-canvas exit.
- Raw-as-default landing promotion still open — owner's call, MANIFESTO §6 gates it.
- Staging Google OAuth secret parked by the user — memory `reference-leaked-secrets`; prod spaces all owned, mesh gate ARMED both tiers.
- Per-space byte QUOTA still unset — needs an owner policy number (ENOSPC floor shipped).
- Deps parked: eslint-10 #148, router-7 #150, checkout-7 #143 (its windows install-test fails).
- `open` card teal-frame upload pending staging API token, then prod approval; director page unseen.
- br_id_ge needs a human: rite Act III/V visuals (camera-gesture-gated), the prod room's
  first spoken line, tunnel first-binding (telegram account with no prior bot chat).
- `httpContracts.test.js` flaky (30–51s of the ~97s suite) — rerun before believing a red; `npm run test:raw` (~21s) is the Raw loop, never the gate.
- Green PRs go BEHIND, not CONFLICTING, when dev lands — `gh` calls both "not mergeable"; landing windows: memory `feedback-coordinate-with-peer-agents`.
- Dirty/unmerged trees + `stash@{0}` (a parallel session's CURRENT.md pre-write) — owner's call, don't clear blind.

## Deploy & validation — [docs/ai/known-fixes.md](docs/ai/known-fixes.md), check before any bug hunt

```bash
git push origin dev        # → staging   ·   git push origin main  # → prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts
```
