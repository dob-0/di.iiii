# Live Collaboration Testing

This guide reflects the current stable collaboration contract in the repo.

## Current Product Truth

- `LIVE_SYNC_FEATURE_ENABLED=true` is the intended baseline for this pass.
- Socket.IO is used for collaborator presence.
- Durable shared scene updates happen through ServerXR scene ops plus SSE catch-up.
- Manual publish/reload still exists for full-scene overwrite flows and asset-heavy handoff.
- Read-only spaces must reject write attempts at the server/API layer with `403`.

## Automated Coverage

Run the full suite from the repo root:

```bash
npm test
```

Relevant targeted tests:

- `serverXR/src/httpContracts.test.js`
  - production-default auth when `REQUIRE_AUTH` is unset
  - non-production write access when `REQUIRE_AUTH` is unset
  - root-mount health checks when `APP_BASE_PATH=''`
  - read-only rejection for scene ops, direct scene overwrite, live endpoint mutation, and asset upload
- `serverXR/src/socketHandlers.test.js`
  - socket path normalization for root, `/serverXR`, and custom base paths
- `src/hooks/useSpaceSocket.test.js`
  - client socket path derivation for root and nested API bases
- `src/hooks/useRealtimeCollaboration.test.jsx`
  - collaborator presence remains available while socket scene emitters stay disabled
- `src/hooks/useLiveSync.test.jsx`
  - local scene edits emit granular ops
  - remote ops apply without looping back into re-submits
  - missed ops are caught up when the event stream is ready
- `src/hooks/useSceneInitializer.test.jsx`
  - local hydration restores `renderSettings`
- `src/hooks/useSceneHistory.test.jsx`
  - undo/redo restores full-scene snapshots, not only object arrays

## Manual Verification

### 1. Two-browser live editing check

1. Start the client and ServerXR.
2. Open the same space in two browser windows.
3. Confirm the status panel shows presence connectivity and collaborator names.
4. Add or move an object in one browser.
5. Confirm the object appears in the second browser without a manual reload.
6. Toggle a shared world/render setting such as background color or shadows.
7. Confirm the second browser reflects that change live.

### 2. Read-only enforcement

1. Open a server-backed space.
2. Lock editing for that space.
3. Attempt to publish, upload an asset, or send other write operations.
4. Confirm the server rejects the request instead of relying on hidden UI controls alone.

### 3. Local reload persistence

1. Change world/render settings such as shadows, antialiasing, grid visibility, or background color.
2. Refresh the page.
3. Confirm the local scene restores those settings.

### 4. Explicit server publish flow

1. Make scene changes in a server-backed space.
2. Use `Publish to Server`.
3. Reload the space from the server in another session or after a refresh.
4. Confirm the published scene matches the saved state and remains the authoritative full-scene snapshot.

## Deployment Path Checks

Verify the client and server agree on the socket path for each deployment shape:

- Root deployment: `APP_BASE_PATH=''` and Socket.IO at `/socket.io`
- Default subpath deployment: `APP_BASE_PATH='/serverXR'` and Socket.IO at `/serverXR/socket.io`
- Custom subpath deployment: Socket.IO must follow `<APP_BASE_PATH>/socket.io`

If REST requests work but presence does not connect, check that the reverse proxy forwards the matching Socket.IO path rather than only the REST API routes.
