# Signing in from the terminal: `di login`

**Decision.** The owner, 2026-10-07: "we need cli login in di.iiii — Taron works in the Claude CLI and wants to push
something to a space, needs to log in, and every time has to go with the browser — so let's make that."

**Before.** A person on a terminal had no way to be *themselves* on a hosted di.iiii. To push into one space they went to the
browser, opened that space's settings, minted a sync key, and pasted it (`di link`, `di follow --key`). One trip per space, and
the key is the space's, not the person's. The agent door (`sdk/`, `di mcp`) reads a token from `DI_TOKEN`,
`DI_TOKEN_<TIER>` or `~/.config/di/credentials.json`, but nothing put one there: `SPEC_agent_door.md` §6 describes the per-person
key ("a person signed in with a session mints an agent key") and it was never built.

**After.** `di login` once per machine. The terminal shows a short code; the person types it in the browser they are already
signed in with; the terminal is then signed in as that person. Every later `di` command or Claude session on that machine acts
as them, in their own spaces, with no browser trip. The login is listed in the browser and can be ended there, or with
`di logout`.

## Method (established, not invented)

| Part | Source |
|---|---|
| The flow: a device shows a code, the person approves in a browser, the device polls | OAuth 2.0 Device Authorization Grant, **RFC 8628**. The flow `gh auth login`, `az login` and `gcloud auth login --no-launch-browser` use. |
| Polling errors `authorization_pending`, `slow_down`, `access_denied`, `expired_token` | RFC 8628 §3.5 |
| Code shape: 8 letters from the base-20 set `BCDFGHJKLMNPQRSTVWXZ` (no vowels, so no words; no look-alikes), 10 minute life, brute-force limits | RFC 8628 §5 (security) and §6.1 (user code recommendations) |
| The person types the code themselves; there is no one-click link carrying it | RFC 8628 §5.4 (remote phishing) |
| What the key may do: acts as the person, never public, never root, hashed, shown once, expiring, revocable, `lastUsedAt` shown | `docs/architecture/SPEC_agent_door.md` §6 (the owner's own design, 2026-09-24), and the shape of the di.bo act token (`TELEGRAM_ACT_TOKEN.md`), which this reuses |
| Least privilege | NIST SP 800-53 AC-6 (as in the agent door spec) |

## The flow

1. `di login` asks `POST /api/auth/device/start` (no login needed, rate limited) with a machine label such as
   `taron-laptop (di 0.4.17)`. The answer: `deviceCode` (kept by the terminal, never shown), `userCode` (`BDFG-HJKL`, shown),
   `expiresIn` 600 s, `interval` 5 s, `verificationPath` `/device`.
2. The terminal prints "open `https://dev.diiii.xyz/device` and type `BDFG-HJKL`" (and opens the browser when the machine has a
   display; `--no-open` to skip). It polls `POST /api/auth/device/token` every `interval` seconds.
3. In the browser, `/device` needs a signed-in account (the usual sign-in, then back to `/device`). The person types the code.
   The page asks the server `POST /api/auth/device/lookup` and shows: the terminal's label, when it asked, where from (the
   network address, shortened), and the sentence "Only approve this if you started it just now." Then **Approve** or **Deny**
   (`POST /api/auth/device/decision`).
4. The next poll gets `{ token, expiresAt, user }` once and the code is spent. The terminal stores the token and prints who it is
   signed in as, so a wrong account is seen at once.

Polling too fast gets `slow_down`. A spent, denied or expired code gets `expired_token` / `access_denied`. `di login` gives up
when the code expires and says so.

## Wire format (the contract the terminal, the page and the server are built against)

JSON bodies, camelCase, mounted under the server's usual `/serverXR` prefix. "session" = the browser's cookie session of a real
account; "terminal token" = `Authorization: Bearer dii_cli_…`.

