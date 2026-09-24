// Catalogue entries: integrations. Shape and rules: ../index.js.

module.exports = [
  {
    route: "GET /api/github/app",
    summary: "whether the di.iiii GitHub App is configured on this server, and its install link",
    reach: "read",
    role: "viewer",
    agent: false,
    note: "requires a real signed-in account, not a guest session."
  },
  {
    route: "GET /api/github/repos",
    summary: "repos the GitHub App is installed on — visible to every signed-in user, not just the caller's own GitHub account",
    reach: "read",
    role: "viewer",
    agent: false,
    note: "requires a real signed-in account, not a guest session."
  },
  {
    route: "POST /api/github/webhook",
    summary: "GitHub push-event webhook: re-syncs any space linked to the pushed repo",
    reach: "private",
    role: "guest",
    agent: false,
    note: "authenticated by GitHub's x-hub-signature-256, not a session — sits before the /api auth gates."
  },
  {
    route: "POST /api/integrations/ai/connect",
    summary: "save the caller's own Claude API key, encrypted, for the in-app AI chat",
    reach: "private",
    role: "editor",
    agent: false,
    note: "a guest session is refused explicitly (a key must belong to an accountable account) even though guests otherwise clear the write-role gate."
  },
  {
    route: "POST /api/integrations/ai/disconnect",
    summary: "remove the caller's saved AI key",
    reach: "private",
    role: "editor",
    agent: false,
    note: "a guest session is refused explicitly."
  },
  {
    route: "GET /api/integrations/ai/status",
    summary: "whether the caller has a Claude key connected",
    reach: "read",
    role: "guest",
    agent: false
  },
  {
    route: "GET /api/integrations/google-drive/callback",
    summary: "Google Drive OAuth callback: exchanges the returned code for Drive tokens and stores them against the user named in the signed state",
    reach: "read",
    role: "guest",
    agent: false,
    note: "authenticated by a signed, short-lived state parameter, not a session cookie — the request can legitimately arrive with no cookie at all."
  },
  {
    route: "GET /api/integrations/google-drive/connect",
    summary: "start the Google Drive OAuth consent redirect for the caller's account",
    reach: "read",
    role: "viewer",
    agent: false,
    note: "401 with no signed-in session."
  },
  {
    route: "POST /api/integrations/google-drive/disconnect",
    summary: "disconnect the caller's Google Drive",
    reach: "private",
    role: "editor",
    agent: false,
    note: "silently no-ops if the caller has no session, rather than refusing — but still sits behind the global write-role (editor) gate."
  },
  {
    route: "GET /api/integrations/google-drive/files",
    summary: "browse the files the caller has already granted this app through the Drive Picker (drive.file scope)",
    reach: "read",
    role: "viewer",
    agent: false,
    note: "401 with no signed-in session, 403 if Drive isn't connected."
  },
  {
    route: "GET /api/integrations/google-drive/picker-token",
    summary: "a short-lived access token and API key for the client-side Google Picker",
    reach: "read",
    role: "viewer",
    agent: false,
    note: "401 with no signed-in session, 403 if Drive isn't connected."
  },
  {
    route: "GET /api/integrations/google-drive/status",
    summary: "whether Google Drive is configured on this server and connected for the caller",
    reach: "read",
    role: "guest",
    agent: false
  },
  {
    route: "POST /api/sync/spaces/:spaceId/pull",
    summary: "overwrite this space's local scene with the configured live server's copy",
    reach: "private",
    role: "editor",
    agent: false,
    note: "a whole-scene replace across an instance boundary — snapshots the local scene first, requires expectedVersion, and refuses if the live server can't answer verbatim."
  },
  {
    route: "POST /api/sync/spaces/:spaceId/push",
    summary: "push this space's local scene to the configured live server, conditional on the live version this push was prepared against",
    reach: "private",
    role: "editor",
    agent: false,
    note: "requires LIVE_API_URL and LIVE_API_TOKEN to be configured on this server; a 409 means the live scene moved and nothing was written there."
  },
  {
    route: "GET /api/sync/spaces/:spaceId/status",
    summary: "compare this space's local and live scene state (object/asset counts, versions) without claiming whether they match",
    reach: "read",
    role: "viewer",
    agent: false
  },
]
