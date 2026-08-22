## 2026-08-22 — a guest cookie lasts the week it claims, and uploads are counted per person

- The auth cookie always stamped `config.authSession.ttlMs` (12h) no matter what ttl the
  session was actually minted with, while guest sessions are minted for
  `GUEST_SESSION_TTL_MS`. The signed payload claimed a week, the browser dropped the
  cookie overnight, and every returning guest came back as a new subject — new sandbox,
  and any space grant redeemed from an invite gone with it. `setAuthSessionCookie` now
  takes the ttl, and the two guest-minting call sites pass the one they used. All six
  minting sites were audited; account and OAuth sessions keep their 12h, which is what
  their payload claims.
- The guest week is absolute from issuance, not rolling — the session re-sync never fires
  for a guest, so the cookie is never refreshed. Fine for a six-day workshop; a longer one
  would need the guest to re-enter.
- `uploadLimiter` used the default address key, so 60 uploads per 10 minutes was the budget
  for an entire NAT — a room full of people on one venue wifi shared one bucket and the
  first few uploaders spent everyone's. It now keys on the session subject, falling back to
  the address for callers with no subject. With `REQUIRE_AUTH` off every caller shares the
  `auth-disabled` sentinel, so that type falls back too rather than putting a whole server
  in one bucket. `createRateLimiter` gained a `scope` string so the 429 stops blaming
  "this address" for a per-session count.
- Both guards were watched failing against the unfixed code before being accepted.

Still undone, found while here and deliberately out of scope: **no client code handles a
429 anywhere**. `apiClient.js` never reads `Retry-After`, Studio's `importAssetFiles` has
no catch so a throttled import dies silently mid-batch, and `useAssetPipeline.js` tells the
user to check their connection when the connection is fine.
