// Catalogue entries: accounts. Shape and rules: ../index.js.

module.exports = [
  {
    route: "POST /api/auth/password/forgot",
    summary: "request a password-reset email",
    reach: "private",
    role: "guest",
    agent: false,
    note: "answers the same way ('a message is on its way') whether or not the address has an account — never confirm which addresses exist."
  },
  {
    route: "POST /api/auth/password/login",
    summary: "sign in with an email/username and password, mints a session cookie",
    reach: "private",
    role: "guest",
    agent: false
  },
  {
    route: "GET /api/auth/password/magic",
    summary: "consume a passwordless sign-in link and redirect back signed in (or to an error state)",
    reach: "read",
    role: "guest",
    agent: false
  },
  {
    route: "POST /api/auth/password/magic",
    summary: "request a passwordless sign-in link by email",
    reach: "private",
    role: "guest",
    agent: false
  },
  {
    route: "POST /api/auth/password/register",
    summary: "create a first-party account with an email or a username and a password",
    reach: "private",
    role: "guest",
    agent: false,
    note: "registration never grants a role or space access — a fresh account is scoped to nothing."
  },
  {
    route: "GET /api/auth/password/reset",
    summary: "hand a password-reset token to the frontend's reset form via a redirect",
    reach: "read",
    role: "guest",
    agent: false
  },
  {
    route: "POST /api/auth/password/reset",
    summary: "set a new password using a reset token, then sign in",
    reach: "private",
    role: "guest",
    agent: false
  },
  {
    route: "GET /api/auth/password/verify",
    summary: "consume an email-verification token and redirect back",
    reach: "read",
    role: "guest",
    agent: false
  },
  {
    route: "GET /api/auth/providers",
    summary: "which sign-in methods this server offers (github/google/telegram/password) and whether it can send mail",
    reach: "read",
    role: "guest",
    agent: false
  },
  {
    route: "DELETE /api/auth/session",
    summary: "sign out: clears the session cookie and bumps the account's token version, revoking every other copy of it",
    reach: "private",
    role: "guest",
    agent: false
  },
  {
    route: "GET /api/auth/session",
    summary: "who the caller is right now — role, space scope, sandbox id, space-creation quota — minting a fresh guest session if there wasn't one",
    reach: "read",
    role: "guest",
    agent: false,
    note: "issuing a new guest session provisions a real sandbox space (filesystem + DB writes)."
  },
  {
    route: "POST /api/auth/session",
    summary: "sign in with a static API token, or acknowledge auth-disabled mode",
    reach: "private",
    role: "guest",
    agent: false
  },
  {
    route: "POST /api/invites/redeem",
    summary: "redeem an invite token, adding the invited space to the caller's own session scope",
    reach: "private",
    role: "editor",
    agent: false,
    note: "the door was already opened when the invite was minted (POST /api/spaces/:spaceId/invites, reach public) — this only lets the holder of that token exercise it."
  },
  {
    route: "GET /api/users",
    summary: "list every account: email, role, space scope, unrestricted flag",
    reach: "read",
    role: "admin",
    agent: false
  },
  {
    route: "PATCH /api/users/:userId",
    summary: "change a user's role, space scope, or unrestricted (reaches-everything) flag",
    reach: "public",
    role: "admin",
    agent: false,
    note: "grants roles and/or space access directly — may go through the approval gate."
  },
]
