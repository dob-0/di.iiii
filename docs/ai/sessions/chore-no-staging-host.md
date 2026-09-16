## 2026-09-16 — staging.di-studio.xyz retired: every live address is dev.diiii.xyz

- Owner's rule, same day as the word: the old host is gone — dropped from Caddy's
  `STAGING_DOMAIN`, DNS A record deleted. Tiers are local · dev · prod. Every live address in
  docs, help, comments and examples now reads `https://dev.diiii.xyz` (API
  `https://dev.diiii.xyz/serverXR`, mesh `wss://dev.diiii.xyz/serverXR/mesh`).
- `deploy-space-code.yml` no longer allowlists the old host as a dev-tier target — only
  `dev.diiii.xyz` passes the guard now.
- Host matchers that accept a `staging.*` first label stay (`deployMode.js`, nginx's noindex
  map, `data-cleanup.mjs`): harmless, and a self-hosted install may call its second tier that.
  Their comments and tests now say "retired", not "still answers".
- cPanel fallback docs and `cpanel-apply-prebuilt-release.sh` defaults say `dev.diiii.xyz`;
  cPanel names a document root after the domain, so the web root default moved with it.
- `docs/ai/vocabulary.md`: the "still answers" paragraph is replaced by the retirement, and
  the deliberate-survivors section gains one paragraph naming what stays (file names,
  container, `STAGING_DOMAIN` name, `tiers.staging`, `--tier staging`, `:staging`, secret
  names) and what is history (PROGRESS.md, checkpoints, mirrors, audits, legacy).
- `scripts/space-sync.mjs` changed one comment, so the vendored copies (`br_id_ge`,
  `beyond_form`, `platform_recordar`, `space-starter`) now drift by bytes:
  `npm run space:sync:release` is owed after this lands — not run here, it writes into
  other repositories.
- For the next land, CURRENT.md's wording should follow: `tiers: local · dev → dev.diiii.xyz
  (rehearsal) · main → diiii.xyz (live)`; "Dev-tier deploys fold their own notes";
  `git push origin dev # → dev tier`; "dev-tier Google OAuth secret"; "`LIVE_API_URL` means
  the dev tier in six scripts".
- Left as said: `docs/ai/known-fixes.md` ledger rows that quote the old host (one clarifying
  parenthesis on the deploy-space-code row); dated "measured on staging" comments; the chat
  APK twin is still locked to the retired host and opens nothing until rebuilt with
  `host: dev.diiii.xyz`.
