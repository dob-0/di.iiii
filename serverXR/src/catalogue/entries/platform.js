// Catalogue entries: platform. Shape and rules: ../index.js.

module.exports = [
  {
    route: "GET /api/catalogue",
    summary: "the catalogue itself: every route this server answers, filtered to what the caller's role and agent access can reach",
    reach: "read",
    role: "viewer",
    agent: true
  },
  {
    route: "GET /api/admin/app-visitors",
    summary: "the guest-book of calling programs/agents seen by this server, and each one's block status",
    reach: "read",
    role: "admin",
    agent: false,
    note: "names programs and their published contacts — nobody else's business."
  },
  {
    route: "PUT /api/admin/app-visitors/blocks/:agent",
    summary: "block or unblock a calling program by its agent name",
    reach: "private",
    role: "admin",
    agent: false
  },
  {
    route: "POST /api/admin/sandboxes/purge",
    summary: "remove guest sandboxes past their TTL and archive idle account sandboxes, on demand instead of waiting for the periodic sweep",
    reach: "private",
    role: "admin",
    agent: false
  },
  {
    route: "POST /api/approvals/decision",
    summary: "record an approve/deny decision on a pending gated action",
    reach: "private",
    role: "guest",
    agent: false,
    note: "called by the inner bot (di-bo), authenticated by a shared-secret signature, not a session — sits before the /api auth gates on purpose, so it still works when the gate is what's blocking every other route for this actor."
  },
  {
    route: "DELETE /api/collections/:collectionId",
    summary: "delete a shelf — its projects come loose in the space, never deleted",
    reach: "private",
    role: "editor",
    agent: false
  },
  {
    route: "PATCH /api/collections/:collectionId",
    summary: "rename a shelf",
    reach: "private",
    role: "editor",
    agent: false
  },
  {
    route: "GET /api/commons/assets",
    summary: "browse the public commons — assets any space has shared, searchable by name",
    reach: "read",
    role: "guest",
    agent: false
  },
  {
    route: "DELETE /api/commons/assets/:assetId",
    summary: "moderation: pull an entry out of the public commons regardless of which space shared it",
    reach: "private",
    role: "admin",
    agent: false
  },
  {
    route: "GET /api/commons/assets/:assetId",
    summary: "a public commons asset's bytes, served as the file",
    reach: "read",
    role: "guest",
    agent: false,
    note: "serves the raw file body, not JSON."
  },
  {
    route: "GET /api/config",
    summary: "public deployment config: default/global space, local-install flag, auth-required flag, which addresses this server listens on, machine name",
    reach: "read",
    role: "guest",
    agent: false,
    note: "the `listen` field can include this machine's LAN address(es) — not a plain status read for the agent door."
  },
  {
    route: "PATCH /api/config",
    summary: "change the default space and/or the global shared space every guest without one lands in",
    reach: "public",
    role: "admin",
    agent: false,
    note: "setting globalSpaceId moves every future guest from their own private sandbox into one shared, editable space — config that exposes something, not a plain settings tweak. May go through the approval gate."
  },
  {
    route: "POST /api/content-changes/undo",
    summary: "undo a change notice by restoring a space to a named restore point",
    reach: "private",
    role: "guest",
    agent: false,
    note: "called by the inner bot, shared-secret signed, not session-authed — same pre-gate reasoning as /api/approvals/decision. The restore itself snapshots first, so a mistaken Undo is itself undoable."
  },
  {
    route: "GET /api/estate/map",
    summary: "the private estate map (every machine, address and store this install's owner runs) as HTML, for the admin console",
    reach: "read",
    role: "admin",
    agent: false,
    note: "names real machine addresses. 404 when ESTATE_MAP_PATH is unset (nothing is committed here), 404 when set but the file was never placed on this host."
  },
  {
    route: "GET /api/events",
    summary: "the server's recent internal event log",
    reach: "read",
    role: "guest",
    agent: false,
    note: "never refuses — a non-admin caller gets 200 with an empty events array instead of the real log, so the role floor here is data-scoping inside the handler, not a route gate."
  },
  {
    route: "GET /api/follows",
    summary: "which other di.iiii installs this one is following, and whether their ops are moving",
    reach: "read",
    role: "guest",
    agent: false,
    note: "loopback-only (127.0.0.1/::1) — a 404 to anything else, names other machines."
  },
  {
    route: "GET /api/health",
    summary: "server heartbeat: uptime, memory, node version, listen port, release info",
    reach: "read",
    role: "guest",
    agent: true
  },
  {
    route: "GET /api/open-calls/:callId/applications",
    summary: "list applications received for an open call, optionally filtered by status",
    reach: "read",
    role: "admin",
    agent: false
  },
  {
    route: "POST /api/open-calls/:callId/applications",
    summary: "submit an application to an open call (name, email, phone, city, and free-form extra fields)",
    reach: "private",
    role: "guest",
    agent: false,
    note: "public, unauthenticated, rate-limited — registered ahead of the /api auth gates like the other visitor-facing writes."
  },
  {
    route: "DELETE /api/open-calls/:callId/applications/:applicationId",
    summary: "delete an open-call application",
    reach: "private",
    role: "admin",
    agent: false
  },
  {
    route: "PATCH /api/open-calls/:callId/applications/:applicationId",
    summary: "update an open-call application's status or notes",
    reach: "private",
    role: "admin",
    agent: false
  },
  {
    route: "GET /api/stats",
    summary: "anonymized page-view aggregate stats for the last 30 days: totals, daily breakdown, top paths, top referrer hosts",
    reach: "read",
    role: "admin",
    agent: true,
    note: "no IP, user agent, cookie or session/user id is ever recorded (docs/ai/privacy-data-inventory.md) — aggregate counts only."
  },
  {
    route: "POST /api/track",
    summary: "record one anonymous page-view/signup/guest-created event",
    reach: "private",
    role: "guest",
    agent: false,
    note: "public, unauthenticated, rate-limited — registered ahead of the /api auth gates; the rate limiter's per-IP key is the only guard and is never persisted."
  },
  {
    route: "GET /api/trash",
    summary: "trashed (soft-deleted) projects, optionally filtered to one space, with the trash TTL",
    reach: "read",
    role: "guest",
    agent: false,
    note: "no role or space-scope check on this route (space is an optional query param, not a route param the auth gate resolves) — an unauthenticated caller can list trashed project titles/ids across every space by omitting ?space=. Worth a real fix, not made here."
  },
  {
    route: "GET /api/work-status",
    summary: "local dev dashboard: recent Claude Code sessions, git worktree status, open PRs/deploys for this repo, heads of CURRENT.md/PROGRESS.md/OPEN_THREADS.md",
    reach: "read",
    role: "guest",
    agent: false,
    note: "loopback-only, non-production (or DI_LOCAL=1) — 404 otherwise. Surfaces local filesystem paths, Claude session ids and the operator's own working notes, which can carry unrelated sensitive content — not a plain status read for the agent door."
  },
  {
    route: "GET /og",
    summary: "an Open Graph preview card for the platform's own front door, for link unfurling",
    reach: "read",
    role: "guest",
    agent: false,
    note: "serves an HTML page for crawlers, not JSON."
  },
  {
    route: "GET /og/*splat",
    summary: "an Open Graph preview card for a space or space/project link, for link unfurling",
    reach: "read",
    role: "guest",
    agent: false,
    note: "serves an HTML page for crawlers, not JSON; a private space's card never distinguishes 'private' from 'does not exist'."
  },
]
