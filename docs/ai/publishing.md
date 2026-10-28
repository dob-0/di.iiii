# Publishing — the share door

Checked 2026-10-21. Code: `serverXR/src/share/` · routes `serverXR/src/routes/shareRoutes.js` · CLI `scripts/di/post.mjs` (`di post`).
Words: **post**, **share channel**, **share door** ([vocabulary.md](vocabulary.md)). Why a feature, not a script:
[decisions/2026-10-21-share-door.md](decisions/2026-10-21-share-door.md).

## What it is

A **post** about a space or project is drafted, shown as a page, and sent to share channels through one contract.
This phase: Telegram channel, Bluesky, Mastodon. Instagram, Threads and YouTube are phase 2 (decision record).
Admin only on every route; the tokens never leave the server's environment.

## The chat flow

1. The lead drafts: `di post draft --text "…" --link https://diiii.xyz/<space>/<slug> --media <space>/<asset> --to telegram,bluesky`
   (prints the id and the preview address).
2. The preview page opens on the owner's screen (`di-show <preview address>`): the post as each channel will show it,
   the characters against the channel's limit, the pictures, any refusal ("text is 340 of 300").
3. His word. Nothing is sent before it.
4. `di post send <id>`: approves and sends. One result per channel (link or reason). A channel that failed can be
   retried with the same command; a channel that already posted is never posted twice.

`di post show <id>` · `di post channels` (connected / missing per channel). Against a remote di: `--from https://dev.diiii.xyz`
with the login of `di login` (same rule as `di move`). A local install with auth off acts as admin.

## HTTP (all admin-gated)

| Route | What |
| --- | --- |
| `GET /api/share/channels` | status per channel + capabilities, never a secret |
| `POST /api/share/posts` | `{ text, link, media[], channels[] }` → draft + `previewUrl` |
| `GET /api/share/posts`, `GET /api/share/posts/:id` | list (newest first), one |
| `POST /api/share/posts/:id/send` | approve + send channels that have not posted |
| `GET /share/posts/:id/preview` | the preview page (di.iiii frame, light and dark) |

`media` entries: an absolute http(s) URL, or `<space>/<assetId>` (a file already in that space), optional `{ kind, alt }`.
Status: `draft → approved → sent | failed`; `results[channel] = { ok, url | error }` is kept between attempts.

## The channel contract (`share/channels.js`)

```js
{ name, capabilities: { text, image, video, link, maxText, maxImages, maxImageBytes, maxVideoBytes },
  status() → { name, state: 'connected' | 'missing', detail },          // never prints a secret
  send(post, { loadMedia }) → { url?, id? } }                           // throws ShareError(code, message)
```

## Environment (server side only, `config.js` → `config.share`)

| Channel | Variables |
| --- | --- |
| Telegram | `SHARE_TELEGRAM_BOT_TOKEN`, `SHARE_TELEGRAM_CHAT` (`@channel` or numeric id; the bot must be an admin of it) |
| Bluesky | `SHARE_BLUESKY_HANDLE`, `SHARE_BLUESKY_APP_PASSWORD` (an app password), `SHARE_BLUESKY_PDS` (default `https://bsky.social`) |
| Mastodon | `SHARE_MASTODON_URL`, `SHARE_MASTODON_TOKEN` (scopes `write:media write:statuses`) |

## Limits each API sets (checked 2026-10-21)

| Channel | Limits | Docs |
| --- | --- | --- |
| Telegram | text 4096; caption 1024 (longer text goes as a second message); photo ≤ 10 MB, file ≤ 50 MB; album 2–10 | https://core.telegram.org/bots/api#sending-files |
| Bluesky | 300 graphemes; ≤ 4 images, each ≤ 1,000,000 bytes; links need facets (UTF-8 byte offsets); no video in this phase | https://docs.bsky.app/docs/advanced-guides/post-richtext |
| Mastodon | 500 characters (instance-set; a link counts 23); ≤ 4 attachments; image ≤ 16 MB, video ≤ 99 MB (mastodon.social defaults) | https://docs.joinmastodon.org/methods/statuses/ |

The door checks these before it calls anything, so a refusal costs no half-sent post.

## Add a channel (≤ 30 lines)

1. `serverXR/src/share/<name>.js`: `createXChannel({ config, fetchImpl })` returning the contract above. Use
   `requestJson` (`http.js`) for calls and `loadAll(channel, post, loadMedia)` (`channels.js`) for media + the shared checks.
   Header comment: the API's doc URLs and the limits, with the date.
2. `config.js`: add `share.<name>` from `process.env.SHARE_<NAME>_*` (trimmed; unset = "missing").
3. `shareService.js`: add the adapter to the `registry` list.
4. Tests in `share/share.test.js`: the fake HTTP server there answers by path; cover send, missing token, API 4xx, media too big.
5. This file: the env row and the limits row.

## Not tested here

A real send to any channel: no token exists on the machine that built this. The adapters are tested against a fake server
that follows each API's documented calls. First real send = one draft to a private test channel, then this line is updated.
