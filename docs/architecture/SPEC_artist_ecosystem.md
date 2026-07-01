# Spec — Artist Ecosystem (Google login+Drive assets, GitHub engine, Telegram front door, Claude ops)

Status: **DRAFT — plan only, no code written.**
Owner: Technical Architect to sequence; Backend/API (auth, Drive sync, bot webhook), Infrastructure
(bot process/hosting, secrets), Security (new OAuth scope + new external surface) all touch this.

## 1. Goal

Let a non-technical creator ("artist") use di.iiii without ever opening Studio, a terminal, or
knowing what a repo/branch/token is:

- **Google** — the only login. Also becomes the asset pipeline: drop files in a Drive folder,
  they land in their space.
- **GitHub** — stays the invisible "engine." Scene/code definitions sync in the way they already
  do today; the artist never touches it.
- **Telegram** — the front door. Chat commands replace the UI: create a space, check status,
  publish, list assets.
- **Claude** — the operator behind the bot (and/or an agent session like this one) that turns a
  chat message into the actual API calls against `serverXR`.

Non-goals (this spec): replacing Studio for people who *do* want the full editor; two-way Drive
sync (space → Drive); a general-purpose chatbot personality — scope is space lifecycle + assets.

## 2. Current state (verified in this repo, 2026-07-01)

| Piece | Status |
|---|---|
| GitHub engine | **Live.** `serverXR/src/githubApp.js` + `spaceLinkStore.js` + webhook receiver already sync a repo's entry file (and, via the CI/`DI_SPACE_TOKEN` path, `references/**` assets) into a space. Nothing to build here for phase 1. |
| Google login | **Exists, login-only.** `serverXR/src/routes/authRoutes.js:99` requests `scope: ['profile','email']` — identity only, zero Drive access. |
| Google Drive asset sync | **Does not exist.** No Drive scope requested, no `googleapis` dependency, no sync job anywhere in the repo. |
| Telegram bot | **Does not exist.** Zero references in the codebase. |
| Claude/AI ops layer | **Does not exist as a product surface.** Only ad hoc agent sessions (like this one) with direct repo/API access — no bot-mediated version. |

Conclusion: phase 1 has **three real builds** (Drive scope + sync, Telegram bot, and a thin
command layer connecting the bot to the existing `/api/spaces` surface), not one.

## 3. Artist journey (target)

1. Artist opens the Telegram bot, taps **Login with Google** (deep link to a di.iiii OAuth page
   scoped for Telegram, same underlying `passport-google` flow already in `authRoutes.js`, plus a
   new incremental Drive scope).
2. Bot replies with a private Drive folder link ("drop your files here") and a space is
   auto-created (`POST /api/spaces`, same call `SpaceHub.jsx` makes today) and linked to:
   - that Drive folder (asset source), and
   - optionally a GitHub repo if they already have an engine repo (existing GitHub-sync flow).
3. Artist drags files into the Drive folder from their phone/desktop — no di.iiii UI touched.
4. A sync job (poll or Drive push-notification webhook) pulls new/changed files into
   `spaces/<id>/assets` via the existing assets endpoint (`POST /api/spaces/:spaceId/assets`).
5. Artist messages the bot: `/publish` → bot calls the existing publish path
   (`PATCH /api/spaces/:id` with `publishedProjectId`/`isPublic`) → replies with the live URL.
6. `/status`, `/assets`, `/rename` etc. are thin wrappers over existing `serverXR` endpoints —
   the bot adds **zero** new business logic, only a chat-shaped client.

## 4. New components

### 4a. Google Drive asset sync
- Incremental OAuth scope on top of existing Google login: `drive.file` (only files/folders the
  app creates or the user explicitly picks) — **not** full `drive.readonly`, to avoid asking for
  blanket access to a stranger's entire Drive.
- One Drive folder per space, created by the server via the Drive API at space-creation time,
  shared back to the artist's Google account.
- Sync direction: Drive → space only (matches the existing one-way GitHub model in
  `SPEC_space_sync_keys.md` §9 — one-way sync is the established pattern here, keep it consistent).
- Trigger: Drive API `watch` (push channel) if reachable from the deploy host, else a poll
  (interval TBD) — same "webhook where possible, poll as fallback" shape already used for
  GitHub vs. staging in `CURRENT.md`'s known caveat.
- New credentials needed: a Google Cloud project with Drive API enabled, OAuth client (extends
  the existing one or a new one), stored the same way GitHub App secrets are today
  (`~/.config/dii/<env>.deploy.env` → baked into `.env.generated`, never manual `.env` edits).

### 4b. Telegram bot
- A small standalone process (new `serverXR`-adjacent service or a script under `scripts/`,
  TBD by Infrastructure) using the Telegram Bot API (long-polling or webhook).
- Holds **no** business logic — every command maps to an existing `serverXR` REST call, using
  the same auth model as `space-new.mjs`/`space-push.mjs` today (bearer token), except the token
  is per-Telegram-user, not a shared admin token.
- Open question: how does a Telegram identity map to a di.iiii identity/session? Likely a
  linking step (bot sends a one-time code, artist enters it once on a di.iiii login page) rather
  than trying to do Google OAuth inside Telegram's chat UI.

### 4c. Claude ops layer
- Thin: the bot (or a Claude-powered handler behind it) parses intent ("make me a new space
  called sunset-ritual") and calls the same three or four `serverXR` endpoints already in use
  (`POST /api/spaces`, asset upload, `PATCH` publish). No new endpoints needed for phase 1 beyond
  what Drive sync requires.

## 5. Security considerations (flag, don't resolve here)

- Drive `drive.file` scope is the safe default — full-Drive scopes require Google's sensitive-
  scope verification review and should be avoided unless a real need appears.
- Telegram bot token and Drive OAuth client secret are new secrets needing the same treatment as
  the GitHub App secrets (rotation runbook precedent: `docs/ops/ROTATE_GITHUB_APP_SECRETS.md`).
- Per-Telegram-user → per-space auth must reuse `canAccessSpace`/role enforcement — the bot must
  not become a second, parallel authorization system (same principle as sync-keys in
  `SPEC_space_sync_keys.md` §6: one hot path, new identity *sources*, not new enforcement).
- Rate-limit bot-triggered space creation the same way the UI does (`spaceLimit` free-tier quota)
  so a chat interface doesn't become a spam vector for unlimited space creation.

## 6. Suggested build order

1. **Drive sync** first — it's the piece with an external dependency (Google Cloud project setup,
   OAuth consent screen) that takes real calendar time (Google review) regardless of when
   engineering starts, so kicking that off early de-risks the schedule.
2. **Telegram bot**, command-only against existing endpoints (space create/status/publish) —
   fastest to a demonstrable "artist ecosystem" moment once the identity-linking question (§4b)
   is answered.
3. **Wire Drive sync results into bot notifications** ("3 new assets synced") — glue, not new
   surface.

## 7. Open questions (need a decision before any code)

- Identity linking: Telegram ↔ Google/di.iiii account — one-time code vs. deep-link OAuth vs.
  something else?
- Where does the bot process live/run and who owns its uptime (Infrastructure call — new Docker
  service? separate host? same box as `serverXR`)?
- Is `drive.file` scope acceptable, or does the product need read access to an *existing* Drive
  folder the artist already has (which would require the broader, review-gated scope)?
- Per-artist space limit via the bot — same `spaceLimit` as web signups, or a separate policy?
