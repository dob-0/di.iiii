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
  // Linking two installs with four words (docs/architecture/SPEC_follow.md). A join
  // code stands in, for ten minutes and once, for a per-space sync key — so every
  // one of these is closed to the agent door, the same policy as key minting.
  {
    route: "POST /api/spaces/:spaceId/join-codes",
    summary: "make a four-word join code (valid 10 minutes, one space, single use) that lets another di.iiii follow this space",
    reach: "public",
    role: "admin",
    agent: false,
    note: "closed to the agent door like key minting: the code becomes an editor key on redeem. Owner-or-admin; on an install without auth, only the person at the machine. The words are shown once and only a hash is kept. A space has one live code: a new one revokes the unused old one."
  },
  {
    route: "DELETE /api/spaces/:spaceId/join-codes/:id",
    summary: "revoke a join code that has not been used yet",
    reach: "private",
    role: "admin",
    agent: false,
    note: "owner-or-admin. A used code stands for a sync key: revoke that with DELETE /api/spaces/:spaceId/sync-keys/:id."
  },
  {
    route: "POST /api/join-codes/peek",
    summary: "ask what a join code is for (space, project count, this machine's name) without using it",
    reach: "private",
    role: "guest",
    agent: false,
    note: "anonymous on purpose: the code is the credential. Wrong, used, expired and revoked codes all answer the same 404. Wrong guesses are counted per client and overall, and 429 with Retry-After once over."
  },
  {
    route: "POST /api/join-codes/redeem",
    summary: "use a join code: returns a real per-space sync key, once, for the space the code was made for",
    reach: "public",
    role: "guest",
    agent: false,
    note: "anonymous on purpose: the code is the credential. Single use (atomic), 10 minutes, attempt-limited. The key is minted at this moment and shown only in this response."
  },
  {
    route: "GET /api/spaces/:spaceId/sync",
    summary: "the facts behind the sync light: whether this install follows the space (host, answering, speed, files coming, clashes) and which machines follow it",
    reach: "read",
    role: "admin",
    agent: false,
    note: "owner-or-admin; on an install without auth, only the person at the machine (404 to anyone else). Names other machines and never carries a key."
  },
  {
    route: "DELETE /api/spaces/:spaceId/follow",
    summary: "stop this install following a space — the carrying stops, nothing is deleted",
    reach: "private",
    role: "admin",
    agent: false,
    note: "owner-or-admin; on an install without auth, only the person at the machine."
  },
  {
    route: "POST /api/follows/join/preview",
    summary: "look at a join code on another di.iiii (address + four words) without using it: what space, how many projects, whether a space of that name is already here",
    reach: "private",
    role: "admin",
    agent: false,
    note: "install admin; on an install without auth, only the person at the machine. This server makes the outbound request."
  },
  {
    route: "POST /api/follows/join",
    summary: "join a space on another di.iiii with its four-word code: use the code, copy the space here, and follow it",
    reach: "public",
    role: "admin",
    agent: false,
    note: "install admin; on an install without auth, only the person at the machine. A same-named space already here is merged into only with into: true, and the code is not used before that is said."
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
