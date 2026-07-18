# Spec — Artist Ecosystem (Telegram front door + Claude ops layer)

Status: **DRAFT — plan only, no code written.**
Owner: Technical Architect to sequence; Backend/API (auth, bot webhook), Infrastructure (bot
process/hosting, secrets), Security (new external surface) all touch this.

> Distilled 2026-07-18 from an earlier draft (2026-07-01, branch
> `claude/di-iiii-new-space-kbywad`, never merged). That draft's Drive-asset-sync section is now
> superseded — Google Drive login/import already shipped since
> (`serverXR/src/googleDrive.js`, `driveTokenStore.js`, `src/hooks/useDriveImport.js`; remaining
> gap is just the Cloud-console Picker config, tracked in `CURRENT.md`). This version keeps only
> what's still unbuilt and still worth planning: the Telegram front door and the Claude ops
> layer behind it.

## 1. Goal

Let a non-technical creator ("artist") use di.iiii without ever opening Studio, a terminal, or
knowing what a repo/branch/token is — **Telegram as the front door**:

- **Google** — login, and (already shipped separately) the asset pipeline via Drive import.
- **GitHub** — stays the invisible "engine" for scene/code sync, as it already works today.
- **Telegram** — chat commands replace the UI: create a space, check status, publish, list
  assets.
- **Claude** — the operator behind the bot (or an agent session) that turns a chat message into
  the actual API calls against `serverXR`.

Non-goal: replacing Studio for people who *do* want the full editor; a general-purpose chatbot
personality — scope stays space lifecycle + assets.

## 2. Current state (re-verified 2026-07-18)

| Piece | Status |
|---|---|
| GitHub engine | **Live.** Repo→space sync already works; nothing to build here. |
| Google login + Drive asset import | **Live**, shipped since the original draft. Not part of this spec anymore. |
| Telegram bot | **Does not exist.** Zero references in the codebase. |
| Claude/AI ops layer as a product surface | **Does not exist.** Only ad hoc agent sessions (like this one) with direct repo/API access — no bot-mediated version for end users. |

So the only real build left here is: a Telegram bot + a thin command layer connecting it to the
existing `/api/spaces` surface. One build, not three.

## 3. Artist journey (target)

1. Artist opens the Telegram bot, links their account (see §4b — identity-linking still an open
   question) to their existing di.iiii/Google identity.
2. Bot can create a space on request (`POST /api/spaces`, same call `SpaceHub.jsx` makes today).
3. Artist manages assets the way they already can (Drive import, or direct upload) — the bot
   doesn't need to own this, just report on it (`/assets`).
4. Artist messages the bot: `/publish` → bot calls the existing publish path
   (`PATCH /api/spaces/:id` with `publishedProjectId`/`isPublic`) → replies with the live URL.
5. `/status`, `/assets`, `/rename` etc. are thin wrappers over existing `serverXR` endpoints —
   the bot adds **zero** new business logic, only a chat-shaped client.

## 4. New components

### 4a. Telegram bot
- A small standalone process (new `serverXR`-adjacent service or a script under `scripts/`,
  TBD by Infrastructure) using the Telegram Bot API (long-polling or webhook).
- Holds **no** business logic — every command maps to an existing `serverXR` REST call, using
  the same auth model as existing admin scripts (bearer token), except the token is
  per-Telegram-user, not a shared admin token.
- Open question: how does a Telegram identity map to a di.iiii identity/session? Likely a
  linking step (bot sends a one-time code, artist enters it once on a di.iiii login page) rather
  than trying to do Google OAuth inside Telegram's chat UI.

### 4b. Claude ops layer
- Thin: the bot (or a Claude-powered handler behind it) parses intent ("make me a new space
  called sunset-ritual") and calls the same handful of `serverXR` endpoints already in use
  (`POST /api/spaces`, asset listing, `PATCH` publish). No new endpoints needed beyond the bot
  glue itself.

## 5. Security considerations (flag, don't resolve here)

- Telegram bot token is a new secret needing the same treatment as existing app secrets
  (rotation runbook precedent: `docs/ops/ROTATE_GITHUB_APP_SECRETS.md`).
- Per-Telegram-user → per-space auth must reuse the existing `canAccessSpace`/role enforcement —
  the bot must not become a second, parallel authorization system.
- Rate-limit bot-triggered space creation the same way the UI does (free-tier quota) so a chat
  interface doesn't become a spam vector for unlimited space creation.

## 6. Open questions (need a decision before any code)

- Identity linking: Telegram ↔ Google/di.iiii account — one-time code vs. deep-link OAuth vs.
  something else?
- Where does the bot process live/run and who owns its uptime (Infrastructure call — new Docker
  service? separate host? same box as `serverXR`)?
- Is a Telegram front door actually a near-term priority, or a later-phase idea? (Not decided —
  this doc exists so the concept isn't lost, not as a commitment to build it.)
