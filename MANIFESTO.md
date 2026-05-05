# di.i Manifesto

This document is the permanent record of what di.i is, what it is becoming, and what cannot be traded away. Read it before making product or architecture decisions. Update it when a fundamental truth changes — not when a task changes.

---

## What It Is

di.i is a spatial authoring platform for immersive XR experiences.

It lets creators build, publish, and share 3D scenes — in the browser, on the web, in AR and VR. The core loop is: open a space, compose a scene, publish it to a URL, experience it in XR.

The main shipped surface is **Studio**: project-based, inspector-driven, collaborative.  
The future-facing surface is **Beta**: node-graph-first, recursive, composable.

---

## Where It Is Going

The long-term direction is **decentralized and creator-owned**:

- **Assets** → content-addressed by SHA-256, compatible with IPFS pinning
- **Scenes** → stored as CRDT op-logs, mergeable without a central server
- **Sync** → WebRTC P2P mesh, no mandatory relay
- **Auth** → self-hostable, no account required for local use
- **Publish** → a scene is a hash, not a server URL

This is the "heritage collection for future generations" direction. A scene published today should be retrievable in 30 years without a running server.

The current architecture (SQLite, session cookies, Socket.IO) is the right foundation to ship from now. Each decision should be a step toward the decentralized direction, not away from it.

---

## Non-Negotiables

These are hard constraints. They do not bend for scope, timeline, or a bad prompt.

### 1. No tokens in the JS bundle
API tokens, session secrets, and auth credentials are never baked into the frontend JavaScript. They belong in server-side environment variables and session cookies. If a build embeds a secret, it is a security incident.

### 2. Creator owns the data
Scenes, assets, and project documents belong to the creator. The platform is self-hostable. A migration path off the platform must always exist.

### 3. The op-log stays CRDT-compatible
The op-log format must remain append-only and conflict-resolvable. Do not introduce mutations that require a lock, a central authority, or a rewrite of history. This is the seed of the future P2P sync layer.

### 4. Asset IDs move toward content-addressing
New asset storage should use or be compatible with SHA-256 content hashes, not random UUIDs. Do not introduce new ID schemes that break this path.

### 5. serverXR is the authority
Auth, persistence, publish state, and realtime presence live in `serverXR/`. Frontend state is display state, not storage authority. Do not duplicate write logic in the client.

### 6. Studio is the main lane
Beta is experimental and intentionally unstable. Product work, bug fixes, and default UX improvements go to Studio. Do not ship experimental Beta behavior as the default user experience.

### 7. shared/ is the canonical schema layer
`shared/` and `src/shared/` hold the runtime contracts. Do not fork schema logic into Studio or Beta. Do not skip the shared layer for convenience.

---

## What This Platform Is Not

- A generic 3D tool or game engine
- A centralized SaaS-only product
- A monolithic app that requires our servers to function
- A platform where Beta behavior is the default shipped experience
- A platform where secrets live in the browser

---

## Architectural Seeds (Plant, Don't Rush)

These are not immediate tasks. They are directions to preserve headroom for:

| Seed | Current state | Direction |
|------|--------------|-----------|
| Asset IDs | `crypto.randomUUID()` | SHA-256 of file content |
| Op-log format | append-only JSON ops | CRDT-compatible (Yjs candidate) |
| Realtime sync | Socket.IO relay | WebRTC P2P mesh |
| Storage | SQLite + filesystem | IPFS pinning for scene + assets |
| Auth | Session cookies + tokens | Keyless / local-first as option |

---

## Voices That Count

Decisions that touch the non-negotiables need the voice of the product owner (Gevorg). Don't redesign auth, storage format, publish model, or the decentralization path from a single task prompt.

---

## Solved Shortcuts (Operational Memory)

When a task is solved, write a short reusable solution note so the next session does not re-research the same path.

Minimum note format:

- Problem
- Short way (exact steps that worked)
- Verification (how it was proven)
- Source files or commands used

