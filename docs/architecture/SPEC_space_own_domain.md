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

## When Cloudflare is not configured

Without `CLOUDFLARE_SAAS_*` in the environment (a local install, or dev), a domain can still be saved. It shows "waiting
for the platform to be connected", and the host lookup works for a domain an admin marks active by hand. The code path
is the same either way. Nothing pretends to be live.

## Limits (stated)

- **The apex through flattening, inside one account, is unproven.** `yokozo.xyz` will be the first measurement: a DNS-only
  flattened CNAME in a zone of the same account as the SaaS zone. If Cloudflare refuses it, the fallback is to keep
  yokozo.xyz's zone proxied straight to the tunnel. The host → space code is identical either way; only the edge
  differs. Write down what was measured.
- Sign-in, chat and anything that needs a session do not work on the domain, by design. Those links go to diiii.xyz.
- `www.` is a second hostname (a second row); nginx already sends `www.` to the bare host.
- More than 100 domains costs $0.10 each per month. That is the owner's budget line, not a technical limit.

## Owed after this branch

- di-atlas: the one-time platform setup script (fallback origin, the `domains` record, the tunnel catch-all) and the
  revised `space-domain.sh` (PR #45 to be reworked).
- A security review pass on the self-serve path before it reaches prod (spec 3c's open question).
