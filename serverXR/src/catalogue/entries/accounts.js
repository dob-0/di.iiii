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
    route: "GET /api/auth/github",
    summary: "sign in with GitHub: this server's own registration if it has one, otherwise through the sign-in hub (docs/architecture/AUTH_HUB.md)",
    reach: "read",
    role: "guest",
    agent: false,
    note: "a browser redirect, not an API: it ends in a session cookie. Offered only when GET /api/auth/providers says github: true."
  },
  {
    route: "GET /api/auth/google",
    summary: "sign in with Google: this server's own registration if it has one, otherwise through the sign-in hub (docs/architecture/AUTH_HUB.md)",
    reach: "read",
    role: "guest",
    agent: false,
    note: "a browser redirect, not an API: it ends in a session cookie. Offered only when GET /api/auth/providers says google: true."
  },
  {
    route: "GET /api/auth/hub/callback",
    summary: "where the sign-in hub returns a person with a signed pass; the pass is checked (signature, this address, this browser, once) and becomes a session here",
    reach: "read",
    role: "guest",
    agent: false,
    note: "only the hub's own redirect lands here; a pass without the matching di_hub cookie in the same browser is refused."
  },
  {
    route: "GET /api/auth/providers",
    summary: "which sign-in methods this server offers (github/google/telegram/password), whether it can send mail, and whether the sign-in hub answered (hub.reachable, hub.via)",
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
    route: "POST /api/auth/telegram/login-link",
    summary: "di.bo only: mint a one-time, 10-minute sign-in link for a Telegram id (the callback creates the account if it is new)",
    reach: "private",
    role: "guest",
    agent: false,
    note: "guarded by the x-telegram-login-secret header, not by a role; registered only when TELEGRAM_LOGIN_SECRET is set."
  },
  {
    route: "POST /api/auth/telegram/whoami",
    summary: "di.bo only: whether a Telegram id is bound to an account, and the spaces that account reaches — a lookup, never a login",
    reach: "private",
    role: "guest",
    agent: false,
    note: "guarded by the x-telegram-login-secret header; registered only when TELEGRAM_LOGIN_SECRET is set."
  },
  {
    route: "GET /api/auth/telegram/callback",
    summary: "a person opens their Telegram sign-in link here; the single-use token becomes a session",
    reach: "read",
    role: "guest",
    agent: false,
    note: "a browser redirect, not an API. Every failure (unknown, expired, spent, forged) lands on the same ?auth=error."
  },
  {
    route: "POST /api/auth/telegram/act-token",
    summary: "di.bo only: a 15-minute bearer (dii_tgact_) that acts as the account already bound to a Telegram id — that person's own role and spaces, marked actor di.bo",
    reach: "private",
    role: "guest",
    agent: false,
    input: {
      body: {
        type: "object",
        required: ["telegramId"],
        properties: { telegramId: { type: "string", pattern: "^[0-9]{1,20}$" } }
      }
    },
    note: "guarded by the x-telegram-login-secret header. 404 {bound:false} for an id with no account — it never creates one. The token is refused on /api/auth/*, /api/users*, sync keys, integrations, DMs, approvals, invite redeem and space ownership (serverXR/src/actTokenGate.js); every write it makes is logged and stamped 'via di.bo'."
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