Keep it brief and actionable. Capture the path that worked, not a long narrative.

### Shortcut: Smart Staging Deploy (No Guesswork)

- Problem: Deploy request arrives while the branch has uncommitted or mixed-scope changes.
- Short way:
	1. Never deploy from a dirty worktree unless explicitly approved.
	2. Commit only the intended deploy scope (or clearly approved full scope), then deploy from that commit.
	3. Run `npm run deploy:staging` from `dev` only.
	4. Verify publish pipeline status, then run staging smoke checks.
- Verification:
	- `git status --short --branch` shows clean worktree before deploy.
	- `gh run list --workflow publish-cpanel-prebuilt-v2.yml` shows the latest staging publish succeeded.
	- `npm run deploy -- smoke staging` passes.
	- `https://staging.di-studio.xyz` and `https://staging.di-studio.xyz/serverXR/api/health` respond correctly.
- Source files or commands used:
	- `scripts/deploy.mjs`
	- `CURRENT.md` deploy commands
	- `npm run deploy:staging`
	- `npm run deploy -- smoke staging`

### Shortcut: Staging Not Fresh After Push

- Problem: staging site still serves an old build or throws runtime errors after staging was updated.
- Short way:
	1. Check publish workflow result for `publish-cpanel-prebuilt-v2.yml`.
	2. If `Publish target branch` fails with missing `deploy/cpanel/cpanel.prebuilt.yml`, restore that file.
	3. Commit and run `npm run deploy:staging`.
	4. Confirm `origin/cpanel-staging` moved to a newer commit.
- Verification:
	- Workflow conclusion is `success`.
	- `git ls-remote --heads origin staging cpanel-staging` shows updated prebuilt branch head.
	- Staging browser path loads node palette and node inspector without the prior runtime error.
- Source files or commands used:
	- `deploy/cpanel/cpanel.prebuilt.yml`
	- `.github/workflows/publish-cpanel-prebuilt-v2.yml`
	- `npm run deploy:staging`
	- `gh run list --workflow publish-cpanel-prebuilt-v2.yml`

---

### Shortcut: White Screen / TDZ Crash in Production (`Cannot access X before initialization`)

- Problem: App loads fine locally and in dev build, but production build shows a white screen or console `TDZ` / `Cannot access 'X' before initialization` errors.
- Root cause: `vite.config.js` `manualChunks` was missing drei peer deps (`detect-gpu`, `maath`, `camera-controls`, `@monogrid/gainmap-js`, `@react-spring/three`). Those deps landed in `vendor`, imported `three`, creating a `three-vendor → vendor → three-vendor` circular init order that only crashes in production (SES/lockdown environments).
- Short way:
	1. Open `vite.config.js`.
	2. In `manualChunks`, confirm ALL of the following are in the `three-vendor` group: `three`, `three-mesh-bvh`, `three-stdlib`, `@react-three/*`, `@react-spring/*`, `troika-*`, `camera-controls`, `detect-gpu`, `maath`, `@monogrid/gainmap-js`, `meshoptimizer`, `meshline`.
	3. Run `npx vite build` — output must show **no** `circular dependency` warning.
- Verification: `npx vite build` clean, white screen gone on staging.
- Source files: `vite.config.js`

---

### Shortcut: Auth Hangs / Infinite Spinner on Load

- Problem: App shows a spinner that never goes away, especially when the backend is slow or unreachable.
- Root cause: `getApiSession()` fetch had no timeout — it hung indefinitely on network failure.
- Short way: `useAuthSession.js` wraps the fetch in `AbortController` with an 8 000 ms timeout. `apiClient.js` `apiFetch` accepts and forwards a `signal` option.
- Verification: Kill the backend, reload — spinner disappears after ≤8 s and shows a Retry button.
- Source files: `src/hooks/useAuthSession.js`, `src/services/apiClient.js`, `src/components/AuthGate.jsx`
