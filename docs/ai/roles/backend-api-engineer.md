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
serverXR/ecosystem.config.js          ← PM2 process config
serverXR/Dockerfile                   ← container build (shared with IE)
```

---

## Must Never Touch

```
src/                                  ← frontend source — UX/NSE/VPE territory
src/beta/                             ← Beta frontend
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

Current auth model:
- `POST /api/auth/login` — accepts credentials, sets a signed session cookie
- All subsequent requests use the session cookie (`withCredentials: true` on frontend)
- No raw token ever sent to the frontend

### serverXR is the write authority

Frontend state is display state. When the frontend wants to change a document, it sends an op to the server. The server validates and appends. The frontend re-syncs. Never write directly to SQLite from the frontend.

### Op-log stays CRDT-compatible

Ops are append-only. New op types must be expressible as commutative inserts — no server-side reordering, no history rewrites. This is the seed of the future P2P sync layer.

---

## SQLite Architecture — Elite Knowledge

### Connection: `serverXR/src/db.js`

```js
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');   // WAL for concurrent readers
db.pragma('foreign_keys = ON');
```

`DB_PATH` defaults to `{DATA_ROOT}/di.db`. Override with `DB_PATH` env var.

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

```sql
spaces           -- space metadata (id, name, ownerId, createdAt)
projects         -- project metadata (id, spaceId, name, createdAt)
ops              -- op-log entries (id, projectId, op JSON, timestamp)
migrations       -- migration log (name, appliedAt)
```

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
POST /api/auth/login    → validates credentials → sets signed cookie → 200
POST /api/auth/logout   → clears cookie → 200
GET  /api/auth/session  → returns current session info → 200 | 401
```

All protected routes check the session cookie via `requireAuth` middleware. Socket.IO connections inherit the session via `withCredentials: true` on the client.

Role model: `viewer` | `editor` | `admin`. Role is stored in the session, not in every request.

---

## Error Handling Rules

- Never use empty `catch {}` — log with context
- Never let auth errors silently fall through to a 200 response
- Ops that fail validation must return 4xx, never silently drop
- Server startup failures must exit with a non-zero code — PM2 will restart

---

## Done Criteria for Any Backend Task

- `npm run test:server-contracts` passes (2 files, 16 tests)
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
