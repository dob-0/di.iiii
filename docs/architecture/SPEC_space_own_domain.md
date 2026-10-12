# Spec — a space on its own domain

Status: **building** on `feat/space-own-domain-2026-10-07`. This is item 3c of
`SPEC_space_urls_and_portability.md` (custom domains) and Stage 3 of
`SPEC_url_architecture_and_tree_addressing.md`.

The owner signed it off on 2026-10-07. His words:
- *"I want a connection, so Taron can work on diiii.xyz/taronx and yokozo.xyz updates; yokozo.xyz belongs to Taron, so
  the control is in Taron's account."*
- *"Move many things to the server side, so we don't repeat the work."*

## What it is

- A space owner types a domain into the space's settings. Taron, signed in on diiii.xyz, types `yokozo.xyz` for `taronx`.
- **The server does the rest.** It registers the domain with Cloudflare, Cloudflare issues the certificate, and the
  settings show the one DNS record the domain still needs. When that record is in place, the domain switches on by
  itself. Nobody runs a command per domain.
- `yokozo.xyz/` shows the space and `yokozo.xyz/<project>` shows that project, exactly as `diiii.xyz/taronx/...` does.
  It is the same space, live, with no copy and no sync. The address bar stays on yokozo.xyz.
- **Editing stays on diiii.xyz.** An editor path (`/studio`, `/raw`, `/admin`, sign-in…) opened on the domain goes to the
  same place on diiii.xyz. This rule comes from both specs above: the editor never moves to the artist's domain. It also
  falls out of how sign-in works: the session cookie belongs to one host (`authSession.js`) and the OAuth callbacks are
  fixed to the platform host (`authHub.js`).

## What it is not

