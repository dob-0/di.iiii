# di name broker

A Cloudflare Worker that gives each di install its own network name, `<label>.<zone>`
(zone `l.thedi.studio`, label `<who>-<4 chars>`, e.g. `dob-a3f9.l.thedi.studio`), and moves
that name's records when the install asks, signed with its install key. The install
makes its TLS key and runs its own ACME client; the broker only writes the DNS-01
challenge record. The Cloudflare token lives only in this Worker's secret.

Design and reasons: [docs/ai/team-sync-by-network-name.md](../../docs/ai/team-sync-by-network-name.md)
§4–§6, §10, §12 (this is PR 1 of its §14 build plan; PR 2, `di name`, is the client).

## Contract

Every error is JSON `{ "error": "…" }`. Every write logs one line
`{"label","op","outcome"}`; tokens are never logged.

| Call | Answer |
| --- | --- |
| `GET /v1/health` | `200 { ok: true, zone, version }` |
| `POST /v1/claim` `{ pubkey, loginToken, labelHint? }` | `201 { label, zone, name, record: "127.0.0.1" }` |
| `PUT /v1/labels/:label/txt` `{ name: "_acme-challenge", value }` (signed) | `204` |
| `DELETE /v1/labels/:label/txt` (signed) | `204` |
| `PUT /v1/labels/:label/address` `{ address }` (signed) | `204`; `400 { error: "address must be private" }` |
| `DELETE /v1/labels/:label` (header `X-Di-Admin: <ADMIN_TOKEN>`) | `204`: records and the KV entry gone |

**Claim.** `pubkey` is the install's Ed25519 public key, raw 32 bytes, base64url.
`loginToken` is the install's `di login` token (`dii_cli_…`); the broker asks the dev
tier once, `GET https://dev.diiii.xyz/serverXR/api/auth/cli/whoami`
(`serverXR/src/routes/cliLoginRoutes.js`), and keys the label to `user.id`.
`<who>` is `labelHint` cleaned to `[a-z0-9-]` when given, else the first word of the
whoami `user.name`. That field is a display name, or an email when there is none; the
dev tier has no handle field yet, and Certificate Transparency publishes every label,
so the whole name is never used. The broker stores `label:<label> → { account, pubkey, createdAt }`
in KV `LABELS` and writes the A record `<label>.<zone> → 127.0.0.1`, TTL 60, not proxied.

**Signed calls.** Headers `X-Di-Label`, `X-Di-Ts` (unix seconds, within ±120 s) and
`X-Di-Sig` = base64url Ed25519 signature over

```
${METHOD}\n${path}\n${ts}\n${sha256hex(body)}
```

with the label's install key (`path` is the URL path, e.g. `/v1/labels/dob-a3f9/txt`;
an empty body hashes the empty string). A call under another label gets `403`. A bad,
stale or replayed signature gets `401` and is counted.

**Address.** Accepted: `127.0.0.0/8`, `10/8`, `172.16/12`, `192.168/16`, `100.64/10`
(A record) and `::1`, `fc00::/7` (AAAA record; the A record is dropped, and the other
way round). Anything else is refused, so the zone never fronts a public host.

## Limits

| What | Limit | Above it |
| --- | --- | --- |
| labels per account | 3 | 409 |
| certificate orders (TXT PUTs) per label | 4 per week | 429 |
| address writes per label | 60 per hour | 429 |
| bad signatures per label | 20 per hour | 429 for that label until the next hour |
| label | `[a-z0-9-]`, 3–40 chars | — |

Windows are fixed (calendar hour / week since 1970), counted in KV. KV is eventually
consistent and has no atomic increment, so two calls in the same instant at two edges
can both pass: a limit may be exceeded by a few under a burst. For a team that is
fine; Durable Objects are the exact fix if it ever matters.

## Deploy (the owner, once, in his window)

```bash
cd services/name-broker
npm install                                   # pinned wrangler, dev only
npx wrangler login                            # once per machine
npx wrangler kv namespace create LABELS       # put the printed id into wrangler.toml
# CF_ZONE_ID in wrangler.toml: dashboard → thedi.studio → Overview → Zone ID
npx wrangler secret put CF_API_TOKEN          # a token with Zone → DNS → Edit on thedi.studio only
npx wrangler secret put ADMIN_TOKEN           # a long random string, e.g. openssl rand -hex 32
npx wrangler deploy
curl -s https://di-name-broker.<account>.workers.dev/v1/health   # { ok: true, zone, version }
```

The broker's address is `https://name.thedi.studio` (owner, 2026-10-28, N1418); add it as a custom route in `wrangler.toml` (`routes = [{ pattern = "name.thedi.studio", custom_domain = true }]`) at deploy. The zone itself is the `ZONE` var in `wrangler.toml`.

Revoke a label: `curl -X DELETE -H "X-Di-Admin: $ADMIN_TOKEN" https://…/v1/labels/<label>`.

## Rollback

`npx wrangler delete` removes the Worker; the DNS records it wrote stay until deleted
in the dashboard (each is `<label>.l.thedi.studio` or `_acme-challenge.<label>.l.thedi.studio`).
Installs keep `http://diiii.localhost/` either way.

## Tests

```bash
npx vitest run services/name-broker     # from the repo root
```

A fake Cloudflare API and a fake dev tier (one `fetch` stub that records calls) and a
fake KV (a `Map`); no network. Covers health, claim, uniqueness, the account limit,
signatures (wrong key, changed body, clock window, replay, other label, the 429 block),
TXT set/delete and its weekly limit, one case per private range and public refusals,
the hourly address limit and admin revoke.
