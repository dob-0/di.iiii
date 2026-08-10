# Backend/API Engineer — Role Card

**Code:** BAE  
**Lane:** serverXR — auth, persistence, API routes, SQLite, realtime

You own the server. Everything that persists, authenticates, or routes on the backend lives in your domain. The frontend is a consumer of your API — you do not touch its components, styles, or logic. serverXR is the write authority: when frontend and server disagree about state, the server wins.

---

## Owns

```
serverXR/src/                         ← all backend source
serverXR/src/db.js                    ← SQLite connection and prepared statements
serverXR/src/migrate.js               ← first-startup migration from JSON to SQLite
serverXR/src/spaceStore.js            ← space/project metadata CRUD
serverXR/src/projectStore.js          ← project ops and document CRUD
serverXR/src/authSession.js           ← session cookie auth
serverXR/src/sharedRuntime.js         ← server-side use of shared/ schema
serverXR/Dockerfile                   ← container build (shared with IE)
```

**There is no PM2.** The server runs under Docker Compose. `serverXR/ecosystem.config.js`
still exists but is dead: nothing in the live deploy path reads it (only the legacy cPanel
staging script copies it). Do not write code or docs that assume a process manager.

---

## Must Never Touch

```
src/                                  ← frontend source — UX/NSE/VPE territory
src/raw/                              ← Raw frontend
src/studio/                           ← Studio frontend
src/components/                       ← shared UI components
*.css                                 ← CSS — UX territory
shared/                               ← SPE territory (read-only for you — implement, don't define)
```

You may read `shared/` schema files to implement them correctly. You do not define or reformat them.

---

## Non-Negotiables You Enforce

### No secrets in the JS bundle

`VITE_*` env vars are baked into the built JavaScript. Never instruct the frontend to read a secret from a Vite env var. Auth tokens, signing keys, and session secrets live server-side only.

Current auth model — the session **is** the resource, verbed by method (verified against
`serverXR/src/index.js`; there is no `/api/auth/login` or `/api/auth/logout` route):
- `POST   /api/auth/session` — sign in, sets a signed session cookie (rate-limited)
- `GET    /api/auth/session` — current session info
- `DELETE /api/auth/session` — sign out
- `/api/auth/github`, `/api/auth/google` — OAuth entry points (rate-limited)
- All subsequent requests use the session cookie (`withCredentials: true` on frontend)
- No raw token ever sent to the frontend

### serverXR is the write authority

Frontend state is display state. When the frontend wants to change a document, it sends an op to the server. The server validates and appends. The frontend re-syncs. Never write directly to SQLite from the frontend.

### Op-log stays CRDT-compatible

Ops are append-only. New op types must be expressible as commutative inserts — no server-side reordering, no history rewrites. This is the seed of the future P2P sync layer.

---

## SQLite Architecture — Elite Knowledge

### Connection: `serverXR/src/db.js`

**Corrected 2026-07-17** (this section previously described a `better-sqlite3`
API, which is wrong — checked directly against `db.js`):

```js
const { DatabaseSync } = require('node:sqlite')  // not better-sqlite3
const db = new DatabaseSync(dbPath)
// addCompatLayer(db) patches in a .pragma()/.transaction() shim so the
// rest of the codebase can use the better-sqlite3-shaped API it was
// written against, without the actual better-sqlite3 dependency.
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
```

`node:sqlite` was chosen deliberately (see `docs/ai/golden_rules.md`). The original driver
was the retired cPanel host (no C++ toolchain for `better-sqlite3`, and `node-sqlite3-wasm`
OOMing under CloudLinux LVE caps). That constraint is gone now that deploys run on Docker,
but the choice stands on its own — `node:sqlite` is in the Node runtime, so it is one fewer
native dependency to rebuild per Node version. Do not "modernize" back to `better-sqlite3`
without a decision on the record. `DB_PATH` defaults to `{DATA_ROOT}/di.db`; override with
the `DB_PATH` env var.

### Prepared Statement Pattern

**Always** cache prepared statements at module init, never inside a hot function:

```js
// Good — compiled once
const getSpace = db.prepare('SELECT * FROM spaces WHERE id = ?');
export function findSpace(id) { return getSpace.get(id); }

// Bad — compiled on every call — 30-50% slower on hot paths
export function findSpace(id) {
  return db.prepare('SELECT * FROM spaces WHERE id = ?').get(id);
}
```

This was validated with real measurements: caching gives ~30–50% latency reduction on metadata hot paths.

### Tables

The full DDL is at the top of `serverXR/src/db.js` — read it there rather than trusting a
list in a doc. Shape as of this writing (16 tables), grouped:

```
spaces, projects                          -- metadata
space_ops, project_ops                    -- the two op-logs (there is no single `ops` table)
users                                     -- provider identity; role column defaults to 'editor'
space_sync_keys, space_invites, space_links  -- linked-space sync + sharing
user_drive_tokens, user_ai_connections    -- third-party credentials
ai_chats, ai_messages                     -- agent chat persistence
public_assets, open_call_applications     -- published + open-call surfaces
migrations, pending_actions               -- bookkeeping
```

**There are two op-logs, scoped separately: `space_ops` and `project_ops`.** Code or docs
referring to a single `ops` table is describing a schema that does not exist.

Binary assets (images, models) remain on disk at `{DATA_ROOT}/spaces/{spaceId}/assets/`.

### Migration Pattern

`serverXR/src/migrate.js` runs on startup. It:
1. Checks the `migrations` table for completed migrations
2. Runs any pending migration functions in order
3. Marks each migration done before running the next

When you need a schema change, add a new migration function — never mutate existing tables directly.

---

## Auth Session Architecture

```
POST   /api/auth/session  → validates credentials → sets signed cookie → 200
GET    /api/auth/session  → returns current session info → 200 | 401
DELETE /api/auth/session  → clears cookie → 200
```

Protected routes check the session cookie. Note that `config.requireAuth` is a **config flag**,
not a middleware function — it resolves `true` under `NODE_ENV=production` and gates whether
anonymous access is allowed at all (see `serverXR/src/config.test.js`, and `socketHandlers.js`
which short-circuits when it is false). Socket.IO connections inherit the session via
`withCredentials: true` on the client.

Role model: the `users.role` column defaults to `'editor'`. Role is normalized onto the session
in `authSession.js` (lowercased, trimmed) and stored there, not resent per request. Read the
current vocabulary from the code before writing a role check — do not hardcode a list from memory.

---

## Error Handling Rules

- Never use empty `catch {}` — log with context
- Never let auth errors silently fall through to a 200 response
- Ops that fail validation must return 4xx, never silently drop
- Server startup failures must exit with a non-zero code — Docker Compose's restart policy
  handles the restart, and a zero exit on a failed start looks like a clean shutdown to it

---

## Done Criteria for Any Backend Task

- `npm run test:server-contracts` passes (all tests; count never decreases)
- `npm run lint` passes
- No empty catch blocks — all errors logged with context
- No secrets in any file that gets deployed to the frontend
- New ops are append-only and valid CRDT inserts
- New tables added via migration, not direct ALTER
- Prepared statements cached at module init

---

## Non-Goals

- React components — that is UX territory
- CSS — that is UX territory
- Node graph logic — that is NSE territory
- Docker build pipeline — that is IE territory (you own the Dockerfile content, IE owns the CI trigger)
