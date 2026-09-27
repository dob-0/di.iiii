## 2026-09-24 — the agent door: one catalogue of every route, four MCP tools on the official SDK

- Owner's direction: an MCP that grows with the platform, gives full control, saves time and
  credits, and lets people push the server for what they need without harming it. Spec first:
  `docs/architecture/SPEC_agent_door.md` (sources, three phases, measurements, owed list).
- **Catalogue:** `serverXR/src/catalogue/` describes all 166 live routes (summary, reach, least
  role, agent yes/no, inputs). `routeWalk.js` records sub-router mounts because Express 5 forgets
  them; `catalogueContracts.test.js` boots a real server and fails on any undeclared route, stale
  entry or broken rule. `GET /api/catalogue` serves OpenAPI 3.1 filtered to the caller; `?all=1`
  (admin) adds coverage. 55 routes open to agents after review; account/auth/admin/keys/approvals/
  webhooks/streams/rig, br_id_ge's inscription rite, the GitHub link, DM identity and Drive-account
  import stay closed.
- **MCP:** `sdk/mcp.mjs` rebuilt on `@modelcontextprotocol/server` 2.1.0 (pinned exact, root and
  serverXR — an install resolves it from `serverXR/node_modules`), serving MCP 2026-07-28 and the
  2025-era handshake. Four tools (`sdk/door.js`): di_find, di_describe, di_call, di_run; moves and
  routes share one namespace; `pick` returns only the named fields. The old server echoed any
  protocol version back — known-fixes row + guard.
- **Measured** (`sdk/evals/RESULTS.md`, one run each): 9/10 vs the old server's 6/10, 75 tool calls
  vs 89, $1.05 vs $1.49, half the time. Without `pick` the same questions cost 209 calls — the
  scene documents are larger than the answer cap.
- Found by the catalogue review, not changed here: anonymous `GET /api/trash` (fixed separately,
  PR #566 `fix/trash-scope`), trusted people changing without the approval gate, NDI routes with
  no identity check, DM routes with no role layer. All in the spec's §9.
- Next (phase 2, the real protection for other people's agents): per-person agent keys enforced by
  serverXR — generalise `syncKeyStore.js`, never public, never a root, author on every op.