- It is not a redirect. A redirect was built first, in di-atlas PR #45, and the owner turned it down.
- It is not a second copy of the space, an export, or a static site.
- It is not DNS hosting: whoever controls the domain adds one record at their DNS provider. If the domain is ours
  (bought on the studio's GoDaddy), we add it with `gddy`.

## Method (established, cited)

**Cloudflare for SaaS, custom hostnames.** This is Cloudflare's published product for exactly this job: a platform
serving its customers' own domains.
- How it works: https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/getting-started/
- Plans: https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/plans/
  - Available on the Free plan, with **100 hostnames included** and $0.10 per hostname after that.

The pieces:
1. **Platform zone `diiii.xyz`, set up once (a script, not hand steps):**
   - a proxied record `domains.diiii.xyz` → the tunnel, set as the zone's **fallback origin**;
   - `domains.diiii.xyz` is also the **CNAME target** customers point at;
   - the tunnel's last ingress rule sends any other host to nginx instead of answering 404. This is safe because only
     hostnames Cloudflare has accepted for this account can reach the tunnel at all.
2. **Per domain, done by serverXR:** `POST /zones/{zone}/custom_hostnames` with HTTP certificate validation (DV, TLS ≥
   1.2). The response, and a delayed second GET, give the ownership and validation records. Cloudflare's guide says the
   POST may not include them yet.
3. **The domain's DNS:** a `CNAME <domain> → domains.diiii.xyz`. An apex domain like `yokozo.xyz` cannot hold a CNAME
   at most DNS providers. Cloudflare's own answer for non-Enterprise plans is **CNAME flattening**, so an apex domain
   keeps its DNS at Cloudflare. Its record must be **DNS-only**: orange-to-orange does not work when both zones are in
   the same account, per Cloudflare's "how it works" page for SaaS customers.
4. **Live** = Cloudflare's `status: active` and `ssl.status: active`. serverXR checks pending domains on a timer and on a
   "check now" button, so nothing waits on a person.

**Host → space**, inside di.iiii:
- `space_domains` table: the domain, the space, the state, the Cloudflare hostname id, the records still owed, the last
  error, and who added it and when.
- `GET /serverXR/api/host` answers "which space does this host show?" for the client at boot. It answers only for an
  **active** domain on a **public** space; anything else answers `null`, and the platform renders as it does today.
- The client puts the space segment back in front of the path before routing, so `/x` is read as `/<space>/x`, and the
  public link builders leave it out again. Routing itself is unchanged.
- The crawler preview cards (`/og`) use the same lookup, so a link to yokozo.xyz shows Taron's space, not the platform.

## Who may do what

- Adding or removing a domain: the **space owner or an admin**, through the same guard as every space setting
  (`requireSpaceOwnerOrAdminWrite`). Control sits with the owner's account.
- Only a **public** space can take a domain: a private space has nothing to show on the open internet.
- **Proof of control is the DNS record itself.** Cloudflare validates the hostname, and it stays pending until the
  record exists, so typing someone else's domain achieves nothing.
- **No squatting:** a domain still pending after 7 days is dropped, freeing it for whoever really holds it. At most 3
  domains per space (for example the apex, `www` and one spare), and a platform-wide cap (`DOMAINS_MAX`, default 90)
  keeps us inside the 100 free hostnames. A domain inside our own platform names (diiii.xyz, di-studio.xyz,
  thedi.studio…), an IP address or a bare name is refused.

## When no provider is configured

Without a provider (no `CLOUDFLARE_SAAS_*`, no `DOMAINS_PROVIDER=caddy`: a local install, or dev), a domain can still be
saved. It shows "waiting for the platform to be connected", and the host lookup works for a domain an admin marks
active by hand. The code path is the same either way. Nothing pretends to be live.

## Without Cloudflare: Caddy on-demand TLS

A second provider, for a di.iiii on a machine with **its own public IP** (a VPS, a server in a rack), where nothing sits in
front of it. The table, the states, the limits, the 7-day drop, the host → space lookup and the owner's panel are the
same; only who checks the domain and who issues the certificate change.

**Method (established, cited): Caddy's on-demand TLS.** Caddy is already this repo's self-hosted HTTPS front
(`Caddyfile`, compose profile `https`). On-demand TLS is its documented way to serve customers' own domains: Caddy gets a
certificate from Let's Encrypt during the first TLS handshake for a name it has not seen, after asking an endpoint of
ours whether that name is allowed.
- How it works: https://caddyserver.com/docs/automatic-https#on-demand-tls
- The `ask` option: https://caddyserver.com/docs/caddyfile/options#on-demand-tls. Caddy calls the endpoint with
  `?domain=<name>`; a 2xx answer allows the certificate, anything else cancels it and fails the handshake. Caddy refuses
  to start an on-demand site without it (checked with Caddy v2.11.7: "on-demand TLS cannot be enabled without a
  permission module to prevent abuse").

The pieces:
1. **serverXR, `DOMAINS_PROVIDER=caddy`**, with `DOMAINS_PUBLIC_TARGET` (the name customers CNAME to, e.g.
   `domains.your-domain`, resolving to this machine) and/or `DOMAINS_PUBLIC_IPS` (this machine's public A/AAAA
   addresses, comma-separated). Unset `DOMAINS_PROVIDER` keeps the first behaviour: Cloudflare when its three values are
   set, otherwise none. A provider asked for but missing its values logs why at boot and runs as "not connected".
2. **Adding a domain** saves it `pending` with the records owed: a CNAME to the target for a subdomain; A/AAAA to the
   listed addresses for an apex (two labels), or a CNAME that needs flattening (ALIAS/ANAME) when no addresses are
   listed. No external API is called.
3. **Checking** (at add, on the 2-minute sweep, on "Check now") uses `node:dns/promises`
   (`resolveCname`, `resolve4`, `resolve6`). The domain is pointed at us when its CNAME is the target, or when **every**
   address it resolves to is ours (the listed addresses plus the target's own, so a flattened apex counts). Every, not
   some: Let's Encrypt "will always prefer the IPv6 addresses for the initial connection"
   (https://letsencrypt.org/docs/ipv6-support/), so a stray AAAA at a parking page fails the certificate. Pointed →
   `active`; not pointed → `pending`, with the reason; NXDOMAIN → `pending`. A lookup that fails (timeout, SERVFAIL)
   changes only the note, never the state, so a resolver hiccup does not switch off a live domain. A live domain is
   re-checked once a day and goes back to `pending` if its DNS moved away.
4. **`GET /serverXR/api/domain-check?domain=<name>`** is the `ask` endpoint: 200 only for an **active** domain of a
   **public** space, 404 for anything else. It is the same rule as `/api/host`, so a name gets a certificate exactly
   when it would show a space. One read on the table's primary key, and a space lookup only for a live domain.
5. **`Caddyfile`**: a global `on_demand_tls { ask http://server:4000/serverXR/api/domain-check }` and a last block
   `{$CUSTOM_DOMAINS_SITE} { tls { on_demand } reverse_proxy client:8080 }`. It is inert by default:
   `CUSTOM_DOMAINS_SITE` defaults in `docker-compose.yml` to a `.invalid` name, and an on-demand site gets no certificate
   until a visitor arrives. Set `CUSTOM_DOMAINS_SITE=https://` to make it the catch-all for every name the other blocks
   do not claim. No HSTS on that block: it would bind the domain owner's name, which is their decision.

**What it needs:** a machine with a public IPv4 (and IPv6, if listed) address, ports **80 and 443** reaching Caddy (the
HTTP-01 and TLS-ALPN-01 challenges arrive there), the compose profile `https`, and the four values above in `.env`.

**Proof of control** is the same as with Cloudflare: the DNS record itself. A name that does not point here never turns
active, so `ask` never allows it, so no certificate is requested for it.

**Where it does not apply:** the Mac standby, which serves diiii.xyz and dev.diiii.xyz today, does **not** run Caddy. It is
a Cloudflare Tunnel (`cloudflared`, tunnel `di-standby-mac`; di-atlas `machines/mac-standby.md`) in front of an nginx
generated from this repo's `nginx.conf` by `scripts/standby/nginx-conf.sh`. Behind a tunnel there is no public IP for a
domain to point at, so the Cloudflare provider is the one for that machine.

**Limits (stated):**
- **Let's Encrypt rate limits** (https://letsencrypt.org/docs/rate-limits/, read 2026-10-07): 300 new orders per account
  every 3 hours; 50 certificates per registered domain every 7 days; 5 certificates for the exact same set of names every
  7 days; 5 authorization failures per name per account per hour. The `ask` gate keeps strangers from spending them; a
  domain that is pointed here but whose ports are blocked can still use up its own failures, and then waits an hour.
- The first visitor to a newly live domain waits for the certificate during the handshake (seconds).
- Between DNS moving away and the daily re-check, `ask` still says yes, but a renewal would fail validation anyway
  because Let's Encrypt reaches the new address.
- The apex guess is "two labels". A domain under a two-part suffix (`example.co.uk`) is asked for a CNAME at its root,
  which most DNS providers cannot hold; the owner then adds the A record by hand from the instructions.
- Unverified until it runs on a real public-IP machine: the whole path from DNS to certificate has been tested with a
  stand-in resolver and a validated `Caddyfile`, not with a real domain and a real Let's Encrypt issuance.

## Limits (stated)

- **The apex through flattening, inside one account, is unproven.** `yokozo.xyz` will be the first measurement: a DNS-only
  flattened CNAME in a zone of the same account as the SaaS zone. If Cloudflare refuses it, the fallback is to keep
  yokozo.xyz's zone proxied straight to the tunnel. The host → space code is identical either way; only the edge
  differs. Write down what was measured.
- Sign-in, chat and anything that needs a session do not work on the domain, by design. Those links go to diiii.xyz.
- `www.` is a second hostname (a second row); nginx already sends `www.` to the bare host.
- More than 100 domains costs $0.10 each per month. That is the owner's budget line, not a technical limit.

## Owed after this branch

- The Caddy provider on a real public-IP machine: one domain end to end (DNS → `active` → `ask` 200 → certificate),
  measured, with its time to live written down.

- di-atlas: the one-time platform setup script (fallback origin, the `domains` record, the tunnel catch-all) and the
  revised `space-domain.sh` (PR #45 to be reworked).
- A security review pass on the self-serve path before it reaches prod (spec 3c's open question).
