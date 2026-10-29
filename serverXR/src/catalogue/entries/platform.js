// Catalogue entries: platform. Shape and rules: ../index.js.

module.exports = [
  {
    route: "GET /llms.txt",
    summary: "what di.iiii is, for language models: the llmstxt.org file from the public bundle (docs/ai/public/), linking the /ai/*.md pages",
    reach: "read",
    role: "guest",
    agent: true,
    note: "nginx sends /llms.txt here; /ai/*.md is served beside it from the same folder (aiPublic.js)."
  },
  {
    route: "GET /llms-full.txt",
    summary: "always a 404 in plain text naming /llms.txt: di.iiii keeps one file for language models",
    reach: "read",
    role: "guest",
    agent: false
  },
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
    route: "GET /api/admin/sweep",
    summary: "the idle-space sweep: every space it reaches in the next 14 days and what it will do (trash, or skip with the reason), plus the last 200 things it did",
    reach: "read",
    role: "admin",
    agent: false,
    note: "names spaces nobody listed and their owners — admin only."
  },
  {
    route: "POST /api/admin/sandboxes/purge",
    summary: "move guest sandboxes past their TTL into the space trash and archive idle account sandboxes, on demand instead of waiting for the periodic sweep",
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
    route: "GET /api/guest-address",
    summary: "this machine's https place address for devices without di (a phone, a headset, a guest's laptop): the name in the certificate it serves, its port, whether this start is on the network, and where the name points as this machine looks it up",
    reach: "read",
    role: "guest",
    agent: false,
    note: "local runtimes only (404 on a hosted server, 403 from the network unless di up --lan). Can include this machine's LAN addresses. No address without a certificate or with a wildcard one — never an invented one; pointsHere says whether the name resolves to this machine (null when the lookup failed)."
  },
  {
    route: "GET /api/wifi-door",
    summary: "whether this install's wifi door is open on the wifi: { shared, name, address, port, since }",
    reach: "read",
    role: "admin",
    agent: false,
    note: "the person at this machine only, by a local name (403 from the wifi door, from the network or through a proxy). Local runtimes only."
  },
  {
    route: "POST /api/wifi-door",
    summary: "open this install's wifi door: an https listener on the wifi address with the install's own name certificate, serving guests only",
    reach: "public",
    role: "admin",
    agent: false,
    note: "OPENS A DOOR to everyone on the wifi, as guests with the open space, never the owner's spaces. The person at this machine only; needs a name (di name). Moves the name's record to the wifi address and starts a beacon. Closed again by DELETE; a restart closes it too."
  },
  {
    route: "DELETE /api/wifi-door",
    summary: "close the wifi door, point the name back at 127.0.0.1 and stop the beacon",
    reach: "private",
    role: "admin",
    agent: false,
    note: "the person at this machine only. Nothing is deleted: the name and certificate stay."
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
    route: "GET /api/share/channels",
    summary: "the share channels (Telegram, Bluesky, Mastodon): connected or missing, and what each can carry",
    reach: "read",
    role: "admin",
    agent: false,
    note: "never returns a token; tokens come from SHARE_* environment variables only."
  },
  {
    route: "GET /api/share/posts",
    summary: "drafted and sent posts of the share door, newest first",
    reach: "read",
    role: "admin",
    agent: false
  },
  {
    route: "GET /api/share/posts/:id",
    summary: "one share-door post with its per-channel results and preview address",
    reach: "read",
    role: "admin",
    agent: false
  },
  {
    route: "GET /share/posts/:id/preview",
    summary: "HTML page: a post as each chosen channel will show it (length against the limit, media, link)",
    reach: "read",
    role: "admin",
    agent: false,
    note: "a page, not JSON; admin only because a draft is private."
  },
  {
    route: "POST /api/share/posts",
    summary: "draft a post { text, link, media[], channels[] } for the share door; nothing is sent",
    reach: "private",
    role: "admin",
    agent: false
  },
  {
    route: "POST /api/share/posts/:id/send",
    summary: "approve a draft and send it to its channels; a channel that already posted is skipped",
    reach: "public",
    role: "admin",
    agent: false,
    note: "outward and cannot be unsent: only after the owner's word on the preview."
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
    note: "loopback-only (127.0.0.1/::1) — a 404 to anything else, names other machines. One server per data folder carries the follows (follow/lease.js): on any other server on the same folder the list is empty and `carriedHere: false` + `carriedBy` {pid, port} + `message` say which one does."
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
    route: "GET /api/shoot/:key",
    summary: "a film crew's shared shoot sheet (?rev= answers {unchanged:true} for pollers)",
    reach: "read",
    role: "guest",
    agent: false,
    note: "public, unauthenticated, rate-limited — the key in the path is the only credential and a sheet exists only when sha256(key) is listed; a wrong key and a missing sheet are the same 404."
  },
  {
    route: "POST /api/shoot/:key/ops",
    summary: "apply crew edits to a shoot sheet: tick, note, link, add or remove a prop, set a cast member's details",
    reach: "private",
    role: "guest",
    agent: false,
    note: "anyone holding the link may edit — the key in the path is the only credential and a sheet exists only when sha256(key) is listed; a wrong key and a missing sheet are the same 404."
  },
  {
    route: "PUT /api/shoot/:key/plan",
    summary: "write a shoot sheet's whole plan (the seed); this replaces the crew's ticks",
    reach: "private",
    role: "guest",
    agent: false,
    note: "anyone holding the link may rewrite it — the key in the path is the only credential and a sheet exists only when sha256(key) is listed; a wrong key and a missing sheet are the same 404."
  },
  {
    route: "GET /api/shoot/:key/files/:name",
    summary: "one costume or prop picture of a shoot sheet (webp, jpg or png)",
    reach: "read",
    role: "guest",
    agent: false,
    note: "serves image bytes, not JSON — the key in the path is the only credential and a sheet exists only when sha256(key) is listed; a wrong key and a missing sheet are the same 404."
  },
  {
    route: "PUT /api/shoot/:key/files/:name",
    summary: "upload one picture (webp, jpg or png, up to 5 MB) to a shoot sheet",
    reach: "private",
    role: "guest",
    agent: false,
    note: "body is the raw image bytes — the key in the path is the only credential and a sheet exists only when sha256(key) is listed; a wrong key and a missing sheet are the same 404."
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
  {
    route: "GET /page",
    summary: "the app shell with the front door's own head (title, description, preview card) written in, so an address says what it is before any script runs",
    reach: "read",
    role: "guest",
    agent: false,
    note: "serves an HTML page, not JSON; the status is the truth of the address."
  },
  {
    route: "GET /page/*splat",
    summary: "the app shell with the head of the space, project or wiki article at this address written in; a real 404 when nothing answers there",
    reach: "read",
    role: "guest",
    agent: false,
    note: "serves an HTML page, not JSON; a private space answers 404, never 'private'."
  },
  {
    route: "GET /sitemap.xml",
    summary: "the sitemap, written from the records: public spaces and their projects, plus the build's wiki articles and network rooms",
    reach: "read",
    role: "guest",
    agent: false,
    note: "serves XML for crawlers, not JSON; private spaces never appear."
  },
  {
    route: "GET /api/host",
    summary: "which space this host shows — how a space's own domain (yokozo.xyz) knows it is that space",
    reach: "read",
    role: "guest",
    agent: true,
    note: "answers from the request's own host; `space` is null for di.iiii's own addresses and for any domain that is not live on a public space. Cached for 60 s."
  },
  {
    route: "GET /api/domain-check",
    summary: "may this hostname have a certificate? Caddy's on-demand TLS `ask` endpoint for a space's own domain",
    reach: "read",
    role: "guest",
    agent: false,
    input: {
      query: {
        type: "object",
        required: ["domain"],
        properties: {
          domain: { type: "string", description: "the hostname Caddy is about to get a certificate for, e.g. yokozo.xyz" }
        }
      }
    },
    note: "answers 200 only when the hostname is a live domain of a public space, 404 for anything else; Caddy reads only the status (https://caddyserver.com/docs/caddyfile/options#on-demand-tls). Never cached."
  },
]
