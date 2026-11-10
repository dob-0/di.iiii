# A terminal asks, the owner taps: the agent door on request

Status: design, 2026-10-30. Code: none yet. Ledger N1544. Decision record:
`docs/ai/decisions/2026-10-30-agent-door-on-request.md`. Review by the owner first.

## Why

A terminal login (`di login`, token `dii_cli_…`, `docs/architecture/CLI_LOGIN.md`) acts as the person
who approved it, but `serverXR/src/cliTokenGate.js` refuses every route the catalogue marks
`reach: 'public'` with `403 not_through_cli`. `SPEC_agent_door.md` §6 says why: "never public … there
is no flag that lifts this for a key". A key lives in a file on a laptop; if it leaks, it must not be
able to open a door to a new audience. The owner decided on 2026-10-30 that a terminal may *ask* to
open a door, and he answers with one tap in his console (di.net, `@the_di_studio_bot`). This design
keeps the reason for §6 intact: the key alone still opens nothing. A person's tap does.

## What was measured (origin/dev 73539b090, 2026-10-30)

- The catalogue (`serverXR/src/catalogue/entries`) describes **247 routes: 115 read, 112 private,
  20 public** (counted by loading the entries in node).
- Of the 20 public routes, 3 are already refused by the di.bo refusal list before the reach rule
  (`actTokenGate.js` REFUSED_THROUGH_DI_BO: the two sync-key routes and `PATCH /api/users/:userId`),
  and 2 more by REFUSED_BELOW_ROOT (`PATCH /api/config`, `DELETE /api/spaces/:spaceId`).
- The three the owner needs first:
  - `POST /api/spaces/:spaceId/join-codes` (routes/followRoutes.js:180): makes four words, live 10
    minutes, one use. Does **not** go through the approval gate today.
  - `PATCH /api/spaces/:spaceId` with `isPublic` (routes/spaceRoutes.js ~577): already calls
    `approvalGate.gateOrApply({ kind: 'spaces.patch' })`; the owner of the space applies at once.
  - `POST /api/follows/join` (routes/followRoutes.js:254), on the follower's install: joins a space
    on another di.iiii with its four words. Not gated today.
- The approval gate (`approvalGate.js`) already has everything the flow needs: semantic intent (never
  a replayed request), `intent_hash` over canonical args + actor, reauthorisation at execution,
  `requireApproval` (asks even with `APPROVAL_GATE_ENABLED` off), a per-call `ttlMs`, fail closed
  when the bot is unreachable, a boot-time recovery pass and a fail-loud net (`createGatedRequestNet`).
- di-bo (origin/master, `bot.mjs:997-1045`, `lib/proposals.mjs`): `POST /approvals` (HMAC signed)
  sends the owner one message with two buttons `dii:approve:<id>` / `dii:deny:<id>`; the tap is
  accepted only from root (`isRoot`, bot.mjs:1538) and posts `/api/approvals/decision` back, signed,
  echoing `intentHash` and `decisionToken`.
- A terminal login's auth state is `type: 'session'`, `actor: 'di.cli'`, `cliTokenId` (index.js:880-900),
  so today's reauthorisers (`currentlyOwnerOrAdmin`) would accept it. They do not know the token.

## 1. The flow

1. The terminal sends the request as it would today, e.g. `POST /api/spaces/cinema-house/join-codes`
   with `Authorization: Bearer dii_cli_…`.
2. `cliTokenGate` runs the di.bo refusal list and REFUSED_BELOW_ROOT first, unchanged. Then the reach
   rule: if the route is `reach: 'public'` **and** its catalogue entry names an on-request kind
   (`cliOnRequest: 'spaces.joinCode'`) **and** `CLI_DOOR_ON_REQUEST` is on **and** a bot is configured,
   the gate does not refuse. It marks `req.cliDoorRequest = { kind }` and lets the request through to
   the route. Every other public route answers the same 403 as today.
