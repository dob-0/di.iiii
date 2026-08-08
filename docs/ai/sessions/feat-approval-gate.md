# feat/approval-gate — session notes

## 2026-08-08 — human-approval gate for admin-level writes (+ review fixes)

- New `serverXR/src/approvalGate.js`: gated routes call `gateOrApply` instead of
  their store function directly. Gate disabled (default) → executes immediately,
  behavior unchanged. Enabled → the intent is stored as a `pending_actions` row,
  route answers 202, and nothing runs until di-bo returns a matching decision
  (intent hash echoed back, authorization re-derived at execution time). Fails
  closed: bot unreachable → expires denied; enabled-but-unconfigured → 503.
- Deploy wiring: `APPROVAL_GATE_ENABLED` / `APPROVAL_BOT_URL` /
  `APPROVAL_SHARED_SECRET` pass through compose.
- Review fixes (PR #102): the fail-loud net was inert — mounted via
  `router.use('/api', …)` Express stripped the prefix, so the registry's
  `^/api/…` patterns never matched. Now mounted bare (router-relative path) and
  the net evaluates `bodyTest`, so ordinary space PATCHes don't trip it; the
  registry + `SENSITIVE_SPACE_PATCH_FIELDS` moved into `approvalGate.js` (one
  source, imported by `index.js` and `routes/spaceRoutes.js`). The blocked-path
  response was also rebuilt on end/write interception — the old writeHead hook
  called `res.end` from inside an end call (ERR_INTERNAL_ASSERTION). Regression:
  `serverXR/src/approvalGate.test.js` mounts the router exactly as production
  does and pins gated-match / body-gated / fail-loud behavior.
- Still genuinely undone: di-bo side of the decision flow ships separately (the
  bot must echo `intentHash` and sign with the shared secret); gate stays
  disabled everywhere until that lands.
