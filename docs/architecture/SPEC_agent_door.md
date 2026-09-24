# Spec — The agent door (one catalogue, one MCP, keys per person)

Status: **DRAFT, 2026-09-24.** Owner's direction, same day: *"a smart MCP — when we grow, our
MCP grows in parallel, full control of every kind of thing, to save time and credits"*, and the
point of it: *"how people can work and push the server for what they need without harming the
system."*

Relates to: `sdk/` (the moves and `reach`), `SPEC_space_sync_keys.md` (the key this generalises),
`serverXR/src/approvalGate.js`, `serverXR/src/contentProposals.js`.

## 1. What it is, and what it is not

**It is** one catalogue of everything serverXR can do, generated from and checked against the
server itself. The MCP server is a thin door onto that catalogue, and a person's agent comes
through that door with a key that can do only what that person can do, capped lower if they choose.

**It is not** a second MCP server (it replaces `sdk/mcp.mjs` in place), not a hand-written tool per
route, and not a way for any agent to reach prod beyond what its key allows.

## 2. The rule underneath: the server is the only line

The MCP runs on the caller's machine, so the caller can edit it. **Every check that matters is
made by serverXR, per request, per key.** Checks in the MCP (confirm prompts, the
`DI_MCP_ALLOW_PUBLIC` switch) are a courtesy that saves a wasted call. They are never the
protection. This is MANIFESTO's "serverXR is the only write authority" applied to agents.

## 3. Method and sources

| Part | Established practice it follows |
|---|---|
| The catalogue | **OpenAPI 3.1** (JSON Schema 2020-12 for inputs); reach and role as `x-di-*` extensions. MCP tool `inputSchema` is JSON Schema too, so nothing is translated twice. |
| Few tools, loaded on demand | Anthropic Engineering, *Code execution with MCP* (2025-11) and *Advanced tool use* (tool search, 2025-11); Cloudflare, *Code Mode* (2025-09). Search, then describe, then call, instead of loading ~170 schemas into every conversation. |
| The protocol | MCP spec **2026-07-28** (per-request `_meta`, `server/discover`), dual-era with 2025-11-25 `initialize`, via the official SDK **`@modelcontextprotocol/server` 2.1.0**, pinned exact. The hand-rolled JSON-RPC in `sdk/mcp.mjs` echoes any requested version back, which the spec forbids, and it predates the 2026-07-28 change. |
| Credentials on stdio | MCP spec, Authorization §Protocol Requirements: *stdio implementations SHOULD NOT follow [OAuth] and instead retrieve credentials from the environment.* |
| Credentials over HTTP (phase 3) | MCP spec Authorization: OAuth 2.1 resource server, RFC 9728 protected-resource metadata, RFC 8707 audience-bound tokens, no token passthrough. |
| Keys per person | Least privilege, NIST SP 800-53 **AC-6**; the shape of GitHub fine-grained personal access tokens (per-resource, expiring, revocable, hashed at rest); OWASP API Security Top 10 2023 **API1** (object-level authorisation), **API5** (function-level authorisation), **API4** (resource consumption). |

## 4. The catalogue (phase 1)

- **Where:** `serverXR/src/catalogue/`: the OpenAPI document, built from per-area entry files.
  Each entry: `summary`, `input` (JSON Schema), `x-di-reach` (`read` | `private` | `public`),
  `x-di-role` (the minimum role the route already demands) and `x-di-agent` (`yes` | `never`).
- **Grows in parallel, enforced:** a contract test boots serverXR, walks the live Express router
  and fails when a live route has no entry, or an entry names a route that no longer exists. A new
  route cannot land undescribed.
- **Undeclared is closed:** a route with no entry, or marked `x-di-agent: never` (accounts, admin,
  key minting, approval decisions, webhooks), is refused to agent keys.
- **Served live:** `GET /api/catalogue` returns the entries the caller's identity can reach. The
  MCP reads it at start, so an MCP talking to an older or newer server always matches that server.
- **Debt is named:** phase 1 describes the space, project, scene and asset routes in full. Every
  other route still gets an entry, `x-di-agent: never`, so the test passes honestly and the count
  of closed routes is printed as debt, not hidden.

## 5. The MCP (phase 1)

Four tools, plus the existing SDK moves as named shortcuts, because they encode the traps listed
in `sdk/README.md`:

| tool | does | reach |
|---|---|---|
| `di_find` | search the catalogue by words; returns names and one-line summaries only | read |
| `di_describe` | one entry in full: input schema, reach, an example | read |
| `di_call` | run one catalogue entry | the entry's |
| `di_run` | run several calls in order in one tool call, with later steps able to use earlier results; stops at the first failure and reports what did and did not happen | the highest of its steps |

