# Shelf routes keep to the caller's space (2026-10-04)

Branch `fix/shelf-routes-space-scope-2026-10-04`, from `origin/dev` 56ea6eea. Finding F8 of
`docs/ai/audits/follow-audit-2026-10-04.md`.

**This hole is also on the live site.** It is on `main` (diiii.xyz) and on dev until this branch is landed and promoted.
Until then a leaked sync key or space-scoped editor token can rename or delete shelves in other spaces. Deleting a shelf
loosens its projects; it does not delete work.

- Cause and fix: see the `docs/ai/known-fixes.md` row. One middleware in `serverXR/src/index.js`.
- Sweep: every `/api` route with a path parameter other than `:spaceId`/`:projectId` was listed. Only the two collection
  routes lacked a space gate. The others are admin-only (`/api/commons/assets/:assetId` DELETE, users, open-calls,
  app-visitors), local-operator only (agent-runs, agent-board), account-owned (ai chats, dm devices), or read-only.
- Test: `shelfScopeContracts.test.js`, auth on, real server. Before the fix: 4 passed, 1 failed (cross-space PATCH
  returned 200). After: 5 passed; `npm run test:server-contracts` 198 passed in 11 files.
- Owed: a run against a real per-space sync key (the test uses `EDITOR_ALLOWED_SPACES`, the same scope check). A
  non-existent shelf id answers 404 to every caller who passes the role gate; scoped callers get 404, not 403.
