# The sign-in hub

**Problem.** Google and GitHub only return people to addresses registered with
them, and Google refuses private IPs and wildcards. A local install, a test stack
on `:4362`, a laptop on a festival wifi, a stage box — none of them can be
registered one by one, so none of them could offer "Sign in with Google".

**Answer.** One server, the hub (`https://diiii.xyz`), is registered once. Every
other di.iiii sends a person there and gets back a signed **pass**; it then makes
its *own* session for that identity. This is the "OAuth proxy" pattern (Auth.js
`redirectProxyUrl`, Better Auth `oAuthProxy`).

```
browser ── /serverXR/api/auth/google ──▶ this server        sets di_hub cookie (nonce), no Google app here
        ◀─ 302 hub/api/auth/hub/start?provider&return&nonce
        ── hub ── Google (the hub's registration) ── hub
        ◀─ 302 <return>?pass=<JWT, EdDSA, 2 min, aud=return, nonce>
        ── /serverXR/api/auth/hub/callback ──▶ this server   checks pass, upserts user, own session
```

## The pass

A JWT (RFC 7519) in JWS compact form, signed with Ed25519 (EdDSA, RFC 8037).
Claims: `aud` (the exact callback URL), `nonce`, `exp` (2 min), `jti`, and the
identity (`provider`, `providerId`, `email`, `name`, `avatar`).

| Defence | Stops | Guard |
|---|---|---|
| Signature (hub's private key; servers pin the PUBLIC key) | forged or edited passes | `authHub.test.js` |
| `aud` = this server's own callback URL | a pass minted for one server used on another | `authHubRoutes.test.js` |
| `nonce` in a signed, HttpOnly cookie in the person's own browser | login CSRF: planting a pass on someone else | both |
| `jti` single use, `exp` 2 min | replay | both |
| Allowlist of return addresses on the hub | handing an identity to an arbitrary site | both |

No secret is shared with any install; a pass is checked offline.

## Offline

The hub is the *online* door only (Google and GitHub need the internet anyway).
`/api/auth/providers` probes the hub (3 s timeout, cached 60 s / 20 s) and
reports Google/GitHub only when it answers **with the pinned key**; offline the
page offers what works locally: the owner at the machine (`DI_LOCAL=1`, no sign
in), existing sessions (issued locally, keep working), password accounts, invites.

## Configuration

Nothing, on any server that is not the hub: `OFFICIAL_HUB_URL` and
`OFFICIAL_HUB_PUBLIC_KEY` are built in (`serverXR/src/authHub.js`).
`AUTH_HUB_URL=off` opts out. The hub alone sets `AUTH_HUB_SIGNING_KEY`
(generated 2026-09-28; private half at `~/.config/di-hub/` on aylmo, backup in
`~/di-backups/di-hub/`). Rotating: new key pair, new public key in `authHub.js`,
release, then the new private key on the hub.

## Not yet

- Telegram through the hub (the bot mints links for one server; it needs a hub
  return address in its `/login` flow).
- A LAN IP (`http://192.168.x.x`) is not on the default allowlist; use a
  front-door name (`https://local.thedi.studio`).
