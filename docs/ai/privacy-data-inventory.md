# Privacy Data Inventory

What di.iiii actually collects, stores, and transmits — established by code audit
2026-07-28, every claim traced to source. This exists so a `/privacy` page can be
written from fact instead of from boilerplate, and so the gaps below are visible
rather than discovered by whoever asks first.

**Status (2026-10-26): the privacy policy exists.** It is the built-in page at
`/privacy` (`src/pages/PrivacyPage.jsx`, linked from the landing footer and the
static shell, `src/landing/LandingPage.jsx`, `src/index.html`), written from this
inventory. There is still no cookie notice or consent mechanism; the page is the
disclosure and says so. The audit below is the one of 2026-07-28; "Sign-in,
re-checked 2026-10-26" is newer. "Gaps" and "Where the page goes" are kept as
the record of that audit, not as today's state.

---

## What is collected

**Auth.** One cookie, `dii_serverxr_session` (`serverXR/src/authSession.js:3`) —
`HttpOnly`, `SameSite=Lax`, `Secure` only under `NODE_ENV=production`
(`authSession.js:93-115`). It is a **stateless signed payload, not a session id**:
base64url JSON + HMAC-SHA256 (`authSession.js:20-45`), holding `subject`, `label`,
`role`, `spaces[]`. There is no `sessions` table. `label` falls back to the user's
email when no display name is set (`routes/authRoutes.js:120`), so **an email
address can live inside the cookie**. TTL 12 h signed-in, 30 days guest.

**OAuth.** GitHub (scope `user:email`) and Google (`profile`,`email`) persist four
fields each — provider id, email, display name, avatar URL
(`routes/authRoutes.js:55-99`). Access/refresh tokens are explicitly discarded
(`:61`, `:85`). The separate **Drive connect** flow does persist tokens, AES-256-GCM
encrypted at rest (`driveTokenStore.js:19-60`).

**Sign-in, re-checked 2026-10-26** (origin/dev `c032580fe`; paths under
`serverXR/src/` unless named). Live that day, `GET /serverXR/api/auth/providers`:
diiii.xyz `github, google, telegram (bot diiii111bot), password`, `mail:false`;
dev.diiii.xyz `github, google, password`, `mail:false`.

- Four kinds of account, one `users` table: rows are written only by `upsertUser`
  (GitHub, Google, Telegram; the hub carries GitHub and Google only,
  `authHub.js:33`) and `createPasswordUser` (`userStore.js:27-55`, `:121-150`).
  Password sign-in is always registered (`index.js:1376-1380`,
  `routes/authRoutes.js:509-513`); the others only when configured (`:503-508`).
- **Telegram.** di.bo (`di-bo` repo, `bot.mjs` at `origin/master` `6a556cb`) gives
  links only in a private chat (`:1818-1820`) and posts `telegramId` and a name,
  first + last name or else the Telegram username (`:1824-1832`); no picture
  (`:1801-1804`). Telegram hands a bot more with each message (`language_code`,
  `is_premium`, and so on: Bot API "User" object, core.telegram.org/bots/api#user,
  read 2026-10-26); the bot passes none of it on. The server reads only
  `telegramId` (numeric, 1-20 digits), `displayName` (cut to 80), `avatarUrl`
  (kept only on `*.telegram.org` / `*.telesco.pe`), `returnTo`
  (`routes/authRoutes.js:335-358`). The account: `provider 'telegram'`,
  `provider_id` = Telegram id, `email` null, display name refreshed on each
  sign-in (`routes/authRoutes.js:483-489`, `userStore.js:36-45`). The link token:
  10 min (`telegramLoginStore.js:21`), single use (`:69`, `:77`), the row keeps
  Telegram id, name, avatar, return path and a SHA-256 of the secret (`:40-45`),
  deleted when spent or expired (`:94-97`) by the 30-minute sweep
  (`index.js:3524-3528`, `:3544`). `whoami` is read-only: label, role, spaces
  (`routes/authRoutes.js:382-418`); di.bo asks it for `/spaces`, in a private
  chat only (`bot.mjs:3211`, `:3216-3217`). `act-token` exists
  (`routes/authRoutes.js:433-473`) but di.bo `6a556cb` never calls it; its row
  keeps user id, Telegram id, label, a hash, 15 min to 1 h
  (`telegramActTokenStore.js:24-57`), swept when expired (`:115-118`), and minting
  logs the user id (`routes/authRoutes.js:462`). Not on the page: no data flows
  through it today.