| Route | Who | Request | Answer |
|---|---|---|---|
| `POST /api/auth/device/start` | anyone | `{ label? }` (text, cut to 80) | `201 { deviceCode, userCode: "BDFG-HJKL", verificationPath: "/device", expiresIn: 600, interval: 5 }` · `404 { error: "login_not_available" }` when this server has no accounts (a `di up` install) · `429` · `503 { error: "busy" }` when too many codes are waiting |
| `POST /api/auth/device/token` | anyone | `{ deviceCode }` | `200 { token, expiresAt, user: { id, name } }` once · else `400 { error }` with `authorization_pending`, `slow_down` (+ `interval`), `access_denied` or `expired_token` (an unknown or spent code is `expired_token`) |
| `POST /api/auth/device/lookup` | session | `{ userCode }` (any case, dash optional) | `200 { label, requestedAt, expiresAt, from }` (`from` = the address, shortened: `203.0.x.x`) · `401 { error: "auth_required" }` · `403 { error: "account_required" }` (a guest) · `404 { error: "unknown_code" }` (wrong, expired or already decided) · `429` |
| `POST /api/auth/device/decision` | session | `{ userCode, approve: true \| false }` | `200 { approved }` · the same refusals as `lookup` |
| `GET /api/auth/cli/tokens` | session | | `200 { tokens: [{ id, label, createdAt, lastUsedAt, expiresAt }] }` (this account's live ones) |
| `DELETE /api/auth/cli/tokens/:id` | session | | `200 { revoked: true }` · `404 { error: "not_found" }` (not this account's) |
| `GET /api/auth/cli/whoami` | terminal token | | `200 { user: { id, name }, token: { id, label, expiresAt } }` · `401` |
| `DELETE /api/auth/cli/token` | terminal token | | `200 { revoked: true }` |

A terminal token that is unknown, expired, revoked, or whose account is gone gets `401 { error: "cli_token_invalid" }` on any
route, never a fall-back to a guest. A route the gate refuses gets `403 { error: "not_through_cli", rule, reason }`.

## The token

- `dii_cli_<id>.<secret>` — `id` 8 random bytes (hex), `secret` 32 random bytes (base64url). Only `SHA-256(secret)` is stored,
  compared in constant time. Shown to the terminal once, at the poll that consumes the device code.
- **Life:** 90 days since it was last used (sliding; the expiry is moved forward at most once in 10 minutes), and never past 365
  days since it was made. An active person is not asked again; an unused laptop's key dies by itself.
- **Ends when:** the person revokes it (the list on `/device`, or `di logout`), it expires, or the account is removed or loses its
  role (the account is re-read at most once a minute — the window a browser cookie gets — so that lands within a minute; a revoke is
  immediate).
- **Browser sign-out does not end it.** In this server a sign-out bumps the account's `token_version` and ends every cookie. A
  terminal login that died with every browser sign-out would bring back the trip this removes. The list on `/device` is the way
  to end one. (Revoking terminals on a password reset is owed, below.)
- Stored on the machine in `~/.config/di/credentials.json` (the file the SDK already reads), mode 0600 in a 0700 folder, written
  atomically; keyed `dev` / `prod` / `local` for those servers, and by origin for any other. `DI_TOKEN` still wins, for CI. The
  token is never printed and never logged (log lines carry the id).

## What a request with it is

`Authorization: Bearer dii_cli_…` resolves, in `getAuthState` (`serverXR/src/index.js`), to the person's own session-equivalent
state — role, spaces and unrestricted read fresh from the account row — marked `actor: 'di.cli'`. Ops it writes belong to the
person and read "`<name> via di CLI`" in history (`opActor.js`). It is **capped like a di.bo member** (role no higher than
editor, no unrestricted reach: the person's own and scoped spaces) and the terminal-login gate (`cliTokenGate.js`, in the server's source folder) runs before every route:

| Refused to a terminal login | Why |
|---|---|
| everything in `REFUSED_THROUGH_DI_BO` (`actTokenGate.js`): `/api/auth/**`, `/api/users/**`, sync keys, integrations, DMs, approvals, invite redeem, who owns or may edit a space | A borrowed key never mints another key or changes who has access. |
| every route the **catalogue** marks `reach: 'public'` (`serverXR/src/catalogue`): opening a space, minting an invite, deleting a project or a space, changing a space's settings | SPEC_agent_door §6: "never public. There is no flag that lifts this for a key." It goes back to the person in the browser. |
| the platform settings below root (`REFUSED_BELOW_ROOT`) | Same as a di.bo member. |

Two routes under `/api/auth/` are the exception, for itself only: `GET /api/auth/cli/whoami` and `DELETE /api/auth/cli/token`
(a login ends itself). Realtime sockets do not accept it. No response to such a request carries a session cookie. Every write is
logged once with the token id, never the token.

## Threats and what answers them

| Threat | Answer |
|---|---|
| Someone sends a person their own code and asks them to approve it (RFC 8628 §5.4) | Nothing is pre-filled or one-click: the person must type the code from *their* terminal. The page says what asked, when and from where, and warns. The terminal then prints the account that signed in, so a mismatch shows. |
| Guessing a user code (§5.1) | 8 × base-20 ≈ 34 bits, 10 minutes, one code per request. Lookups and decisions are rate limited per account and per address; a wrong code costs a try. |
| Guessing or replaying a device code (§5.2) | 256 random bits, stored as SHA-256, spent on first success; polling is held to `interval` by `slow_down`. |
| Two polls both receive the token | The device row is consumed and the token inserted in one synchronous step; the second poll finds it spent. |
| A guest or a bot approves | Approval needs a cookie session of a real account. A guest, a sync key, a di.bo token or another terminal token cannot (the gate refuses `/api/auth/**` to the last two). |
| Cross-site request approves | The session cookie is `SameSite=Lax` and the body must be JSON; a cross-site form cannot carry either. |
| A stolen token file | 0600 file; only a hash on the server; ends by idle expiry or revoke; and it can never publish, delete, mint keys or touch accounts. |
| The label lies | It is text the machine chose; the page shows it as plain text beside the address and the time, and never as the person's name. |

## Where it lives

The file plan (a fenced block on purpose: it names files this branch is creating, and the doc-path check reads prose, not fences).

```
serverXR/src/cliLoginStore.js             device codes + terminal tokens (tables cli_device_codes, cli_tokens)
serverXR/src/routes/cliLoginRoutes.js     the eight routes above
serverXR/src/cliTokenGate.js              what a terminal login may and may not reach
serverXR/src/catalogue/match.js           a request -> the catalogue entries it could be (for the "never public" rule)
serverXR/src/catalogue/entries/accounts.js  entries for the new routes
serverXR/src/index.js                     one branch in getAuthState, the gate, the routes, the half-hour prune
serverXR/src/opActor.js                   the "via di CLI" label
scripts/di/login.mjs                      di login, di logout, di whoami (logic); scripts/di/loginStore.mjs (the file)
scripts/di/cli.mjs                        registration only; di mcp --tier/--base; di move --from uses the login
sdk/credentials.js                        the token by origin, not only by tier
src/pages/DeviceLoginPage.jsx             /device (the word is reserved in shared/reservedSegments.cjs)
guards: serverXR/src/cliLoginStore.test.js, serverXR/src/cliTokenGate.test.js, serverXR/src/cliLoginContracts.test.js
        (real HTTP, auth on), scripts/di/login.test.js, src/pages/DeviceLoginPage.test.jsx
```

## Connecting a machine — `di connect` (2026-11-22)

**Why.** Keys were one per space (`di invite` on the host, a four-word join code). A person with six spaces on dev had a machine that
followed one. Measured on studio-mac 2026-11-22: local Main had 0 projects, dev's Main had 6, only one space followed.

**Method.** The same device grant (RFC 8628) with a `scope`: `POST /api/auth/device/start` takes `{ scope: 'connect' }` (default `login`).
No second flow: the same codes, limits, ten minutes, `/device` page.

1. The terminal shows the code. The person opens `/device` in the browser they are signed in with and types it.
2. `lookup` answers `{ scope: 'connect', spaces: [{ id, label, role }] }`: only spaces the account **owns or is a trusted editor of**
   (an admin gets no more than that). The page shows them all ticked; "Connect this machine" sends `decision { approve: true, spaceIds }`;
   the server cuts the list to what the account may connect (none left: 400 `no_spaces`).
3. The terminal's next poll gets `{ scope: 'connect', user, keys: [{ spaceId, name, key, expiresAt }] }` **once**: one `edit`-scoped
   sync key per ticked space, label `connect <machine label> <date>`, a year. Minted at the poll (only a hash is stored, so there is
   nothing to hand over later). The log says how many, never a key. A second poll answers `expired_token`.
4. `di connect` follows each space (`followSpace`, from now on). **A space of that name already here is followed INTO only when the host
   holds every project this copy holds**; otherwise it is skipped and named, nothing changed (then `di follow SPACE --take-host|--take-mine`
   decides). The follower's own "this copy is ahead" check (SPEC_follow.md) stays the second lock for what a project list cannot show.
   Keys are in memory and follows.json only: never argv, never printed.
5. `di disconnect [--from URL]` ends each connect key (`POST /api/auth/connect/revoke`, the key authenticates itself; a key not made by
   connect is refused 404 and its follow is left alone) and removes the follow. It deletes no space or project. `connect.json` in the data
   folder lists what connect did (space ids, no keys).

6. **Stays connected.** Each key's label ends with a machine tag (`connect <machine> <date> ~<8 hex>`); every key one connect made shares it.
   `POST /api/auth/connect/sync` (bearer = one of the machine's live connect keys, nothing else) answers `{ scope: 'connect', keys }` for the
   spaces the person gained since, minted under the same label (so the same consent and the same Disconnect). 404 when the key is not a live
   connect key. `di connect --sync`, the end of `di up` and `di autoupdate run` call it, quietly when nothing is new; a refusal is said, never
   swallowed. macOS has no autoupdate timer: it syncs at `di up` or by hand. Spaces the person lost are not touched (their key stops with the role).
7. **Machines list.** `GET /api/auth/connect/machines` (account session) lists the person's machines (keys grouped by tag, with space labels);
   `DELETE /api/auth/connect/machines/:id` ends every key of that machine (404 when not theirs). Shown at `/device` (right column from 1100 px)
   and in `diiii.localhost/admin` (Spaces and users). No work is deleted by either.
8. **`di login` offers it.** After a sign-in on a terminal, one Enter runs `di connect` (`n` or `--no-connect` skips; no terminal, no question).
   Nothing in connect needs a login: an install without one works alone as before.

9. **A connect key lives on its person's right** (review 2026-11-22). Connect keys carry a server-set `connect` flag and a `machine_tag` column
   (the label is display only; a hand-made key labelled like one gets nothing from sync, revoke or the machines list). At every use the account
   must exist and still own or trusted-edit the (untrashed) space, else the key answers as no key. One key per (machine, space) ever (unique index):
   a revoked row stays, so ending one space's key is not undone by the next sync, and parallel syncs cannot double-mint; an expired row is cleared
   first. Approving a connect needs a positive sign-in cookie (`via: signin`) and a separate session secret, like minting a manage key.
   Not done: the same use-time check for hand-made user-owned keys, and a "blocked account" state (none exists in `users`).

**What did not change.** `cliTokenGate.js`: a `dii_cli_` login still cannot mint a key or approve a code (`not_through_cli`); the consent
is the signed-in browser's. Tests: `serverXR/src/connectContracts.test.js`, `scripts/di/connect.test.js`,
`src/pages/DeviceLoginPage.test.jsx` ("di connect" block).

**Not validated.** Not run against dev.diiii.xyz or on a second machine (no deploy, no merge in this change). Keys are one per space and
last a year; there is no per-key expiry choice yet.

## Not validated, and owed

- **Not seen on Taron's machine, or on any machine but this one.** Windows file permissions for the credentials file are
  not tested. Marked unvalidated until a person has used it for real.
- Terminals are not ended by a password reset or "sign out everywhere" (that bump does not reach `cli_tokens`).
- `di follow` still asks for a sync key by itself; `di connect` (above) is the one-login way to get them.
- Spec §6's "a list of spaces" and "choose a shorter expiry" per key are not built: one default, stated above.
- The catalogue's `reach` is per route. A body flag that opens a door through a route marked `private` is the catalogue's debt,
  not new here.
