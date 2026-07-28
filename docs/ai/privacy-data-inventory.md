# Privacy Data Inventory

What di.iiii actually collects, stores, and transmits — established by code audit
2026-07-28, every claim traced to source. This exists so a `/privacy` page can be
written from fact instead of from boilerplate, and so the gaps below are visible
rather than discovered by whoever asks first.

**Status: no privacy policy, cookie notice, or consent mechanism exists in the
repo.** Wiring `/privacy` is blocked on the product decisions in the last section,
not on routing.

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
(`src/wcc/landing/landing.css:1-2`) and `unpkg.com` UMD scripts
(`public/wcc/artist-works-land/support.js:988,1423,1425`). Google APIs JS loads only
when a user opens Drive import (`src/hooks/useDriveImport.js:16`).

**Local storage.** ~15 first-party keys set without consent, incl.
`dii.project.userId` (persistent pseudonymous id), display names, and full
workspace documents. Enumerated in the audit; surfaced to users at
`src/components/PreferencesPage.jsx:550`.

**Retention that exists.** Spaces 30 d, guest sandboxes 7 d, account sandboxes
180 d then archived (`config.js:274-281`). Op history capped at 500/doc.

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
6. **Google Fonts on WCC leaks visitor IP + user agent to Google** on page load,
   with no consent. This is the exact pattern German courts have ruled on.
   Self-hosting the two families would remove it with no visual change.
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
means minting a URL the spec intends to redirect. `docs/promo/SUSTAINABILITY.md:19`
also owes a `/terms` page covering the licensing commitments — the two should ship
together.