- **Password.** Email (lower-cased) or username (3-32 characters), password,
  optional display name (`routes/passwordAuthRoutes.js:109-126`); with none, the
  name is the username, else the address (`userStore.js:147`). Stored: scrypt
  N=65536, r=8, p=1, 16-byte random salt, `scrypt$N$r$p$salt$hash`
  (`passwordHash.js:1-17`, `:22-26`, `:42-46`); `email_verified_at`
  (`userStore.js:158-162`). Mail links only when SMTP is configured
  (`mailer.js:16-27`, `:54`): verify 24 h, reset 30 min, magic 15 min
  (`authTokenStore.js:32-36`), single use (`:94`, `:102`), a new one voids the
  last of its kind (`:60`). Each `auth_tokens` row keeps id, kind, user id,
  SHA-256 of the secret, made, expires, used (`:56-72`); `pruneAuthTokens`
  (`:110-117`) is never called, so the rows stay. A username-only account has no
  reset path: the password hash is set only by reset and by the login rehash
  (`routes/passwordAuthRoutes.js:192`, `:248`).
- Not re-checked: the GitHub and Google hub pass (`routes/authRoutes.js:185-199`,
  `:289-300`), terminal sign-in (`routes/cliLoginRoutes.js`). Found, not fixed:
  "no user ids are written" to logs is not true (7 `logger` lines carry a user
  id: `actTokenGate.js:182`, `cliTokenGate.js:104`, `routes/cliLoginRoutes.js:82`,
  `:122`, `:143`, `:177`, `routes/authRoutes.js:462`).

**Guests.** Auto-minted `guest:<uuid>` with label `Guest`
(`index.js:660-675`). No personal data.

**Database** (`serverXR/src/db.js`, single inline schema, no migration files).
Identifying tables: `users`, `user_drive_tokens`, `public_assets`
(`shared_by_label` = display name), `spaces`, `space_sync_keys`, `space_invites`,
`space_links`, `projects`, and the op logs (`space_ops`/`project_ops`, raw
user content). Most sensitive: **`open_call_applications` holds name, email,
phone, city** (`db.js:129-142`), accepted from unauthenticated public POSTs with
`Access-Control-Allow-Origin: *` (`index.js:317`, `:1169-1176`).

**Uploads.** Stored by content SHA-256 with a sidecar recording the original
filename (`routes/spaceRoutes.js:600-614`). 100 MB cap, MIME allowlist
(`config.js:137`, `index.js:120-134`). No uploader identity is attached unless
published to the commons.

**Logging.** `morgan('tiny')` — method, URL, status, size, duration
(`index.js:349`). **No IP, user agent, referrer, or user id.** IPs are computed for
rate limiting but held in a pruned in-memory Map and never written
(`rateLimit.js:13-43`). Socket logs do include user-supplied display names
(`socketHandlers.js:258`). Docker caps logs at 10 MB/service; nginx and Caddy
configure no access log.

**Realtime.** Presence, cursors and chat are relayed in memory and **never
persisted** — no presence table (`socketHandlers.js:200-209`, `:402-428`). The
mesh hub (`meshHub.js`) is unauthenticated by default and relays `motion`/`bio`/`env`
payloads between room members without inspecting or storing them.

**Third parties — main app: none.** No analytics, telemetry, error reporting, tag
manager or session replay anywhere; `src/index.html` loads same-origin assets only.
Exceptions live on the **WCC surface only**: Google Fonts CSS
(`src/wccSite/landing/landing.css:1-2`) and `unpkg.com` UMD scripts
(`public/wcc/artist-works-land/support.js:988,1423,1425`). Google APIs JS loads only
when a user opens Drive import (`src/hooks/useDriveImport.js:16`).

**First-party traffic counter** (added 2026-08-18): `page_events` table
(`serverXR/src/db.js`) fed by `POST /serverXR/api/track`
(`serverXR/src/routes/trackRoutes.js`), one event per page load from
`src/index.jsx` via `src/utils/track.js`. Stores event type, pathname (query
stripped server-side), referrer hostname only (null on same-origin), and a
server timestamp. **No cookie, no IP, no user agent, no user/session id** — the
rate limiter's per-IP key is in-memory only. `signup` events fire on every OAuth
return, so they overcount returning logins (known limitation). Aggregates:
admin-only `GET /serverXR/api/stats`. Disclosed on `/privacy`.

**Program guest book** (added 2026-09-13): `app_visitor_days` and
`app_visitor_blocks` tables (`serverXR/src/db.js`), written by
`serverXR/src/appVisitorStore.js` from the recorder in `serverXR/src/appVisitors.js`,
which reads each API request's **User-Agent header in memory** and sorts it into
browser / crawler / identified app / anonymous program. Stored per UTC day × agent
name × kind: a request count, first/last-seen timestamps for that name, and — for
identified apps only — the contact string (email or URL) the app itself published
in its User-Agent. **No IP, no URL or path, no query string, no cookie, no
user/session id, and never the raw User-Agent** — only the normalised product name
(lowercase, `[a-z0-9._-]`, ≤64 chars). Browsers are one `browser` row per day with
a count and no timestamps. Bounded at 500 names per day (the rest fold into
`(other)`) and pruned after 90 days. Not recorded at all on `di up` installs
(`DI_LOCAL=1`) or for loopback callers that did not come through the proxies.
`app_visitor_blocks` holds only blocked names and when they were blocked. Admin-only
`GET /serverXR/api/admin/app-visitors` and `PUT …/blocks/:agent`; shown in Ops
Graph → Visitors. Disclosed on `/privacy` and `/for-apps`. Note the contact is
personal data when a person puts their own email in their script's header — it is
published by them, for exactly this purpose, and expires with the 90-day window.

