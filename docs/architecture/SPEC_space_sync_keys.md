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

## 12. The key also carries files (2026-09-20)

A sync key held by `di follow` now moves **project asset bytes** as well as ops: it reads
`GET /api/projects/:pid/assets/:id` on the host and may call the hash-pinned
`PUT /api/projects/:pid/assets/:sha256`, which stores without the EXIF scrubber **only** when the
bytes hash to the id. Same scope (editor, that one space); ordinary editors get 403 on that route.
Reasoning and limits: [SPEC_follow_files.md](SPEC_follow_files.md).

## 13. The `manage` scope — a follower's trash, privacy and move reach the host (2026-10-07)

Status: **DRAFT — for security-auditor review.** Built behind this spec on branch
`feat/sync-key-manage-scope-2026-10-07` (stacked on PR #800), scratch servers only; not on dev, not on prod.
The owner said yes to the idea on 2026-10-07 (ledger row N204). The design below was written before the code.

### 13.1 Why

`di follow` (SPEC_follow.md) carries a project's trash, restore, rename, privacy and move from the host to a
follower. The other way it carries only a rename: on the host, moving a project to the trash, changing who sees it
and moving it to another space are owner-or-admin, and a sync key is an editor (T1, T2). So a project the owner
trashes on his own install stays live on dev, and the two copies stop being one. The fix is not to make every key
stronger. It is a second, **opt-in** scope that the owner gives to one key, for one space, on purpose.

### 13.2 What a key can be

| scope | how it is made | what it may do on ITS ONE space |
|---|---|---|
| `edit` (every key minted before this, and every key minted without asking) | `POST /api/spaces/:id/sync-keys` as today | exactly what it could before: editor on that space (§6, §12). Nothing changes for existing keys. |
| `manage` | the same route with `{ "manage": true }`, **from a signed-in session of the space's owner or an admin** (or the owner at the machine, `di invite <space> --manage`) | everything `edit` may, plus the four project actions below, and nothing else |

The four actions a `manage` key adds, each through the route a person uses (no new write path):

1. **Move a project to the trash** — `DELETE /api/projects/:id`, the soft delete: the project, its files and its log
   stay for 30 days and come back with one restore. Never a purge (there is no purge route a key can reach; the trash
   sweep is the server's own, after 30 days).
2. **Restore it** — `POST /api/projects/:id/restore`. (Already allowed to every editor of the space, `edit` keys
   included, before this change — the route checks the space scope only. Unchanged, so existing keys keep their
   rights; recorded in the key's log when a key does it.)
3. **Make a project private** — `PATCH /api/projects/:id` with `{ visibility: "private" }`. **Never public.** Making
   a project public shows it to every visitor of the space; that is a publishing decision and stays the owner's.
   The reason for the asymmetry is the leaked-key case: a leaked key that can only hide things can embarrass no one
   and leak nothing; one that can publish can expose work that was private on purpose. The space's front door cannot
   be made private (the route's own 409, unchanged).
4. **Move a project between two spaces** — `POST /api/projects/:id/move`, only when the request proves `manage` on
   **both** spaces: the bearer key is a `manage` key of one of them and the `X-Di-Sync-Key-Also` header carries a
   `manage` key of the other. A key is scoped to one space by design (T2), so a move needs two keys, the same way it
   needs the owner of both spaces from a person.

What a `manage` key can **never** do, on any space: purge or empty the trash; trash, rename, publish or change the
settings of the space itself (label, isPublic, front door); mint, list or revoke keys or invites; add members or
change ownership; make anything public; act on any other space. Those routes check `isSpaceOwnerOrAdminState`,
which a sync key never satisfies — that function is **not** changed; the four actions above use a new check,
`canManageProjectsState`, which is `isSpaceOwnerOrAdminState(...) OR (a sync key whose scope is manage AND whose
space is this one)`.

### 13.3 Where it is enforced (one auth path)

- `syncKeyStore.resolveSyncKey` returns the key's `scope` with its space (new column `scope TEXT NOT NULL DEFAULT
  'edit'`; an older row reads as `edit`).
- `getAuthState` (index.js) builds the sync-key identity exactly as before (role `editor`, `spaces: [its space]`)
  and adds `manageSpaces: [its space]` only for a `manage` key. The second key of a move is read in the same
  function, by the same `resolveSyncKey`, only when the bearer is itself a sync key; it is kept apart
  (`alsoSyncKey`) and widens nothing but the move route's check — it is not added to `spaces`, so it grants no
  read, write or editor right on the second space. A second key that does not resolve makes the whole request
  unauthenticated (fail closed).
- The four routes call `canManageProjectsState` where they called `isSpaceOwnerOrAdminState`. Nothing else does.

### 13.4 Who can mint one (T3 holds)

`manage: true` is honoured only when the minting request is a **signed-in session** (type `session`, not a guest)
of the space's owner or an admin, or a server with auth switched off (where every request is already admin, so the
key adds nothing on that server). A bearer token — the static `ADMIN_API_TOKEN` included, and every sync key — gets
`403 "a manage key is minted from a signed-in session of the space's owner"`. Tokens stay leaves: no token can make
a stronger token. The scope is fixed at mint; to change it, mint a new key and revoke the old one.

On a personal install the person at the machine is the owner (`localOwner.js`), so `di invite <space> --manage`
works there. On a hosted di.iiii (dev.diiii.xyz) a manage key is minted from the owner's signed-in browser session;
**there is no sync-key panel in the interface yet** (§8 is still owed), so today that means the API from a signed-in
session. The panel, with a "may trash, hide and move projects" checkbox that is off by default, is owed.

### 13.5 Limits on the host (not only on the follower)

The follower already refuses more than 5 trashes in one pass and never empties a copy (SPEC_follow.md guard 3). The
host does not trust that; it counts per key, from the key's own action log (so a restart does not reset it):

| action by one key | per hour | per 24 hours |
|---|---|---|
| move to the trash | 10 | 30 |
| move to another space | 10 | 30 |
| make private | 30 | 100 |
| restore | not limited (it is the undo) | — |

Over the limit the host answers `429` with `code: "sync_key_limit"`, the action, the limit and when it frees up
("this key has moved 10 projects to the trash in the last hour, the most a key may; the space's owner can, or wait
41 min"). The refusal is logged in the key's action log too. A manage key may also not move the space's front door
to the trash (`409`, "unpublish it first" — the owner's job).

### 13.6 The key's action log (who, what, when)

New table `sync_key_actions` (id, key_id, key_label, space_id, action, project_id, to_space_id, outcome, reason,
at). Every manage action a key attempts on a project — done or refused, and every restore by any key — is one row.
The owner reads it with `GET /api/spaces/:id/sync-keys/actions` (owner or admin, like the key list) and `di invite
<space> --actions`; the key list (`GET …/sync-keys`, `di follows` on the follower) shows each key's scope. Rows older
than 180 days are removed when new ones are written. The log never holds a secret: the key id is the public half.

### 13.7 Undo in one action

`POST /api/spaces/:id/sync-keys/:keyId/undo` (owner or admin, session-only like mint): **revokes the key, then**
restores every project this key moved to the trash that is still there, makes public again every project it made
private that is still private and was public before, and moves back into this space every project it moved out
that is still where it put it (when the caller may move it). It answers with what it did and what it could not, and
each step is written to the action log. A purged project (after 30 days) cannot come back; the 30 days are the window.

### 13.8 Threats added

| # | Threat | Defence |
|---|---|---|
| T7 | A `manage` key leaks | Worst case on its one space: projects moved to the trash (≤ 10 an hour, ≤ 30 a day), or made private (≤ 30 an hour). Nothing is destroyed: the trash keeps everything 30 days. The owner sees it in the key's log and undoes it all with one action (§13.7), which also revokes the key. No reading of anything the `edit` key could not already read. |
| T8 | Two `manage` keys of the same owner leak together (a follower's follows.json holds one per space) | Projects moved between those two spaces (≤ 10 an hour). Both spaces are the owner's; nothing leaves them, nothing becomes public, and §13.7 moves them back. |
| T9 | A `manage` key used to publish or expose | Not possible: making a project public, the space's own isPublic and front door all stay owner-or-admin (`isSpaceOwnerOrAdminState`, unchanged). |
| T10 | A key (or a bearer token) mints a `manage` key, or upgrades itself | Mint with `manage` needs a signed-in session (§13.4); the scope is fixed at mint, there is no route that changes it. |
| T11 | A second key smuggled in to widen a request | `X-Di-Sync-Key-Also` is read only when the bearer is a sync key, must itself be a valid `manage` key, is not added to the editor scope, and only the move route reads it. A bad one fails the request closed. |
| T12 | Mass trash through many requests | Host-side counts per key (§13.5), from the persistent log; the follower's own 5-per-pass and never-empty guards on top. |

### 13.9 Open questions for the auditor and the owner

- The limits in §13.5 are a first guess sized to "a person tidying a space"; the owner may want them lower.
- Restore was already open to every editor key before this (§13.2 item 2). Keep (it is the undo), or make it
  `manage`-only? Kept here, because changing it would take a right away from existing keys.
- Should a `manage` key expire sooner than a year (e.g. 90 days)? Proposed: same year as other keys; the owner can
  revoke any time and the undo revokes.
- The interface panel (§8, §13.4) is owed; until it lands, minting on a hosted di.iiii needs a signed-in session
  calling the API.
