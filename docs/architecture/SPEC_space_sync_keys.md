# Spec — Space Sync Keys (per-space, self-serve editor tokens)

Status: **DRAFT — for security-auditor review before any code.**
Owner: Backend/API + Security. Relates to: the "linked space" sync method (`scripts/space-sync.mjs`, `di-space.json`).

## 1. Goal

Let a logged-in space owner generate, in the di.iiii UI, a **scoped token** they paste into
their GitHub repo as `DI_SPACE_TOKEN`, so the repo's sync workflow can update that one space —
**without** anyone editing server env vars or handling the admin token.

Non-goal (this spec): the keyless GitHub App / webhook flow, and bidirectional (space → repo) sync.
Those are later and out of scope here.

## 2. Why this is low-surface

The server already resolves auth through a single function:

- `serverXR/src/config.js` → `config.auth.resolveIdentity(token)` returns
  `{ role, subject, label, spaces }` or `null` (currently a `Map` lookup over static env tokens).
- `serverXR/src/index.js` (~line 319) reads the `Authorization: Bearer` header, calls
  `resolveIdentity`, and the existing middleware enforces **role** and **space scope**
  (`identity.spaces`, already used by `EDITOR_ALLOWED_SPACES`).

So scoped editor identities **already exist and are already enforced.** Sync keys just add a
*dynamic source* of identities. The only change to the hot auth path is: on a static-table miss,
also check the sync-keys table.

## 3. Threat model → defense

| # | Threat | Defense |
|---|--------|---------|
| T1 | Key leaks (committed, logged, shoulder-surfed) | Blast radius = **editor on ONE space**. No admin, no space-management, no other spaces, no accounts, no platform secrets. |
| T2 | Leaked key used to attack platform / other spaces | Reuse existing `spaces` scope → identity is `spaces:[thisSpaceId]`; existing enforcement rejects everything else. Role `editor` only (cannot delete space / change ownership). |
| T3 | Key used to mint more keys or escalate | Mint/list/revoke require a **logged-in OAuth session cookie**, never a bearer token. Tokens are leaves, never roots. |
| T4 | Key keeps working after it should be dead | `revoked` flag + optional `expiresAt`; `lastUsedAt` surfaced in UI; **Revoke** is immediate. |
| T5 | Defaced space | Sync is **one-way repo→space**; repo is source of truth → revoke + re-sync restores. The key **cannot write to GitHub**. Worst case = temporary, reversible defacement of one space. |
| T6 | Token theft from storage | Store **only a hash** of the secret; plaintext shown **once**, never retrievable. Constant-time compare. |

## 4. Data model

New table `space_sync_keys`:

| column | notes |
|--------|-------|
| `id` | public key id (the `keyId` in the token) — non-secret, indexed |
| `space_id` | the one space this key edits |
| `owner_user_id` | the OAuth user who minted it (authz for list/revoke) |
| `secret_hash` | `sha256(secret)` — high-entropy token, fast hash is sufficient |
| `label` | user-facing name ("github-actions") |
| `created_at`, `last_used_at` | observability |
| `expires_at` | optional |
| `revoked` | boolean, default false |

## 5. Token format

```
dii_sync_<keyId>.<secret>
         └─ stored in clear (lookup)   └─ only sha256 stored
```

- `keyId` lets us fetch exactly one row (no hash-scan per request).
- `dii_sync_` prefix → detectable by GitHub secret-scanning **and** the repo's own pre-commit
  scanner (br_id_ge already scans for secrets). Consider registering a secret-scanning pattern.

## 6. Auth integration (the one hot-path change)

Extend `resolveIdentity(token)` (or wrap it):

```
resolveIdentity(token):
  if static Map has token: return it          # unchanged
  if token startswith "dii_sync_":
     parse keyId.secret
     row = db.get(space_sync_keys where id=keyId and not revoked and not expired)
     if row and constantTimeEq(sha256(secret), row.secret_hash):
        touch row.last_used_at                 # async, best-effort
        return { role:'editor', subject:`sync-key:${keyId}`,
                 label: row.label, spaces:[row.space_id] }
  return null                                  # fail closed
```

