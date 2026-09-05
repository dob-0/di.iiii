## 2026-09-01 — sign in with Telegram, the server half

The people who most need an account here cannot hold a Google one. At the Dilijan
camp that meant one login shared across six laptops, one invite token across five
children, and afterwards no way to say who had made what — the showcase wall had
five screens and the record could not attribute four of them. This is the fix for
the next workshop, and for any collaborator who should not have to make an account
somewhere else to open their own work.

Telegram has already proven who someone is by delivering a message to them. This
turns that proof into a session here, through the same door GitHub and Google use.

**The shape.** Two halves. di.bo mints (`POST /api/auth/telegram/login-link`,
bot-only, presenting `TELEGRAM_LOGIN_SECRET`); the person opens the link
(`GET /api/auth/telegram/callback?token=`) and lands signed in. After that it is
identical to the OAuth providers — same `upsertUser`, same session, same
sandbox hand-off — so **a guest who has already been building keeps their work
when they sign in**, which is the difference between this and a fresh account.

**What it deliberately refuses:**
- The link is **single-use and lives 10 minutes**, because it rides a chat message
  and a chat message is forwardable, screenshot-able and backed up to somebody
  else's cloud. `consumed_at` is set *before* the session is issued, so a failure
  costs a new link rather than handing a retry to whoever forwarded it.
- Only the SHA-256 of the secret is stored. A stolen database mints nothing.
- A wrong secret against a real id does **not** spend the token — otherwise
  guessing an id would let anyone lock the real person out.
- The mint endpoint takes `telegramId` numeric-only, and an avatar URL only from
  Telegram's own CDN.
- **A minted link can never carry a role.** `role`/`isUnrestricted` in the mint
  body are ignored; a bot compromise costs accounts, not the platform. Guarded.
- `TELEGRAM_LOGIN_SECRET` is its own secret, deliberately **not** the admin API
  token, so a compromised bot cannot also write spaces.

**A real bug the tests caught before it shipped:** with `OAUTH_CALLBACK_BASE_URL`
unset the minted URL came out *relative* — useless the moment it reaches a chat.
Deriving the origin from the request would have meant trusting a Host header to
say where people sign in, so the endpoint now refuses with a 503 that names the
missing variable instead.

**Config (all three, or the provider stays off):**
`TELEGRAM_LOGIN_SECRET` (shared with di.bo), `TELEGRAM_BOT_USERNAME` (advertised
so a client can name the bot), `OAUTH_CALLBACK_BASE_URL` (already required by the
OAuth providers). Unset secret = provider absent from `/api/auth/providers` and
the routes not registered at all.

**Not in this branch, on purpose:** the di.bo side that calls the mint endpoint,
and the client button. This half is what both of those need, and it is testable
on its own; shipping it first keeps the auth change reviewable by itself.

Tests: `serverXR/src/telegramLoginStore.test.js` (11) and a `sign in with
Telegram` block in `httpContracts.test.js` (7) covering the disabled case, the
bot secret, id validation, the one-real-sign-in path, role refusal, and forged
links. Full server contracts 114/114, lint clean.
