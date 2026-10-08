## 2026-10-07 — a space on its own domain without Cloudflare: Caddy on-demand TLS

- The owner asked for a second way to switch a space's own domain on, for a di.iiii on a server with its own public IP
  and no Cloudflare in front. Method: Caddy's on-demand TLS with an `ask` endpoint
  (caddyserver.com/docs/automatic-https#on-demand-tls). The design is the new section "Without Cloudflare: Caddy
  on-demand TLS" in `docs/architecture/SPEC_space_own_domain.md`.
- serverXR:
  - `DOMAINS_PROVIDER` = `cloudflare` | `caddy` | unset (unset keeps the first behaviour). `chooseDomainProvider()` in
    `domainService.js` decides, and a provider asked for without its values logs why at boot.
  - `domainDns.js`: the DNS check with `node:dns/promises`. A domain counts as pointed at us when its CNAME is
    `DOMAINS_PUBLIC_TARGET`, or when every address it has is ours. It also lists the records the owner must add (CNAME,
    or A/AAAA for an apex).
  - `domainService.js`: in caddy mode a domain is saved pending, checked at once and then on the sweep, and switched
    on when DNS points here. The same 7-day drop applies. A failed lookup never switches a live domain off.
  - `GET /api/domain-check?domain=` answers 200 only for an active domain of a public space and 404 otherwise. It has a
    catalogue entry. The list route now also says which `provider` is in use.
- `Caddyfile`: a global `on_demand_tls { ask … }` and a last `{$CUSTOM_DOMAINS_SITE}` block with `tls { on_demand }`.
  It stays inert until `CUSTOM_DOMAINS_SITE=https://`. `docker-compose.yml` passes the new values, and `.env.example`
  documents them. Caddy v2.11.7 checked the file both ways, inert and switched on. Without the `ask` block Caddy refuses
  to start.
- The Mac standby is a Cloudflare Tunnel in front of an nginx made from `nginx.conf`, not Caddy. This provider does not
  apply there.
- Tests: 11 DNS, 10 Caddy-mode service and provider choice, 3 `domain-check` over real HTTP. 108 across the domain,
  og, catalogue and config files. Server contracts 199/199. Mutations: taking out the public-space rule in
  `domain-check` fails 1 test, and taking out the every-address rule fails 3. Removing the catalogue entry fails the
  catalogue contract.
- Not done, owed:
  - One real domain end to end on a public-IP machine: DNS, then active, then `ask` 200, then a certificate.
  - `docker-compose.yml` still does not pass `CLOUDFLARE_SAAS_*` or `PLATFORM_ORIGIN` to the server. That gap comes
    from the base branch and is not fixed here.