No change to enforcement — the returned identity flows through the existing role/space checks.

## 7. Endpoints (session-auth only — NOT token-auth)

- `POST   /api/spaces/:spaceId/sync-keys`  → mint (requires owner session); returns plaintext **once**
- `GET    /api/spaces/:spaceId/sync-keys`  → list (id, label, created, lastUsed, expires; never the secret)
- `DELETE /api/spaces/:spaceId/sync-keys/:id` → revoke

Authz: caller's OAuth session must own (or admin) `:spaceId`. Rate-limit `POST`.

## 8. UI

A **Sync / Deploy** panel in space settings, built with the existing `preferences-*` design
system (canonical admin styling — no parallel chrome). Generate → show key once with **Copy** +
a deep link to the repo's Actions-secrets page + the literal secret name `DI_SPACE_TOKEN`.
List existing keys with last-used + **Revoke**. (Shipping this updates `src/wiki/wikiContent.js`.)

## 9. Rollout (safe order)

1. Build + exercise entirely on the **local** server; prod auth untouched.
2. **Security-auditor review** of: the `resolveIdentity` change, the session-only mint authz,
   constant-time compare, fail-closed paths, rate-limiting.
3. Ship to prod with sync-keys as the **only** CI path; admin token never enters CI.

## 10. Open questions for the auditor

- Hash choice: `sha256` for a 256-bit random secret — agree it's sufficient vs. HMAC-with-server-secret?
- Default `expires_at` (e.g. 1 year) vs. non-expiring with explicit revoke?
- Per-space key cap + mint rate limit values?
- Should `lastUsedAt` writes be sampled to avoid a write per sync request?

## 11. Implementation & audit resolution (built + tested, local only)

Status: **IMPLEMENTED on local server**, all audit findings resolved, 22/22 server
contract tests still pass. Not on prod, not committed.

Files:
- `serverXR/src/db.js` — `space_sync_keys` table (FK to spaces, `ON DELETE CASCADE`).
- `serverXR/src/syncKeyStore.js` — mint / resolve / list / revoke; sha256-hashed secret,
  constant-time compare, sampled `last_used_at`, fail-closed.
- `serverXR/src/index.js` — `getAuthState` consults sync keys only on a static-table miss
  and only for the `dii_sync_` prefix; 3 routes with an owner/admin-only in-handler guard.

| Audit finding | Resolution |
|---|---|
| HIGH — keyed flow must be update-only, never space-create | **Already enforced:** `POST /api/spaces` requires a *session* (tokens blocked), so a sync key cannot create spaces. Publish (`PATCH /api/spaces/:id`) is admin-only → engine's publish step is now **best-effort** (skips on 403; content still updates). Space is created/published once by the owner. |
| MEDIUM — canonical space-id scope | Mint stores the **resolved canonical** space id; scope checks reuse the existing `canAccessSpace` path. Verified: key for `br_id_ge` works on `br-id-ge`, denied elsewhere. |
| MEDIUM — no escalation | Mint/list/revoke guarded by `requireSpaceOwnerOrAdmin` (admin or owning **session** only). Verified: a valid sync key gets **403** on mint. |
| MEDIUM — secret hygiene + hot path | Plaintext shown once in the mint response, never in list; only the hash is stored/logged. `last_used_at` is async + sampled (≤1/min), never blocks auth. |
| LOW — SQL / fail-closed / detectability | Parameterized statements throughout; revoked/expired/bad-secret all resolve to `null`; `dii_sync_` prefix gates the DB hit; default `expires_at` = 1 year. |

Verified end-to-end (local): mint → scoped update works → other-space denied (403) →
escalation denied (403) → list (no secret) → revoke → revoked key rejected (401) → list empty.

Remaining before prod: security-auditor sign-off on the diff, the **UI panel**
(`preferences-*` design system) + wiki entry, and unit tests in `syncKeyStore.test.js`.
