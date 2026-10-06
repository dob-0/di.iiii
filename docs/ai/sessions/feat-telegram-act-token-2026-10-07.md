## 2026-10-07 — di.bo can act as a team member: POST /api/auth/telegram/act-token

- Step 2 of the di.bo rebuild (the team-assistant plan in dob-0/di-bo; owner's decision 2026-10-07, "go build all").
- New bot-only route `POST /api/auth/telegram/act-token`, guarded by `x-telegram-login-secret` (the same constant-time
  `secretMatches` as login-link and whoami), registered only when Telegram login is on. It answers only for a Telegram id
  already bound to an account (404 `{bound:false}` otherwise) and never creates a user.
- It returns a 15-minute bearer `dii_tgact_<id>.<secret>` (`TELEGRAM_ACT_TOKEN_TTL_MINUTES`, clamped 1..60), stored as a
  SHA-256 in the new `telegram_act_tokens` table (`telegramActTokenStore.js`), pruned on the existing half-hour sweep.
- A request with it gets the person's own session-equivalent auth state (role, spaces, unrestricted read fresh, the same
  `token_version` revocation as a cookie) plus `actor: 'di.bo'`. Op history stamps `actor_type: 'di.bo'` and the label
  "<name> via di.bo".
- `actTokenGate.js` runs before every route. It holds one refusal list with reasons: `/api/auth/**`, `/api/users*`,
  sync keys, integrations, DMs, approvals, invite redeem, and a space PATCH of `ownerUserId` or `trustedUserIds`. A dead
  token gets a 401 (never a guest), and every write is logged as one structured `[act-token] write` line. No session
  cookie ever leaves (`grantSpaceToSessionUser` skips the re-mint for di.bo, and the gate holds back any other).
- Catalogue: the four Telegram routes are now described (`accounts.js`, `agent:false`); `catalogueContracts.test.js`
  boots with a Telegram secret so they are walked.
- Corrected the claim in `.env.example` and `config.js` that the bot secret "cannot write spaces". It can act as any
  Telegram-bound person within that person's access; this was already true through login-link.
- Doc: `docs/architecture/TELEGRAM_ACT_TOKEN.md`.
- Not done here (owed to later di.bo steps): di.bo does not call the route yet; it is HTTP only (sockets do not accept
  it); there is no route to revoke a token early (the store has `revokeActToken`, and signing out revokes it).
