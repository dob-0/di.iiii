## 2026-10-07 — a space on its own domain (yokozo.xyz shows taronx), set up by the server

- The owner asked for yokozo.xyz to show Taron's space `taronx` live, controlled from Taron's account, and for the work
  to be done "on the server side, so we don't repeat the work". He turned a redirect down. This is item 3c (custom
  domains) of `SPEC_space_urls_and_portability.md`; the design is `docs/architecture/SPEC_space_own_domain.md`.
- serverXR:
  - `space_domains` table, `domainStore.js` (hostname rules; the host lookup answers only for an active domain).
  - `cloudflareSaas.js`: Cloudflare for SaaS custom hostnames.
  - `domainService.js`: add, check and remove. A pending domain is checked every 2 minutes and dropped after 7 days if
    nothing points at it. Limits: 3 per space, 90 on the platform. di.iiii's own names are refused.
  - `GET /api/host`, plus the owner-or-admin routes under `/api/spaces/:spaceId/domains`.
  - The crawler card on a domain previews the space at that domain. Five catalogue entries.
- Client:
  - `hostSpace.js` asks `/api/host` once at boot, and never on our own addresses.
  - `spaceRouting.js` reads `/x` on the domain as `/<space>/x`, and the link builders leave the space out.
  - Editor and platform paths on the domain go to the same place on diiii.xyz, because the session lives there.
  - `SpaceDomainPanel` is under Manage → Own domain on the space card. There is also a wiki entry.
- Tests: 24 for the store and service, 6 for the routes over real HTTP, 3 for the crawler card, 22 for the client
  routing and host checks, 6 for the panel. Server contracts 199/199, catalogue 3/3. Taking out the active-only rule
  fails 5 tests.
- Not done, owed:
  - Cloudflare platform setup (`domains.diiii.xyz` as fallback origin). This waits on the owner's Cloudflare login;
    the steps are in di-atlas `services/space-domains.md`.
  - The prod serverXR env (three `CLOUDFLARE_SAAS_*` values).
  - The Mac tunnel's catch-all, di-atlas PR #45.
  - yokozo.xyz's DNS.
  - A security review of the self-serve path.
  - A look on a real screen, desktop and phone.
- Unproven: an apex domain served through CNAME flattening, when the domain's zone and the SaaS zone are in the same
  account. yokozo.xyz is the first measurement, and the spec names the fallback.
