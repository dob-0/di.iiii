// Catalogue entries: access. Shape and rules: ../index.js.

module.exports = [
  {
    route: "GET /api/spaces/:spaceId/invites",
    summary: "list the invite links minted for a space, and whether each was used or revoked",
    reach: "read",
    role: "admin",
    agent: true,
    note: "owner-or-admin only, even though it is a read."
  },
  {
    route: "POST /api/spaces/:spaceId/invites",
    summary: "mint an invite link that grants one person permanent access to a private space",
    reach: "public",
    role: "admin",
    agent: true,
    input: {
      body: {
        type: "object",
        properties: {
          label: { type: "string", description: "who this invite is for; defaults to \"invite\"" }
        }
      }
    },
    note: "owner-or-admin only. The token/invite is shown once in the response and cannot be retrieved again — losing it means minting a new one."
  },
  {
    route: "DELETE /api/spaces/:spaceId/invites/:id",
    summary: "revoke an invite link",
    reach: "private",
    role: "admin",
    agent: true,
    note: "owner-or-admin only. Closing access needs no confirmation the way minting a new one does."
  },
  {
    route: "GET /api/spaces/:spaceId/sync-keys",
    summary: "list the sync keys minted for a space",
    reach: "read",
    role: "admin",
    agent: false,
    note: "key listing is excluded from the agent door by policy (see index.js entry rules). Owner-or-admin only."
  },
  {
    route: "POST /api/spaces/:spaceId/sync-keys",
    summary: "mint a long-lived sync key that lets an external install (e.g. a GitHub Actions job) read and write this space",
    reach: "public",
    role: "admin",
    agent: false,
    note: "key minting is excluded from the agent door by policy (see index.js entry rules). Owner-or-admin only; the raw token is shown once and cannot be retrieved again."
  },
  {
    route: "DELETE /api/spaces/:spaceId/sync-keys/:id",
    summary: "revoke a sync key",
    reach: "private",
    role: "admin",
    agent: false,
    note: "key revoking is excluded from the agent door by policy (see index.js entry rules). Owner-or-admin only."
  },
  {
    route: "PATCH /api/spaces/:spaceId/sync-keys/:id",
    summary: "name the machine a sync key is for (the owner's words, shown on the key panel)",
    reach: "private",
    role: "admin",
    agent: false,
    input: {
      body: {
        type: "object",
        required: ["machineName"],
        properties: {
          machineName: { type: "string", description: "up to 80 printable characters; empty clears it" }
        }
      }
    },
    note: "key management is excluded from the agent door by policy. Owner-or-admin only; a sync key is refused, its own key included. The name is never read for authorisation. Logged in the key's action log with who."
  },
  {
    route: "POST /api/spaces/:spaceId/sync-keys/:id/renew",
    summary: "renew a sync key: the same key gets one more term (90 days manage, a year edit), no new secret",
    reach: "private",
    role: "admin",
    agent: false,
    note: "excluded from the agent door by policy. Needs a person who signed in (a session stamped by a sign-in door); bearer tokens, sync keys and sessions made from a token get 403 renew_needs_session. Opens in the key's last 14 days, at most once every 90 days (429 renew_too_soon); a revoked or ended key stays dead (410). Rate-limited per address; every attempt is logged."
  },
  {
    route: "GET /api/spaces/:spaceId/sync-keys/:id/undo",
    summary: "preview what undoing a sync key would put back, and what it would leave as it is and why",
    reach: "read",
    role: "admin",
    agent: false,
    note: "read-only; the same plan the undo itself runs. Owner-or-admin only."
  },
]
