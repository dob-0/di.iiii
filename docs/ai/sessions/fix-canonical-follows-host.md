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
