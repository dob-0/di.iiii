## 2026-10-07 — adding the same domain twice at once no longer throws (stacked on #793)

- Found while reading the new own-domain code for the bug sweep. `domainService.add` checked for an existing row, awaited Cloudflare, then inserted; the table's primary key made a second concurrent add throw, and the route answered 500 for a domain that was in fact registered. Reproduced on dev and on the Caddy branch with two concurrent adds (one request rejected); both the same-space double submit and two spaces typing one name.
- The name is now reserved before the first await and given back if Cloudflare refuses it. The new DNS path of #793 already inserted first; only the Cloudflare path had the gap.
- Stacked on `feat/space-own-domain-caddy-2026-10-07` (#793) because that branch rewrites `domainService.js`; merge #793 first, then this (retarget to dev).
- Undone: the owner's look is not needed (no screen); a crash between the reservation and Cloudflare's answer leaves a pending row without a Cloudflare id — `sweep` drops it after the pending window, and the owner can remove it by hand. Not changed here.
