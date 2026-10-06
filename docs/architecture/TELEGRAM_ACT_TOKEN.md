# di.bo acting as a person: the act token

**Decision.** The owner, 2026-10-07: di.bo becomes the team's assistant in
Telegram and acts *with that person's own di.iiii access, never more* ("go
build all"). Plan: the team-assistant plan in the dob-0/di-bo repo, step 2.

**Before.** Sign in with Telegram had two bot-only routes, both guarded by
`TELEGRAM_LOGIN_SECRET`: `login-link` (mints a one-time link; the callback
creates the account if it is new and sets a browser cookie) and `whoami` (a
read). A bot could act as someone only by minting a link and keeping the
cookie. That works, but it creates accounts for strangers and leaves no trace
of who acted.

## The route

`POST /api/auth/telegram/act-token`, header `x-telegram-login-secret`
(constant-time compare, the same `secretMatches` as its siblings), body
`{ telegramId }`. Registered only when `TELEGRAM_LOGIN_SECRET` is set.

| Case | Answer |
|---|---|
| no or wrong secret | 401 `{error:'auth_required'}` |
| id not numeric | 400 |
| id not bound to an account | 404 `{bound:false}`. **No account is created.** |
| bound | 201 `{token, expiresAt, userId, role}` |

The token is `dii_tgact_<id>.<secret>`, sent as `Authorization: Bearer …`.
It lives 15 minutes (`TELEGRAM_ACT_TOKEN_TTL_MINUTES`, clamped to 1..60) and
can be used for several requests until then. Only the SHA-256 of its secret is
stored (`telegram_act_tokens`, `serverXR/src/telegramActTokenStore.js`).
Expired and revoked rows ride the same half-hour sweep as the login tokens.

## What a request with it is

`getAuthState` (`serverXR/src/index.js`) builds the same state a browser
session gets: type `session`, the account's role, spaces and unrestricted flag
read fresh from the database, and the same `token_version` check a cookie gets.
The one addition is `actor: 'di.bo'` (and `actTokenId`). A di.bo token wins
over a cookie on the same request, and on a `di up` install loopback does not
turn it into the owner.

So it can do what the person can do in their own browser, in their own
spaces, and nothing outside them.

## What it can never do

`serverXR/src/actTokenGate.js` runs before every route, the auth routes
included. One list, `REFUSED_THROUGH_DI_BO`, each rule with its reason.
A refused route answers 403 `not_through_di_bo` before the token is even
checked, whatever the person's role (an admin's token is refused too):

| Rule | Why |
|---|---|
| `/api/auth/**` | sign-in, sign-out, sessions, passwords, Telegram links. A borrowed key never mints another key (this route included) or a session. |
| `/api/users`, `/api/users/**` | accounts, roles and space scopes are changed by a person, in person. |
| `/api/spaces/:id/sync-keys/**` | a sync key lives for months; a 15-minute token must not leave one behind. |
| `/api/integrations/**` | the person's own Claude key and Google Drive grant. |
| `/api/dm/**` | private conversations are end-to-end between people's own devices. |
| `/api/approvals/**` | an approval is a person's decision. |
| `POST /api/invites/redeem` | widens the account's own scope. Minting invites for a space they own stays allowed. |
| `PATCH /api/spaces/:id` with `ownerUserId` or `trustedUserIds` | who owns a space and who else may edit it. |

Also:

- A forged, expired or revoked token answers **401** `act_token_invalid`. It
  never falls back to a guest.
- The person signing out (which bumps `token_version`) revokes it at once.
- No response to such a request carries a session cookie. A route that
  re-issues the caller's cookie, such as creating a space, keeps the grant
  and drops the cookie. A backstop in the gate drops any that slip through
  and logs a warning.
- Realtime sockets do not accept it. It is HTTP only, where the audit is.

## The trace

- Every write (POST/PUT/PATCH/DELETE) logs one line when the response
  finishes: `[act-token] write {"subject","actor":"di.bo","tokenId","method","path","status"}`.
  Each mint logs `[act-token] minted …`, and each refusal logs `[act-token] refused …`.
- Op history (`space_ops`, `project_ops`): the actor is the person, so their
  edits group as theirs. `actor_type` is `di.bo` and the label reads
  `<name> via di.bo` (`serverXR/src/opActor.js`).

## Trust, stated plainly

Whoever holds `TELEGRAM_LOGIN_SECRET` can act as any Telegram-bound person,
within that person's access. That was already true through `login-link`.
This route narrows the power (no new accounts, no sessions, the refusal list)
and makes it visible (the log and the op stamp). Accounts signed in with
Google, GitHub or a password are out of its reach unless they are also bound
to Telegram.

## Guards

- `serverXR/src/telegramActTokenStore.test.js`: TTL, max 60, hash-only
  storage, expiry, revocation, sweep.
- `serverXR/src/actTokenGate.test.js`: every refusal rule and its edges, the
  401, the write log, the cookie backstop.
- `serverXR/src/routes/authRoutes.test.js`: the route returns 401, 400 and 404
  without creating anyone.
- `serverXR/src/httpContracts.test.js` → *di.bo acting as a person
  (act-token)*, over real HTTP with auth on: no account is created for an
  unbound id, reads and writes work inside the person's spaces and are refused
  outside them, the op stamp and the log line, no cookie, the refusal list, and
  the 401 for a forged, an expired and a signed-out token.
- `serverXR/src/catalogueContracts.test.js`: now boots with a Telegram secret,
  so the four Telegram routes are walked and described (`accounts.js`,
  `agent:false`).
