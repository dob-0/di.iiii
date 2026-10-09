## 2026-10-09 — asset response headers from a server list, GitHub sync on this machine only, approved repos, no credential in the build

- Asset responses (`/api/spaces/:id/assets/:assetId`, `/api/projects/:id/assets/:assetId`) take their Content-Type from
  `serverXR/src/assetResponseType.js`: passive media (images, video, audio, model files, plain text, JSON) inline with
  their type; SVG, PDF and archives keep their type as a download; everything else `application/octet-stream` + attachment.
  Every asset response has `nosniff` and `Content-Security-Policy: sandbox`. A generic upload type takes its type from the
  file extension. Method: OWASP ASVS 4.0.3 V12.5.1/V12.5.2, OWASP File Upload Cheat Sheet.
- The GitHub sync moved to `serverXR/src/githubSync.js` (dependencies passed in). It writes through the loopback on
  `config.port`, or `SELF_API_URL` only when that is a loopback address; any other value stops the sync with an error naming
  `SELF_API_URL`. A Passenger (cPanel) host that used a public `SELF_API_URL` has no GitHub sync until it has a loopback
  listener of its own — owed.
- GitHub links (`serverXR/src/githubLinkPolicy.js`): an admin links any repo the App reaches; a space owner who is not an
  admin links only a repo on `GITHUB_SYNC_ALLOWED_REPOS` (`owner/repo`, `owner/*`). `space_links.approved_by` records how;
  a push syncs a link only if an admin made it or its repo is still listed. Links made before this have no `approved_by`
  and stop syncing until an admin re-saves them or the repo is listed. The repo picker shows non-admins the listed repos only.
- Build env: `src/utils/devTree.js` reads `VITE_DI_TREE`/`VITE_DI_MODE` by name (a bare `import.meta.env` put every
  `VITE_*` value into the bundle — scratch Vite 8.3.3 build, sentinel inlined before, not after). Workflows, cPanel scripts,
  dev-stack and env examples give the build no token. The legacy cPanel bundle in `release.yml` builds when the repo
  variable `LEGACY_CPANEL_BUNDLE` is `true`. Guard: `scripts/di/buildEnvNoSecrets.test.js`.
- Owed: a `dist/` scan for secret values after each CI build; GitHub user-to-server check (the user's own installation)
  instead of an operator list; known-fixes rows for these changes once they are public.
