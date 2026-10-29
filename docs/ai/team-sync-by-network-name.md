# Team sync by network name — every install gets a name it can share

Status (2026-10-14): **design only, no product code.** Builds on `docs/ai/one-local-address.md` (§5 guest
path, §9 owed) and di-atlas `decisions/every-install-gets-a-name.md` (2026-09-12). Every claim is marked
**VERIFIED** (read in code or a cited page, 2026-10-14) or **PROPOSAL**. Words follow `docs/ai/vocabulary.md`:
an **install** is one machine's di, a **space** is yours inside it, a **place** is the real room.

## 1. What the owner asked (2026-10-13)

*"when we work with the team and everyone installs and works together, it needs to be synced … I installed di
and I have diiii.localhost, my version … diiii.<my ip> … Ponyo installs the same … and if needed she can send
the same with ip and there will be synced."* His two decisions:
1. **Any machine can be the hub.** People follow each other's di by a network name; no dev server in the room.
2. **Private until the wifi door opens, then instant.** The name and certificate are prepared while private; opening the door only opens the door.

Unchanged: your own address is `http://diiii.localhost/` on every machine (VERIFIED, PR #893: `di status` leads
with it; the certificate's name is one line `phones and headsets: …`, `scripts/di/ui.mjs` `phonesLine`).

## 2. What exists today

- `local.thedi.studio` is one hand-made record plus one certificate, on aylmo only (VERIFIED, atlas decision;
  the domain is on Cloudflare, the API token stays with the owner). Nobody else has a name.
- `di up --lan` binds 0.0.0.0 **per start** and calls the owner's `~/.di/dns-update` hook (VERIFIED,
  `scripts/di/cli.mjs` ~L164–214, `scripts/di/name.mjs` `updateRoomName`). Going public needs a restart.
- `--lan` without `--guests` "hands every visitor the owner's whole estate" (VERIFIED, comment in `cli.mjs`).
- `di invite <space>` mints a per-space, editor-scoped, revocable **sync key**; `di follow <space> --from <url>
  --key … [--at <address>]` follows it; `--at` is the **address pin**: name kept for Host/SNI/certificate,
  socket sent to the given address (VERIFIED, `scripts/di/share.mjs` `pinnedLookup`, `cli.mjs` cmdFollow).
- The place address and its QR panel: `GET /serverXR/api/guest-address` reads the name out of the served
  certificate; states `ready`/`not-on-network`/`no-certificate`/`wildcard` (VERIFIED, `serverXR/src/guestAddress.js`,
  `src/landing/GuestAddressPanel.jsx`). A wildcard certificate gives no address today (VERIFIED).
- The door on :80 serves one exact name and answers 421 to any other Host — the DNS-rebinding guard
  (VERIFIED, `serverXR/src/localName.js`). The rig beacon is UDP broadcast, HMAC-signed with a rig secret
  (VERIFIED, `serverXR/src/rig/discovery.js`). `avahi-publish` gives `di.local` (VERIFIED, `name.mjs`).
- There is no `di wifi` command (VERIFIED, `cli.mjs` command table).

## 3. Research (read 2026-10-14)

