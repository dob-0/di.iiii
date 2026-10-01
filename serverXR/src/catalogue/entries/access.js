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
]
