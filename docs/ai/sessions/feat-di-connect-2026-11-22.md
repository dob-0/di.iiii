## 2026-11-22 — `di connect`: one sign-in, every space the person owns or edits, followed on this machine

- Device grant (RFC 8628) gets a `connect` scope; `/device` lists the person's own spaces (all ticked) and "Connect this machine" sends the ticked ids; the poll returns one editor sync key per space, once (minted at the poll, hash stored, never logged). `cliTokenGate.js` unchanged.
- `di connect` follows each space; a local space of that name holding projects the host lacks is skipped and named. `di disconnect` ends the connect keys (`POST /api/auth/connect/revoke`) and stops those follows; deletes no work.
- Tests: serverXR/src/connectContracts.test.js (7), scripts/di/connect.test.js (11), DeviceLoginPage.test.jsx (+4). Not run on dev or a second machine; no deploy.