| Topic | Finding | Source |
| --- | --- | --- |
| Plex | Each server gets its own wildcard `*.<hash>.plex.direct` (DigiCert); the IP is encoded in the label (`192-168-1-5.<hash>.plex.direct`) and DNS decodes it. Separate domain from plex.tv. | [Valsorda, "How Plex is doing HTTPS for all its users" (2015)](https://words.filippo.io/how-plex-is-doing-https-for-all-its-users/) |
| sslip.io / nip.io | Stateless DNS: `192-168-0-1.sslip.io` answers 192.168.0.1; open-source Go server; a subdomain can be delegated to it. | [sslip.io](https://sslip.io), [wildcard.md](https://github.com/cunnie/sslip.io/blob/master/docs/wildcard.md) |
| Tailscale | `tailscale cert` gets Let's Encrypt certs for `*.ts.net` names; Tailscale writes the DNS-01 TXT, **the private key is made and kept on the machine**; names land in public CT logs. | [Tailscale KB 1153 "Enabling HTTPS"](https://tailscale.com/kb/1153/enabling-https) |
| Let's Encrypt DNS-01 | Proves control by a TXT record; no open port; the only way to get a wildcard. | [LE challenge types](https://letsencrypt.org/docs/challenge-types/) |
| LE limits | 50 new certificates per registered domain per 7 days, shared by every account; 5 per exact name set per 7 days; 5 auth failures per name per hour. "300 new orders per account per 3 h" is **unverified** (page text not reachable from here). | [LE rate limits](https://letsencrypt.org/docs/rate-limits/) |
| Cloudflare | Workers free: 100,000 requests/day, 10 ms CPU; paid from $5/month. API: 1,200 requests per 5 min per user. | [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [API limits](https://developers.cloudflare.com/fundamentals/api/reference/limits/) |
| Rebind protection | OpenWrt dnsmasq drops public answers that point at private addresses unless the domain is in `rebind_domain`; dnsmasq 2.93 (OpenWrt 25.12.5) also counts 100.64/10, which broke `*.ts.net` until listed. FRITZ!Box: "Domain name exceptions", cannot be turned off. | [OpenWrt DHCP/DNS](https://openwrt.org/docs/guide-user/base-system/dhcp), [OpenWrt forum 251494](https://forum.openwrt.org/t/dnsmasq-2-93-openwrt-25-12-5-tailscale-split-dns-broken-by-new-100-64-0-0-10-rebind-protection/251494), [AVM KB 663](https://en.avm.de/service/knowledge-base/dok/FRITZ-Box-4020/663_No-DNS-resolution-of-private-IP-addresses) |
| mDNS | `.local` is not a potentially trustworthy origin, so plain http there has no camera/mic/WebXR; no public CA issues `.local`; name conflicts rename hosts. | [W3C Secure Contexts §3.1](https://www.w3.org/TR/secure-contexts/#is-origin-trustworthy), [RFC 6762 §9](https://www.rfc-editor.org/rfc/rfc6762.html#section-9) |

## 4. The name (PROPOSAL; claim and certificate BUILT 2026-10-28, PR 2)

- **Label:** `<who>-<4 chars>`, e.g. `ponyo-k7q2`, `dob-a3f9`. `<who>` comes from the `di login` account; the
  4 chars are random and make it unguessable-enough and unique per machine (one person, two laptops, two names).
- **Network name:** `ponyo-k7q2.<zone>`; `<zone>` is `l.diiii.xyz` or a separate domain (Q1).
- **Certificate:** one per install, names `ponyo-k7q2.<zone>` **and** `*.ponyo-k7q2.<zone>`. The wildcard also
  covers the address-in-name form `192-168-15-53.ponyo-k7q2.<zone>` (atlas decision) if §5 B is ever turned on.
- **BUILT (PR 2, branch `feat/di-name-2026-10-28`, tested against a fake broker and a fake ACME client only):** `di name` / `--status` /
  `--renew` / `--forget` in `scripts/di/networkName.mjs` + `nameStore.mjs`; files in `~/.di/name/`; `di status` prints the name line;
  `di up` and `di autoupdate run` renew at < 30 days, at most once a day (the CLI exits after `di up`, so the timer's tick is the daily
  check). Zone `l.diiii.xyz`; ACME through `acme-client` 5.4.0 pinned in `serverXR/package.json` (what a packed install runs `npm ci` for).
  Not yet run against the real broker or Let's Encrypt. `scripts/di/name.mjs` is the older mDNS (`di.local`) file, unrelated.
- What a person types: the label only — `di follow show --from ponyo-k7q2`. The CLI adds the zone.
- The address stays `http://diiii.localhost/` for yourself; the network name is for **other** machines.

## 5. How it resolves

**A. Per-install record through a broker (recommended first, PROPOSAL).** The broker writes one A record per
install in the Cloudflare zone, TTL 60. While private it points at `127.0.0.1` (a record that exists avoids a
cached "no such name" delaying the door); when the door opens it moves to the LAN address. Uses only Cloudflare's DNS; no new
server. Cost: one API write per door opening and per address change.

**B. Stateless address-in-name (later, Q3, PROPOSAL).** Delegate `<zone>` (NS) to an sslip.io-style server
on the VPS; `192-168-15-53.ponyo-k7q2.<zone>` answers itself, nothing is ever written, opening the door needs no DNS write
at all. Cost: running authoritative DNS (port 53, two servers for redundancy). The QR would use this form.

**C. No DNS at all, between installs on one wifi (PROPOSAL, §8).** The beacon says "ponyo-k7q2 is at
192.168.15.53:443"; the follower pins it (`--at`, VERIFIED mechanism). Works with the internet cut.

## 6. Each install gets ITS OWN certificate, never our Cloudflare token (PROPOSAL)

The **name broker** is a Cloudflare Worker holding a token limited to DNS edit on `<zone>` (Cloudflare tokens
scope to a zone, not a subdomain — a reason for Q1). Flow, Tailscale-style:
1. **Claim** (once, after `di login`): the install makes an Ed25519 install key, sends its public half plus its
   di login token. The broker checks the account with the dev tier once, stores `label → {account, pubkey}` in KV.
2. **Certificate:** the install runs its own ACME client (its own LE account key), makes its TLS key **locally**,
   and for each DNS-01 challenge asks the broker, signed with the install key, to set
   `_acme-challenge.ponyo-k7q2.<zone>` TXT; the broker deletes it after. The TLS key never leaves the machine.
3. **Address:** signed `PUT address` moves the A record — accepted only for loopback, RFC 1918, 100.64/10 and
   IPv6 ULA, so our domain can never front a public host (no phishing by name).
4. **Abuse limits:** 3 labels per account; 4 orders per label per week; 60 address writes per label per hour;
   writes only under the caller's own label; bad signatures counted and blocked; the owner can revoke a label
   (record + KV) in one call; a removed account loses its labels.
Files: the install's name certificate lives in `~/.di/name/` — **not** `~/.di/tls/`, so aylmo's
`local.thedi.studio` certificate is never touched (VERIFIED: `~/.di/tls/` is what `di up` serves today, `paths.mjs`).

## 7. THE WIFI DOOR — one command, one button, instant (BUILT 2026-10-28, PR 3: `serverXR/src/wifiDoor.js`, `routes/wifiDoorRoutes.js`, `scripts/di/wifiCmd.mjs`, `src/landing/WifiPanel.jsx`; not yet run on a real phone or a real certificate)

**Prepared ahead, while private** (at `di login` or the first `di up` after it): claim the label, get the
certificate, record at 127.0.0.1. Nothing listens on the wifi. `di status` says the name is ready.
**WIFI** (`di wifi`, or the **Wifi** button on the local home top bar; the existing Phones & headsets door
`/#join` becomes the Wifi panel):
1. the server opens a **wifi door**: a listener on the LAN address, port 443 (else the install's port), added at
   runtime like the :80 door — no restart (today `--lan` needs one);
2. the door serves only the install's own names (421 otherwise, the `localName.js` rule) and **always** as
   `--guests`: a visitor is a guest with a sandbox and the open space, never the owner's estate;
3. the broker moves the record to the LAN address (or nothing, under §5 B); the beacon starts announcing;
4. the panel shows the QR of `https://ponyo-k7q2.<zone>/` and the line for di people:
   `di follow <space> --from ponyo-k7q2` (+ `--key`, from `di invite`, which stays per space).
**Close door** (`di wifi --stop`, same button): door closed, record back to 127.0.0.1, beacon silent.
After a restart the install is private again, like `--lan` today; the Wifi button is pressed again (the name and certificate are kept).
A restart closes the door but the broker keeps the last address it was given (measured 2026-10-29: 06:11 restart, the name still answered the wifi address). So a start points the record home: one signed PUT `127.0.0.1` about 5 s after start (one retry after 60 s), logged as `name record pointed home`.
`di wifi --stop` on an already closed door does the same now; `di wifi --status` says when the name still points at a wifi address while the door is closed.
The name certificate's CN is the plain name, so `guest-address` reads one address from it (VERIFIED rule: CN first).

## 8. `di follow --from <name>`, peer to peer (BUILT 2026-10-28, branch feat/follow-by-name-2026-10-28; two-machine offline proof still owed)

`di follow show --from ponyo-k7q2 --key dii_sync_…` resolves the address in this order, and keeps the name for
Host, SNI and the certificate check every time (the address pin, VERIFIED):
1. **the beacon** on this wifi: a new unsigned `di-name` announcement `{label, port}`; an announcement is only a
   hint — trust comes from the certificate, which a liar cannot present;
2. **DNS** of the network name (§5 A/B);
3. **the last address that worked** (stored with the follow).
Offline on one wifi: step 1 is enough; certificate checks need no internet. Owed measurement from
`one-local-address.md` §9.6: two machines, internet cut. Any machine can be the hub: the follow engine already
carries ops and files both ways (VERIFIED, CURRENT.md "Follow"); a chain dob → ponyo → kiara works because each
install is both. Across the internet: out of scope — the dev tier, or Tailscale with `--at` (VERIFIED, exists).

## 9. What `di status` prints (PROPOSAL)

```
http://diiii.localhost/  — di.iiii running                         (unchanged first line, #893)
private · name ready: ponyo-k7q2 (certificate until 2027-01-12) · di wifi to open it
```
Open:
```
http://diiii.localhost/  — di.iiii running
open on this wifi (192.168.15.53) · phones and headsets: https://ponyo-k7q2.l.diiii.xyz/
following: show ← dob-a3f9 (this wifi) · 2 follow you
```
One line when something is wrong, naming the fix: `name not ready: broker unreachable — retry at next di up`,
`the router hides ponyo-k7q2 from phones — see di wifi --router`.

## 10. Address changes and renewals (PROPOSAL)

- **DHCP:** while open the server checks its addresses every 10 s; on change the door rebinds, the broker
  moves the record (TTL 60), the beacon says the new address. Followers find it by beacon within seconds.
- **Several interfaces** (wifi + cable + Tailscale): the default-route interface; `di wifi --on <address>` picks.
- **Renewal:** LE certificates last 90 days; renew at 30 days left, at `di up` and daily while running. A failed
  renewal never touches `http://diiii.localhost/`; `di status` says the date. LE has announced shorter lifetimes
  (**unverified** schedule) — the daily check covers that.
- **LE limit:** 50 per registered domain per week (VERIFIED) is shared by every install **and** the owner's
  other `diiii.xyz` certificates. 90-day renewals mean about 400 installs before it binds — fine for a team;
  the zone is `l.diiii.xyz` for now (§15 Q1).

## 11. The router limit, and its one-line fix

Phones ask the router; a router with rebind protection drops `ponyo-k7q2.<zone> → 192.168.x.x` (VERIFIED for
OpenWrt default and FRITZ!Box). Installs are unaffected (they use the beacon, §8). On OpenWrt, once:
```
uci add_list dhcp.@dnsmasq[0].rebind_domain='l.diiii.xyz'; uci commit dhcp; /etc/init.d/dnsmasq restart
```
(Forum posts also show the `/l.diiii.xyz/` form; **unverified on dob-0** which one its dnsmasq takes — test both.)
`di wifi --router` prints this line and the FRITZ!Box path. Offline places: the router answers itself
(`address=/ponyo-k7q2.l.diiii.xyz/192.168.15.53`, `one-local-address.md` §5 b).

## 12. Security

- Private key per install, made locally, never shared (atlas decision: a shared key is dangerous once a name
  points at a reachable address). The Cloudflare token lives only in the Worker.
- Names only point at private or loopback addresses; a label belongs to one install key.
- The wifi door: own names only (421), guests always, owner rights only on loopback / `diiii.localhost`.
- Following needs a per-space sync key (VERIFIED: editor, one space, revocable). the wifi door hands out no keys.
- Certificate Transparency publishes every label (VERIFIED for Tailscale, same for any public CA): `<who>`
  must be a handle, never a full name. The wildcard hides the addresses.

## 13. Costs

Cloudflare DNS and Workers free tier: 0 € (one door opening ≈ 3 Worker requests). Let's Encrypt: 0 €. KV free tier: 0 €.
A separate domain (Q1): one yearly registration (**unverified** price, typically ~10–20 €). §5 B adds a DNS
server on the existing VPS: 0 € but an always-on service to watch. Build: five PRs below.

## 14. Build plan (each one PR, about 50–85 executor tool calls)

| # | PR | What the owner sees after |
| --- | --- | --- |
| 1 | **Name broker** (Worker + tests against a fake Cloudflare API; claim, TXT, address, limits, revoke). | A deploy line to run with his token; `curl` health. No change on installs. |
| 2 | **`di name`**: claim after `di login`, ACME DNS-01 through the broker, `~/.di/name/`, renewal. | `di status`: `private · name ready: dob-a3f9 (certificate until …)`. |
| 3 | **`di wifi` + Wifi button**: runtime wifi door, guests forced, record move, QR on the panel, wiki entry; verified on a real phone. | Press Wifi → phone scans → padlock, camera, WebXR. |
| 4 | **Follow by name**: `--from <label>`, beacon, last-address memory; two machines with the internet cut. | `di follow show --from ponyo-k7q2` works on the same wifi, offline. |
| 5 | **Router help and IP changes**: `di wifi --router`, address watcher, `di status` lines; (optional) §5 B DNS. | A DHCP change mid-session heals itself; phones blocked by the router get the one line. |

## 15. Questions only the owner can answer

**2026-10-29 (owner):** di-studio.xyz is being dropped (not renewed); the kept domains are diiii.xyz and thedi.studio. The zone is `l.diiii.xyz` until thedi.studio is on Cloudflare (owed: add the zone there and change its nameservers at GoDaddy; then `ZONE` and `DI_NAME_BROKER` move and names get new certificates). The broker writes only `<label>.<zone>` records and its token is scoped to that one zone.

1. **Zone (decided 2026-10-29, ledger N1418.10/.11):** `l.diiii.xyz`, broker `https://name.diiii.xyz`; a separate domain, so a broker breach never touches `thedi.studio` and the certificate limit is its own.
   - **Why not `l.thedi.studio`:** thedi.studio is not a Cloudflare zone (its nameservers are GoDaddy's, `ns67/68.domaincontrol.com`), so the broker cannot write records there.
   - **Owed move:** when the owner moves thedi.studio to Cloudflare (GoDaddy → Domains → thedi.studio → Nameservers → "Change" → enter the two nameservers Cloudflare shows for the zone; Cloudflare then imports the records), the zone can become `l.thedi.studio`. It is a config value (`ZONE` in `wrangler.toml`, `DI_NAME_ZONE` on an install), so the move is one value, not code; installs already named keep their name until they re-claim.
   - **Reviewer's note (Opus R20):** diiii.xyz also carries live hosts (dev, prod, name). Mitigation: the broker writes only `<label>.<zone>` and `_acme-challenge.<label>.<zone>` records (its name guard rejects any other name), and its `CF_API_TOKEN` is scoped to Zone → DNS → Edit on diiii.xyz only.
2. **Label:** `<who>-<4 chars>` from the `di login` handle, or fully random? **Recommend the handle form** —
   people say "follow ponyo", and CT logs see only a handle.
3. **Stateless DNS (§5 B):** run our own nameserver for the address-in-name form, or stay on broker records?
   **Recommend broker records now**, nameserver only if opening the door is delayed or Cloudflare writes become a problem.