Each result carries both text and `structuredContent`. Lists are paged (`limit`, `cursor`).
Annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) come from the
entry. Tier and key come from the environment or `~/.config/di/credentials.json`, never a repo.

## 6. Keys per person (phase 2): the part that protects the system

A generalised sync key. A person signed in with a **session** mints an **agent key**:

- **Acts as that person, never more.** Its identity is the person's own, so every existing check
  (role, space scope, owner/trusted, proposals) applies unchanged. It is capped lower by choice:
  a list of spaces, and a reach ceiling of `read` or `private`.
- **Never public.** A `public` move (open a space, mint an invite, delete) is refused to every
  agent key. It goes back to the person in the app, or through the approval gate. There is no flag
  that lifts this for a key.
- **Never a root.** A key cannot mint, list or revoke keys, change accounts, roles or config, or
  answer an approval. Those demand a session.
- **Leaves a name on everything.** Every op it writes carries author = the person, via = the key's
  label. History → Restore undoes it. An untrusted person's changes to someone else's space go
  through `contentProposals` exactly as they would by hand.
- **Bounded.** Hashed at rest (sha-256, constant-time compare), shown once, expiring (default 30
  days; the person can choose shorter), revocable at once, `lastUsedAt` shown. Rate-limited per
  key, not per IP.
- **Enforced in one place.** A router-level guard looks up the matched route's catalogue entry and
  refuses (403, with the entry's reach and the key's ceiling named in the body) anything above the
  key's ceiling, anything undeclared, anything `x-di-agent: never`.

## 7. Remote door (phase 3)

The same catalogue served over MCP Streamable HTTP from serverXR itself, so a person connects
from claude.ai with nothing installed. It requires the OAuth 2.1 flow in the MCP Authorization
spec, with the agent key as the access token's substance. It is written here so phase 2 does not
build anything phase 3 must undo, and it is not started.

## 8. Measured, not claimed

Before any phase is called done:

1. **Context cost:** tokens of the `tools/list` result, old `sdk/mcp.mjs` vs new, counted with the
   Anthropic token-counting endpoint on the same model.
2. **Coverage:** routes described vs live routes, from the contract test.
3. **Does it work:** 10 read-only evaluation questions (`sdk/evals/di.xml`, per the mcp-builder
   evaluation guide), answered by a model through the old server and the new, against the local
   tier. Score and tool calls per answer.
4. **Does it hold (phase 2):** a test per refusal in §6, each driven through a real key against a
   booted server, not a unit mock.

## 9. Owed and open

Measured at phase 1 (2026-09-24):

- **Install weight:** the SDK adds 15.8 MB to an installed `serverXR/node_modules`
  (7.7 MB `@modelcontextprotocol`, 8.1 MB `zod`; 81 MB total). The downloaded
  artifact does not change — dependencies come from npm at first install, which
  already needs the registry (`project_di_cli` gap). Much of it is source maps;
  trimming is possible and not done.
- **Context before the first question:** 4 tools / 3,303 bytes, against the old
  server's 17 tools / 7,088 bytes. Token counts need the Anthropic counting
  endpoint and an API key this machine does not have — bytes are the measure.

Security findings the catalogue review surfaced (not changed on this branch):

1. **`GET /api/trash` answered anyone** — reproduced: anonymous, auth on, 9 trashed
   projects from 5 spaces. On `main` since 2026-09-10. Fixed on its own branch,
   `fix/trash-scope`.
2. **Trusted people change without the gate** — `trustedUserIds` is not in
   `SENSITIVE_SPACE_PATCH_FIELDS` (`serverXR/src/approvalGate.js`), so granting
   direct write applies at once while `isPublic`/owner changes wait.
3. **NDI routes have no identity check** — `/ndi/*` is guarded by
   `requireLocalRuntime` only; anyone on the LAN (when LAN devices are allowed)
   can create or kill a stage output.
4. **DM routes** have no role layer, only per-handler session checks.
5. **`GET /api/events`** decides admin inside the handler (empty 200 to others),
   and **`POST /api/integrations/google-drive/disconnect`** no-ops without a user
   instead of refusing — both lean on shapes that could change underneath them.
6. **The `/api` read gate only runs for routes with a `:spaceId`/`:projectId`
   param.** Any route taking a space only as a query parameter skips it — the
   class finding 1 belongs to.

Still open:

- `di` (the CLI) is still not on the SDK core (`sdk/README.md`, Honest limits).
- The lighting desk is one opaque handler (`desk.handle`), invisible to the
  route walk; its API needs its own table before agents can reach it.
- Reach is per route: `PATCH /api/spaces/:spaceId` is public because it can be.
- Phase 3's authorisation server is real work, not a switch.