3. The route validates as it does for a person in the browser (`manageSpace`, `manageInstall`, the
   rate limiters). Then, seeing `req.cliDoorRequest`, it calls
   `approvalGate.gateOrApply({ kind, args, actorState, summary, req, requireApproval: true, ttlMs: 600000 })`.
   `args` are the already-validated values plus `cliTokenId`, so the hash binds the decision to this
   token too. `summary` is built by the server from those args, never from text the terminal sent:
   "Your terminal "aylmo-claude" (Gevorg) asks to make a join code for the space cinema-house. The
   code lives 10 minutes and lets one machine follow the space."
4. The gate stores the pending action (ttl 10 minutes) and notifies di-bo. If the notify fails, the
   row is denied at once with the note `bot_unreachable` and the terminal gets
   `503 { error: 'door_request_unreachable' }`. Nothing waits for an hour on a message nobody saw.
5. Otherwise the route answers `202 { status: 'pending_approval', requestId, expiresAt, poll }`, where
   `poll` is `/api/auth/cli/requests/<requestId>`.
6. di-bo sends the owner ONE message: the summary, who, which terminal, which server, when it expires,
   and two buttons **Allow** / **Refuse**.
7. The tap posts the signed decision. `handleDecision` checks the token, the hash, the expiry and that
   the row is still pending, then `applyIntent` reauthorises: the token is still live
   (`cliLoginStore` claim by id, not revoked, not expired) **and** the person may still do it
   (`currentlyOwnerOrAdmin` or the route's own check). Only then the executor runs the same store
   function the route would have called, and the result is kept on the row for the terminal.
8. The terminal polls `GET /api/auth/cli/requests/<id>` every 5 seconds (the RFC 8628 interval
   `di login` already uses, CLI_LOGIN.md:32) until it reads `approved` with the route's own answer (the join code
   words), `refused`, `expired` or `failed`. The result is handed out once and then cleared from the
   row, so a join code does not sit in the database after the terminal has it.

Fails closed, every missing piece:

| Missing piece | What happens |
|---|---|
| `CLI_DOOR_ON_REQUEST` off | Today's 403 `not_through_cli`, byte for byte |
| No `APPROVAL_BOT_URL` / secret | Today's 403; the gate does not even let the request reach the route |
| Bot unreachable at notify | Row denied `bot_unreachable`, terminal 503, nothing runs |
| Owner does not answer | Row expires denied after 10 minutes; poll reads `expired` |
| Token revoked or expired meanwhile | Reauthorisation fails, `cli_token_ended`; poll answers 401 anyway |
| Person lost the space meanwhile | Reauthorisation fails, `actor_no_longer_authorized` |
| Route forgets to call the gate | The fail-loud net blocks the 2xx (a cli-door entry in `GATED_ROUTES`) |
| Server restarts after a tap | `recoverPendingActions` runs the approved row at boot, as today |
| Two taps, or a tap after expiry | `decideAction` is single-shot; expiry is re-checked at decision time |

Limits, stated: the tap is accepted only from the console's root (the owner), so in phase 1 a
team member's terminal is approved by the owner, not by that person. Approval in the person's own
browser (the `/device` page pattern) is owed, as is the follower side on an install with no console
(see §3, `follows.join`).

## 2. What may be asked, and what stays refused forever

