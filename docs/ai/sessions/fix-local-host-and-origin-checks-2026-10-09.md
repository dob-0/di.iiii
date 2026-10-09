## 2026-10-09 — local servers answer only their own names and pages, and "this machine" reads proxy headers

- New `serverXR/src/localRequest.js`: one place for three questions a local server
  (`DI_LOCAL=1`, or `NODE_ENV` not production) asks about a request.
  - **From this machine?** `requestFromThisMachine`: the socket is loopback and every
    proxy on the way says the client is too — no `X-Forwarded-For`, or one whose every
    hop is loopback (Express `trust proxy: 'loopback'`, as in `proxyTrust.js`). Any other
    client-address header (`Forwarded`, `X-Real-IP`, `CF-Connecting-IP`, `True-Client-IP`…),
    CDN marks (`Via`, `CDN-Loop`, `CF-Ray`), or forwarding details without
    `X-Forwarded-For` mean "not this machine". The agent board, the local Claude chat
    backend (`isLocalOperatorRequest`) and the dev-only routes (`requireDevLocal`) use it.
  - **Addressed to one of its names?** A Host allowlist in the shape of Vite's
    `server.allowedHosts`: IP addresses, `localhost`, `*.localhost` (so `diiii.localhost`
    and every `<tree>.diiii.localhost`), the machine's host name and `.local` name, the DNS
    names on `TLS_CERT`, the hosts in `CORS_ORIGINS`, and `DI_ALLOWED_HOSTS`
    (comma-separated, leading dot = the name and everything under it, `*` = any).
    Other names get `403 host_not_allowed`, logged once per name.
  - **Which page sent a write?** POST/PUT/PATCH/DELETE from a browser are taken from the
    server's own page (`Sec-Fetch-Site: same-origin|none`), a page on this machine, or a
    configured name (`Origin`, OWASP CSRF cheat sheet: Fetch Metadata + standard headers).
    No `Origin` and no `Sec-Fetch-Site` = not a browser (di CLI, `di follow`, curl):
    unchanged. The public cross-origin routes (open-call applications, inscriptions) keep
    their own rule. A hosted server (production without `DI_LOCAL`) passes straight through.
- `/api/agent-runs` (all four routes) now also needs the server's own page
  (`requireDevLocalOwnPage`): `Sec-Fetch-Site: same-origin`, or an `Origin` on this machine
  from a browser without Fetch Metadata.
- CORS with no `CORS_ORIGINS` on a non-production server: only this machine's origins
  (localhost, `*.localhost`, 127/8, `::1` — Vite's own default), not every origin.
- Tests: `localRequest.test.js` (18), `localRequestContracts.test.js` (real server as
  `di up` runs it, plus a hosted one), `routes/agentRunRoutes.test.js`, and new cases in
  `agentBoardStore.test.js`, `proxyTrust.test.js`, `config.test.js`. The contract file is in
  `npm run test:server-contracts`.
- **Owed before this reaches an install behind a front door:** every name a front door sends
  to the installed di must be in `DI_ALLOWED_HOSTS` (aylmo's gateway sends
  `lights.thedi.studio`, `raw.thedi.studio`, `tools.thedi.studio` — `local.thedi.studio` is
  on the certificate). The gateway's `switch` should write it next to `DI_BEHIND_PROXY`.
