## 2026-10-14 — Design: every install gets a network name it can share; teams sync machine to machine

Branch `docs/team-sync-design-2026-10-14`, from `dev`. Design only, no product code:
`docs/ai/team-sync-by-network-name.md`.

- Answers the owner's 2026-10-13 ask ("Ponyo installs the same … and there will be synced"): any machine can be the
  hub; each install is private until SHARE, and SHARE is instant because the name and certificate are made ahead.
- Proposed: a label per install (`ponyo-k7q2`), a per-install certificate (name + wildcard) whose key never leaves
  the machine, a Cloudflare Worker name broker that holds the only Cloudflare token (DNS-01 TXT and an A record
  limited to private/loopback addresses), `di share` + a Share button (runtime LAN door, guests always),
  `di follow --from <label>` found by beacon first so it works offline on one wifi.
- Research cited with dates: Plex plex.direct, sslip.io, Tailscale cert, LE DNS-01 and limits, Cloudflare Workers
  and API limits, OpenWrt/FRITZ!Box rebind protection, mDNS secure-context limits.
- Not verified from here: LE "new orders per account" number (page unreachable), which `rebind_domain` form dob-0's
  dnsmasq takes, LE's shorter-lifetime schedule, the price of a separate domain.
- Owed: the owner's three calls (zone, label form, stateless DNS), then five PRs in the doc's §14.
