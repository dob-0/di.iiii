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

| scope | how it is made | lifetime | what it may do on ITS ONE space |
|---|---|---|---|
| `edit` (every key minted before this, and every key minted without asking) | `POST /api/spaces/:id/sync-keys` as today | 1 year | exactly what it could before: editor on that space (§6, §12). Nothing changes for existing keys. |
| `manage` | the same route with `{ "manage": true }`, **only by a person who signed in** (§13.4) | **90 days** (owner, 2026-10-07) | everything `edit` may, plus the four project actions below, and nothing else |

A manage key's id starts with `m` (`dii_sync_m…`); an edit key's id is hex only. The scope is always read from
the key's row; the mark exists only so a client can tell a manage key from its text and refuse to send it over
plain http before it leaves the machine (§13.4).

The four actions a `manage` key adds, each through the route a person uses (no new write path):

1. **Move a project to the trash** — `DELETE /api/projects/:id`, the soft delete: the project, its files and its log
   stay for 30 days and come back with one restore. Never a purge (no purge route is reachable by a key; the trash
   sweep is the server's own, after 30 days). Never the space's front door (409).
2. **Restore it** — `POST /api/projects/:id/restore`. Already allowed to every editor of the space, `edit` keys
   included, before this change (the route checks the space scope only). Unchanged; recorded in the key log when a
   key does it.
3. **Make a project private** — `PATCH /api/projects/:id` with `{ visibility: "private" }`. **Never public**: showing
   work to every visitor is the owner's call, and a leaked key that can only hide things exposes nothing.
4. **Move a project between two spaces** — `POST /api/projects/:id/move`, only when ALL of these hold (review C1;
   owner, 2026-10-07); otherwise 403 with "do this signed in":
   - the bearer is a `manage` key of the space the project is in (the route's scope gate checks it reaches it), and
     the body's `alsoSyncKey` is a `manage` key of the space it goes to;
   - the two spaces have the **same, non-empty owner** (`ownerUserId`), and both keys belong to that owner (a manage
     key stores the space's owner as its `owner_user_id` at mint, whoever minted it). A space with no owner (made by
     the admin token, a sandbox) never takes a key's move — fail closed;
   - **nobody new gains access**: the space it goes to is a `normal` space; if the project is not private, it is not
     open to visitors unless the source is too; every account the destination is shared with (its owner, its trusted
     list, every account whose scope lists it) is also one of the source's; and the destination has no live or used
     invite link and no live sync key other than the move's own second key — the holders of those cannot be counted,
     so they are treated as newcomers;
   - the body does not ask to `unpublish` (that changes a space's front door).

What a `manage` key can **never** do, on any space: purge or empty the trash; change the space itself (label,
isPublic, front door, owner, trusted list); mint, list, revoke or undo keys or invites; read the key log; make
anything public; act on any other space; move a project where somebody new could see it. Those routes check
`isSpaceOwnerOrAdminState`, which a sync key never satisfies — that function is **not** changed. The four actions
above use `canManageProjectsState` = `isSpaceOwnerOrAdminState(...) OR (a sync key whose scope is manage AND whose
space is this one)`, and the move adds the checks in item 4 (`keyMoveWidensAccess` in index.js).

### 13.3 Where it is enforced (one auth path)

- `syncKeyStore.resolveSyncKey` returns the key's `scope`, `ownerUserId` and `expiresAt` with its space (column
  `scope TEXT NOT NULL DEFAULT 'edit'`; an older row reads as `edit`).
- `getAuthState` (index.js) builds the sync-key identity exactly as before (role `editor`, `spaces: [its space]`)
  and adds `manageSpaces: [its space]` only for a `manage` key. The second key of a move is read in the same
  function, by the same `resolveSyncKey`, **only** for `POST /api/projects/:id/move` and only behind a sync key; it
  is taken from the JSON body (`alsoSyncKey`) and deleted from the body at once, so nothing downstream can echo or
  log it (review L4: proxies redact `Authorization`, not custom headers — the earlier `X-Di-Sync-Key-Also` header is
  no longer read). It must itself be a `manage` key; it is kept apart (`alsoSyncKey`) and is not added to `spaces`,
  so it grants no read, write or editor right. A second key that does not resolve makes the request
  unauthenticated (fail closed).
- The four routes call `canManageProjectsState` where they called `isSpaceOwnerOrAdminState`. Nothing else does.

### 13.4 Who can mint one (T3 holds)

`manage: true` (and the undo, §13.7) is honoured only for a **person who signed in**: a session (type `session`,
not a guest) whose subject is a real account row (OAuth or password) and that was not made from a token, or the
owner at the machine (`local-owner`, `localOwner.js`), or a server with auth switched off (where every request is
already admin). Refused with `403 manage_needs_session`:
- every bearer token, the static `ADMIN_API_TOKEN` included, and every sync key;
- a session made from a token (`POST /api/auth/session {token}`): it is stamped `via: 'token'` in the signed cookie,
  kept through every refresh (review H1). One made before the stamp existed has no account row (its subject is
  the token's configured subject), so it is refused by the account check.

**When the admin token is rotated:** keys already minted are not touched — an `edit` key minted with the old token
stays valid until it expires or is revoked (the key list and `di invite SPACE --revoke` take them back); no manage
key can have been minted with it. Rotating the token does not revoke keys; revoking keys is the key list's job.

On a personal install the person at the machine is the owner, so `di invite <space> --manage` works there. Note
(review I4): on a `DI_LOCAL` install *any* local process counts as the owner at the machine — that is the existing
rule for every admin route, not new here. On a hosted di.iiii (dev.diiii.xyz) a manage key is minted from the
owner's signed-in browser session; **there is no sync-key panel in the interface yet** (§8 is still owed).

**A manage key never travels in the clear.** `di follow` refuses `--from http://…` with a manage key to any other
machine — a LAN, Tailscale, `--insecure` or not — and a follower given one over http does not start and says why
(`follower.js cleartextManageRefusal`; loopback is the only exception). The server cannot tell TLS behind every
proxy, so this refusal is the client's; the key's `m` mark makes it possible before the first request.

### 13.5 Limits on the host (not only on the follower)

The follower refuses more than 5 trashes in one pass and never empties a copy (SPEC_follow.md guard 3). The host
does not trust that; it counts per key, from the key's own action log (so a restart does not reset it), and checks
and records each of the three limited actions under a per-key lock (trash, move and — review L1 — make private):

| action by one key | per hour | per 24 hours |
|---|---|---|
| move to the trash | 10 | 30 |
| move to another space | 10 | 30 |
| make private | 30 | 100 |
| restore | not limited (it is the undo) | — |

Over the limit the host answers `429` with `code: "sync_key_limit"`, the action, the limit and when it frees up.
The limits hold within one server process; two processes on one database are never supported (PR #728).

### 13.6 The key's action log (who, what, when)

Table `sync_key_actions` (id, key_id, key_label, space_id, action, project_id, to_space_id, also_key_id, outcome,
reason, at). Every manage action a key attempts — done or refused — and every restore by a key is one row; a move
names its second key too. The owner reads it with `GET /api/spaces/:id/sync-keys/actions` (owner or admin;
`?key=<id>` narrows it to one key, as bearer or as second key) and `di invite <space> --actions`. Done actions and
refusals are read apart and merged, so refusals never push a done action out of view. **Refusals are capped**
(review M2): at most 100 per key and 5,000 in all, the oldest dropped first; a done row is never dropped by a cap.
All rows older than 180 days are removed. The log never holds a secret: the key id is the public half.

### 13.7 Undo in one action

`POST /api/spaces/:id/sync-keys/:keyId/undo` or `di invite SPACE --undo KEYID` (a person who signed in, §13.4):
**revokes the key, then**, for the last thing the key did to each project:
- **trashed:** restored, while it is still in this space's trash and was not trashed again since;
- **made private:** made public again only while the key's own change is still the project's latest visibility
  change (the project keeps a strictly increasing `visibility_at`; the key's row records it). **Never more public
  than the owner's current choice** (review M1): any later change, by anyone, leaves it as it is and says so;
- **moved** (as the bearer, out of this space, or as the second key, into it): moved back to where it came from,
  while it is still where the key put it. Both spaces have the one owner (§13.2), so the owner can always do it.

It answers with what it did and what it did not, and why; each step is written to the log. A purged project
(after 30 days) cannot come back; the 30 days are the window.

### 13.8 Threats added (as the code holds them)

| # | Threat | Defence |
|---|---|---|
| T7 | A `manage` key leaks | Worst case on its one space: projects moved to the trash (≤ 10 an hour, ≤ 30 a day) or made private (≤ 30 an hour). Nothing is destroyed: the trash keeps everything 30 days. It reads nothing the `edit` key could not. It cannot move a project out on its own (a move needs a second manage key of the same owner). The owner sees it in the key's log and undoes it in one action, which revokes the key. The key dies by itself after 90 days. |
| T8 | Two `manage` keys of the same owner leak together (a follower's follows.json holds one per followed space) | Projects moved between those two spaces (≤ 10 an hour), only where nobody new gains access (§13.2 item 4). The undo of either key moves them back. A key of **another** owner never pairs with it (review C1: an account anyone can register cannot be the second key). |
| T9 | A `manage` key used to publish or expose | Making a project public, the space's own settings and `unpublish` stay owner-or-admin. A key's move is refused into a space open to visitors (unless the project is private or the source is open too), into a space shared with an account the source is not shared with, or into one with invite links or other keys out. |
| T10 | A key or a token mints a `manage` key, or upgrades itself | Mint needs a person who signed in (§13.4): bearer tokens, sync keys and sessions made from a token are refused. The scope is fixed at mint; no route changes it. |
| T11 | A second key smuggled in to widen a request | `alsoSyncKey` is read only on the move route, only behind a sync key, must itself be a valid `manage` key of the same owner, and is not added to the editor scope. A bad one fails the request closed. It travels in the body, not a header a proxy might log. |
| T12 | Mass trash or log flooding through many requests | Host-side counts per key under a per-key lock (§13.5), from the persistent log; refusals capped so they cannot hide done actions or grow the table (§13.6); the follower's own 5-per-pass and never-empty guards on top. |
| T13 | A manage key sent over plain http and sniffed | Refused by the client before it is sent, on any network (§13.4). |
| T14 | A lying (or intercepted) host makes the follower take back its own trash | The follower believes a trash made on the host only once the host's trash lists it (SPEC_follow.md). |

### 13.9 Review resolution (independent security review of #811, 2026-10-07)

| finding | resolution | guard |
|---|---|---|
| C1 critical: a stranger's manage key as the second key moves a project out; undo could not bring it back | same owner on both spaces and both keys; nobody new gains access; undo moves back as bearer or second key | `syncKeyManage.review.test.js` C1 (two tests, non-admin owner); `syncKeyManage.test.js` move cases |
| H1 high: the admin token becomes a session that mints a manage key | token sessions stamped `via:'token'`; mint and undo need a real account row or `local-owner` | review H2 test; "a token never can through a session made from it" |
| M1: undo published a project the owner hid again | exact `visibility_at` comparison | review M4 test; undo test `rehidden` |
| M2: refusals buried the done actions and grew without end | refusal caps; done rows listed apart | review M5 test; "caps a key's refusals" |
| L1: make-private budget outside the lock | under `withKeyLock` | review M3 race test (80 parallel → ≤ 30) |
| L2: manage key over cleartext LAN | refused by `di follow` and the follower, any network but loopback | `follower.test.js`, `followFiles.test.js` |
| L3: lying host undoes the follower's trash | trash-there confirmed against the host's trash | code path in `follower.js`; no dedicated test yet (owed: a fake-host harness) |
| L4: second key in a custom header | moved into the move's JSON body, deleted on read | "the old header is not read at all" |
| L5: one owner sees another's key activity | moot after C1 (both spaces share an owner) | — |
| I5: lifetime | manage keys 90 days (owner, 2026-10-07); `di follows` warns 14 days before | `followFiles.test.js` |

### 13.10 Open questions

- The interface panel (§8, §13.4) is owed; until it lands, minting on a hosted di.iiii needs a signed-in session
  calling the API. The sync light (PR #724) should show the same 14-day warning `di follows` shows (the follow
  state carries `key.expiresAt` and `key.expiresSoon`).
- `di invite --manage` prints the key to the terminal, the 10-05 leak path (review I5); writing it to a 0600 file or
  a pairing step is owed.
- Many installs follow dev with their own keys; a destination space that other installs follow has other keys out,
  so a key-made move into it is refused and the owner moves it signed in. A per-holder identity for keys would let
  the server count those holders; owed if this proves too strict.
