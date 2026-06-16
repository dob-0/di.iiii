# WCC Merge Plan

World Creative Commons (`wcc-space` branch) is a major feature addition authored by Emilya Anikoghosyan.

**Status as of June 2026:** 79 commits ahead of `main`, ~297 files changed.

## What WCC adds

- Artist portfolio space with collaborative authoring
- `wcc-space` as a distinct di.iiii space type
- New UI components for WCC-specific workflows
- (Audit in progress — full scope TBD)

## Merge strategy

### Phase 1 — Audit (before any merge)

- [ ] Read all new `serverXR/src/` routes in `wcc-space` — verify each route enforces session-cookie auth (no public endpoints that bypass `requireAuth`)
- [ ] Confirm no new op-log writes happen server-side (all mutations must be client-initiated and append-only)
- [ ] Check for any new file upload endpoints — validate MIME type filtering and path sanitization match existing `serverXR/src/projectStore.js` patterns
- [ ] Identify which of the 297 changed files are platform-level vs. space-content-level
- [ ] Check `shared/projectSchema.cjs` — if WCC added new node types, verify the CJS mirror was updated to match

### Phase 2 — Staging integration

- [ ] Merge `wcc-space` into a `wcc-integration` branch off `dev`
- [ ] Run full validation: `npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts`
- [ ] Boot with Docker and manually verify auth, space load, op-log, and publish flow
- [ ] Check no regressions in Studio / Beta / V1 lanes

### Phase 3 — Main merge

- [ ] Merge `wcc-integration` → `staging` → `main` via normal branch flow
- [ ] Tag release
- [ ] Notify Emilya of merge

## What stays on `wcc-space` vs. lands on `main`

| Feature | Land on main? | Notes |
|---------|--------------|-------|
| WCC space type + UI | Yes | Core feature |
| WCC-specific serverXR routes | Yes, after audit | Must pass auth review |
| Artist portfolio content | No | Space content, not platform code |
| Any WCC-only config files | Evaluate per file | Don't merge personal dev tooling |

## Non-goals for this merge

- Do not refactor Studio or Beta code as part of the WCC merge
- Do not merge any tooling, scripts, or CI changes from the fork without explicit review

## Contact

- Emilya Anikoghosyan — wcc-space author — coordinate merge timing with her
- Gevorg (dob-0) — platform owner — approve all serverXR route changes