**Local storage.** ~15 first-party keys set without consent, incl.
`dii.project.userId` (persistent pseudonymous id), display names, and full
workspace documents. Enumerated in the audit; surfaced to users at
`src/components/PreferencesPage.jsx:550`.

**Retention that exists.** Spaces 30 d, guest sandboxes 7 d, account sandboxes
180 d then archived (`config.js:274-281`). Op history capped at 500/doc. Program
guest-book rows 90 d (`appVisitorStore.js`).

**Backups.** Nightly `VACUUM INTO` snapshot + tar of uploads/spaces/snapshots to
`/root/backups/` on the VPS, 14-day retention (`deploy/vps-backup.sh:24-42`).
Contains the full `users` table, all open-call PII, encrypted Drive tokens, and
every uploaded file. **Local to the VPS only — no off-box copy**
(`docs/deploy/VPS_DOCKER_DEPLOY.md:170-174`).

---

## Gaps that block an honest policy

These are the reason `/privacy` cannot simply be written. Each needs a product
decision, and several need code before a policy could truthfully describe them.

1. **No account deletion.** `userStore.js` has no delete function; the only user
   routes are admin-only (`routes/userRoutes.js:23,27`). A right-to-erasure request
   currently cannot be honoured through any code path.
2. **No data export / DSAR path.** No `/api/me`, no export endpoint.
3. **No session revocation.** Sessions are stateless signed cookies, so a stolen
   cookie is valid until it expires; the only invalidation is rotating
   `AUTH_SESSION_SECRET`, which logs out every user at once.
4. **No retention limit** on `users`, `open_call_applications`, `public_assets`,
   `space_ops`, or `user_drive_tokens` — those rows persist indefinitely. The
   open-call table is the sharpest edge: real names, emails and phone numbers,
   collected from a public form, kept forever.
5. **EXIF is not stripped.** Originals are stored and served verbatim
   (`spaceStore.js:508`); a repo-wide grep for `exif` returns zero hits. Thumbnails
   are sharp derivatives and drop metadata, but **the full-size original — with GPS
   coordinates intact — is what a public visitor downloads.** Note that naive
   stripping breaks orientation; any fix must preserve the EXIF orientation tag.
6. ~~**Google Fonts on WCC leaks visitor IP + user agent to Google**~~ — **fixed
   2026-07-29** for the React WCC surface: DM Sans and Noto Sans Armenian are
   self-hosted in `src/wccSite/landing/fonts/` (OFL, license texts included) and
   `src/wccSite/landing/fonts.css` replaces the two `@import`s. Verified with
   Playwright: zero external requests, both faces load with metrics distinct
   from the fallback. **Still open:** the legacy static bundle
   `public/wcc/artist-works-land/` loads Google Fonts *and* three `unpkg.com`
   scripts (`support.js:988,1423,1425`) — a separate published-project artifact,
   not covered by this fix.
7. **Backup restore can resurrect deleted data** — no exclusion mechanism
   (`deploy/vps-restore.sh`).
8. **Anonymous inscriptions are append-only by design** and cannot be edited or
   deleted by the person who submitted them (`routes/inscriptionRoutes.js:6-10`) —
   a deliberate product choice that a policy must disclose rather than fix.

## Config risks a policy would be making claims about

- `requireAuth` and `cookieSecure` both **default off** unless `NODE_ENV=production`;
  the code flags this itself (`config.js:210-219`). In that mode every request is
  admin and the cookie is not `Secure`.
- If `AUTH_SESSION_SECRET` is unset, the signing key falls back to `API_TOKEN` —
  anyone with that token can forge a session cookie for any role
  (`config.js:180-204`).
- `GET /api/events` (last 25 request URLs) is unauthenticated when `requireAuth`
  is off (`routes/statusRoutes.js:39-41`).
- `GET /api/health` publicly exposes Node version, OS release, CPU and memory
  (`routes/statusRoutes.js:10-32`).

---

## Where the page goes

`docs/architecture/SPEC_url_architecture_and_tree_addressing.md:104` parks it at
`/-/privacy` on the public host. Until that spec is signed off, wiring `/privacy`
means minting a URL the spec intends to redirect. The sustainability doc (now private, `di.iiii-ops/promo/SUSTAINABILITY.md`)
also owes a `/terms` page covering the licensing commitments — the two should ship
together.
