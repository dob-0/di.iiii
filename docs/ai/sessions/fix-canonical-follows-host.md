## 2026-09-11 — a page stops claiming to be di-studio.xyz when it is not

- `diiii.xyz` went live 2026-09-11 and serves the same app, but `src/index.html`
  hardcoded `canonical`, `og:url`, `og:image` and `twitter:image` to
  `https://di-studio.xyz`. Every page on the new address — and on `dev.diiii.xyz`,
  and on every `di` install — told search engines it was a copy of the live site.
- Link previews were NOT affected and never were: nginx forks crawlers to
  serverXR's `/og` route, which derives the host. Checked with a Telegram UA
  before changing anything — `og:url https://diiii.xyz` came back correct.
- `canonical` is now created at runtime from `location.origin + location.pathname`.
  It cannot be a relative `href`: the bundler resolves `link[href]` as an asset at
  build time, and `href="/"` fails the build with `EISDIR`. Proven in a preview
  build served on a different host.
- `og:url` and the two images are relative in the shell now. The absolute,
  host-correct versions still come from the `/og` route for anything that reads
  rather than renders.
- `public/sitemap.xml` names `diiii.xyz` (the protocol requires absolute URLs, so
  it is the one file that must pick a host) and lists 15 URLs instead of 7 — the
  eight public spaces that were invisible to search are in it, including the two
  that reached prod today. `robots.txt`'s Sitemap line follows.

## Also settled this session (not in this branch's diff)

- **`diiii.xyz` is the platform's address**, live and certificated; `dev.diiii.xyz` is the
  second tier (it stays — the owner asked to delete it and then said he needs it).
  `di-studio.xyz` and `staging.di-studio.xyz` both keep answering. Caddy takes a comma list
  in `SITE_DOMAIN` / `STAGING_DOMAIN`, so a new name is an `.env` edit; DNS first or the
  certificate never issues.
- **Nothing exists only on the second tier any more.** `cascade` and `the-light-put-back`
  were pushed to prod from di-spaces snapshots and seen as a guest; prod went 10 → 12
  spaces. The publish PATCH fails first time with a stale `previewImageAssetId` — prod
  re-encodes uploads into new ids; clear it in the snapshot and re-run.
- A full **1.1 GB backup of the second tier** is at
  `~/di-backups/staging-final-2026-09-11.tgz`, verified (1793 entries, di.db + uploads).
- **WCC's front door on prod** published one artist's project instead of the exhibition;
  the space now publishes `main`.

## Left open

- `/{space}/projects` renders a "Landing page — THE WAY IN" row for `wcc` that the API does
  not return: the contents page and the server disagree about what the space holds.
- `thedi.studio` cannot be pointed at the VPS until there is a studio page to serve — it
  would otherwise show the platform's front door under the studio's name. Its DNS also
  carries the Google Workspace MX/SPF/DKIM for `info@thedi.studio`; do not touch those.
- Creating a space id `thedi` on the local install answers **409 "Space already exists"**
  while the id appears in neither the listing nor `spaces` in `di.db`. Unexplained; the
  studio page is blocked behind it.
