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
    input: {
      body: {
        type: "object",
        properties: {
          label: { type: "string", description: "who or what holds the key" },
          manage: { type: "boolean", description: "true: a MANAGE key (SPEC_space_sync_keys.md §13) that may also trash, make private and (with a second manage key) move this space's projects; lives 90 days instead of a year" }
        }
      }
    },
    note: "key minting is excluded from the agent door by policy (see index.js entry rules). Owner-or-admin only; the raw token is shown once and cannot be retrieved again. manage:true is honoured only for a person who signed in (a session stamped by a sign-in door, with an account row) or the owner at the machine — never a bearer token or a session made from one (403 manage_needs_session), and not from any session while AUTH_SESSION_SECRET is unset or equal to an API token (403 manage_needs_session_secret)."
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
    route: "GET /api/spaces/:spaceId/sync-keys/actions",
    summary: "the space's key log: every trash, make-private, move and restore a sync key did or was refused, with the key's label and when",
    reach: "read",
    role: "admin",
    agent: false,
    input: {
      query: {
        type: "object",
        properties: {
          key: { type: "string", description: "only this key's rows (as the bearer, or as the second key of a move)" },
          limit: { type: "number", description: "done rows and refusals, up to this many of each (default 200, at most 1000)" }
        }
      }
    },
    note: "owner-or-admin only; a sync key gets 403. Also returns the per-key limits. Done rows are read apart from refusals, so refusals never hide them; refusals are capped at 100 per key and 5,000 in all. Never holds a secret."
  },
  {
    route: "POST /api/spaces/:spaceId/sync-keys/:id/undo",
    summary: "take a sync key back and undo what it did: restore what it trashed, re-open what it made private, move back what it moved",
    reach: "public",
    role: "admin",
    agent: false,
    note: "owner-or-admin, and only a person who signed in (the rule for minting a manage key; 403 undo_needs_session for a token or a session made from one). Revokes first. Each step runs only while the project is still where the key left it: a project trashed again since stays trashed, and one whose visibility anyone changed after the key stays as it is (never more public than the owner's latest choice). Answers restored / madePublic / movedBack / notUndone with reasons. reach public: it can make a project public again."
  },
  {
    route: "GET /api/sync-keys/self",
    summary: "a sync key asking what it is: its id, space, label, scope (edit or manage) and expiry, and its limits when manage",
    reach: "read",
    role: "editor",
    agent: false,
    note: "answers only a sync key (Authorization: Bearer dii_sync_…); anything else gets 404, as does a host older than the manage scope. Never returns the secret. di follow reads it to know whether its trash, hiding and moves may reach the host."
  },
]