Allowed per tap, phase 1 (the owner's three):

| Kind | Route | Why it is safe enough with a tap |
|---|---|---|
| `spaces.joinCode` | `POST /api/spaces/:spaceId/join-codes` | Ten minutes, one use, one space, revocable |
| `spaces.publish` | `PATCH /api/spaces/:spaceId` with only `isPublic` and/or `publishedProjectId` | Reversible with one more PATCH; the space's history keeps it |
| `follows.join` | `POST /api/follows/join` | Brings a space in; this install's own data stays; stop with `DELETE …/follow` |

May join later, one PR each with its own executor and summary, after the owner's look:
`POST /api/spaces/:spaceId/invites` (permanent access for one person), the asset share, a project's
shelf, the three show-page operator switches, `POST /api/share/posts/:id/send`.

Refused forever, even with a tap:

| What | Why |
|---|---|
| Accounts, sign-in, keys, integrations, DMs, approvals, ownership and trust (the di.bo refusal list) | A key never mints, widens or approves another key, and never moves who owns what. A tap on a phone is a weak check for a change that cannot be undone by the same person |
| `POST /api/join-codes/redeem` | It returns a sync key: a key minting a key |
| `DELETE /api/spaces/:spaceId`, `…/purge`, `DELETE /api/projects/:projectId` | Deleting is not opening a door; it stays in the browser, where the person sees what goes |
| `PATCH /api/spaces/:spaceId` with `slug`, `openInscriptions`, `kind`, `permanent`, or any field beyond the two above | Changes the address or the kind of a space; links break for others |
| `PATCH /api/config`, `/api/admin/**`, `/api/estate/**` | The platform's settings are root's, in a session |
| `POST /api/wifi-door`, `POST /api/spaces/:spaceId/domains` | Opens a listener on a network, or registers a name outside di.iiii (money, DNS) |
| Any `/api` route the catalogue does not describe | A rule cannot apply to a route nobody classified |

A per-space standing grant ("this terminal may open doors in cinema-house for 24 hours"):
**recommend no, not in phase 1.** The risk: for 24 hours a copy of the key file opens doors with no
human in the loop, which is exactly what §6 was written against; the tap is the only check left once
the key is out. If the owner wants one later, the narrow form: one terminal, one space, one kind
(join codes only), at most 1 hour, ended when the token ends, listed under Terminals with an End
button, and every use still sent to the console as a notice with Undo. That is a separate decision.

## 3. The change list

serverXR (PR 1, behind the flag):
- `config.js`: `cliDoorOnRequest: parseBool(process.env.CLI_DOOR_ON_REQUEST, false)` under `approval`.
  Not `APPROVAL_GATE_ENABLED`: that switch also gates every admin write; one flag must change one thing.
- `catalogue/entries/access.js`, `spaces.js`: `cliOnRequest: '<kind>'` on the three entries;
  `catalogue/index.js` validates the field (public entries only).
- `cliTokenGate.js`: `reachRefusalFor(method, path, body, { onRequest })` returns `{ ask: kind }` in
  place of a refusal when the entry names a kind, the flag is on and the bot is configured; for
  `spaces.publish` the body must hold only allowed fields. `createCliTokenGate` sets
  `req.cliDoorRequest`. Add `GET /api/auth/cli/requests/:id` to `OWN_ROUTES`.
- `approvalGate.js`: `gateOrApply` denies the row and throws 503 when a `cli.`-requested notify fails;
  `applyIntent` runs a `cliTokenLive(args.cliTokenId)` check before the kind's reauthoriser; keeps the
  executor's result on the row; `GATED_ROUTES` gains the three routes with a `reqTest` for
  `req.cliDoorRequest`. New export `requestStatusFor(id, tokenId)`.
- `pendingActionStore.js`: columns `result` (JSON, cleared on first read) and `actor_via`
  (`di.cli:<tokenId>`); migration in `db.js`; `readResultOnce(id, via)`.
- `routes/followRoutes.js`: register executors `spaces.joinCode`, `follows.join`; both routes call
  `gateOrApply` when `req.cliDoorRequest` is set. `routes/spaceRoutes.js`: `spaces.publish` executor
  (the `spaces.patch` store call limited to the two fields); the owner's `applyNow` is skipped when
  the actor is `di.cli`.
- `routes/cliLoginRoutes.js`: the poll route; a token sees only its own rows (else 404, the same as
  unknown). One pending door request per token at a time (`429 door_request_waiting`), at most 10 an hour.
- `index.js`: reauthorisers for the three kinds; `cliLoginStore.isLive(tokenId)`.
- `follows.join` on an install with no console: answers the same 403 as today, with the reason
  "this install has no approval console; join in the browser". Said, not hidden.
- `scripts/di/cli.mjs` and a new `scripts/di/ask.mjs` (the `di` command): on 202, print the summary line and "waiting for your tap", poll,
  print the answer; Ctrl-C leaves the request to expire.

Tests to add:
- `cliTokenGate.test.js`: flag off gives the exact 403 body of today for all 20 public routes (snapshot);
  flag on but no bot gives the same; flag on with bot passes only the three kinds; `isPublic` together
  with `slug` is refused; the refusal list still wins over `cliOnRequest`; a dead token learns nothing.
- `approvalGate.test.js`: cli request with notify failing is denied and nothing runs; token revoked
  between request and tap gives `cli_token_ended` and the executor never runs; hash covers
  `cliTokenId`; result readable once; expiry at 10 minutes; the net blocks a door route that skipped
  the gate.
- `cliLoginContracts.test.js`: 202 shape; poll answers pending / approved+result / refused / expired;
  another token's id answers 404; one pending at a time; 401 after `di logout`.
- `catalogueContracts.test.js`: every `cliOnRequest` names a registered executor and a public entry.

di-bo (PR 2, behind the same flag on the server side; the bot needs no flag):
- `lib/proposals.mjs`: `isCliDoor(kind)` for the three kinds; `approvalButtons` gives **Allow** /
  **Refuse** (`btn_allow`, `btn_refuse` in `lib/lines.mjs`, same `dii:approve|deny:<id>` data, so
  `bot.mjs` dispatch and the root-only check stay as they are); `approvalText` opens with "A terminal
  asks to open a door." and names the terminal; `decidedText`: "Allowed. The terminal has its answer."
  / "Refused. Nothing was opened."
- `lib/proposals.test.mjs`: the three texts and buttons; a non-root tap still does nothing.
- Rehearse on r-di, then the Mac through `mac-safe-change` (the house rule).

Wiki (`src/wiki/wikiContent.js`), new entry after `terminal-sign-in`:

> **A terminal asks, you tap.** Some moves open a door: a join code, making a space public, joining a
> space from another di.iiii. A terminal signed in as you cannot make them alone. It asks, and your
> console sends you one message saying what it wants, for which space, and from which terminal. Tap
> Allow and it happens; tap Refuse, or wait ten minutes, and nothing happens. If you did not just ask
> for it yourself, tap Refuse and end that terminal under Terminals. Deleting, keys, accounts and
> who owns a space are never asked for this way: those stay in the browser.

## 4. Rollback

`CLI_DOOR_ON_REQUEST` unset or `false` (the default): `reachRefusalFor` returns the same refusal object
as today, the gate answers the same `403 { error: 'not_through_cli', rule, reason }`, and no route sees
`req.cliDoorRequest`. A snapshot test pins that body for all 20 public routes. The new columns and the
poll route stay inert (the poll answers 404 for every id). The di-bo texts only change for kinds the
server never sends with the flag off. Undo the code: revert PR 1 and PR 2; the migration only adds
nullable columns.

## 5. The spec change

Replacement for the "Never public" bullet of `SPEC_agent_door.md` §6:

> - **Never public on its own.** A `public` move (open a space, mint an invite, delete) is refused to
>   every agent key acting alone. Owner's decision 2026-10-30 ("i want to both now do and build",
>   ledger N1544): a terminal login may **ask** for a short list of public moves (a join code, making
>   a space public, joining a followed space), named per route in the catalogue (`cliOnRequest`); the
>   request waits as a pending action, the owner answers with one tap in his console, and only then
>   it runs, reauthorised, with the args that were asked for. No flag lifts this for a key alone:
>   the switch `CLI_DOOR_ON_REQUEST` only allows the asking. Deleting, keys, accounts and ownership
>   are never asked for. Design: `docs/ai/agent-door-on-request.md`.

And in the "Status, 2026-10-07" paragraph, after "never public": "(since 2026-10-30, on request with
a tap for the routes the catalogue names, when `CLI_DOOR_ON_REQUEST` is on)". `CLI_LOGIN.md` line 90
takes the same words.

## 6. Cost and order

| PR | Repo | Lines (rough) | Tests |
|---|---|---|---|
| 1. Asking, the gate, the poll, three executors, the `di` command, wiki, spec text | di.iiii → dev | ~450 code + ~120 docs | ~30 new cases in 4 files |
| 2. Allow / Refuse words for a terminal's request | di-bo → master | ~60 | ~6 cases |

Order: PR 1 first, merged with the flag off (proved inert by the snapshot test), then PR 2 rehearsed
on r-di and installed on the Mac, then the flag on for dev only, one real join code asked from a
terminal and tapped on the owner's phone, then main. Not measured yet: the time from request to tap
(expected under a minute when he is at the phone; the ttl is 10 minutes).
