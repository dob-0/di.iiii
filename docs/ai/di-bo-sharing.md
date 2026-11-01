# di.bo as the easy link — how di.bo hands out links and carries shared things

Status (2026-10-29): **design only, no product code.** Builds on `docs/ai/team-sync-by-network-name.md` (the name, the wifi door,
follow by name), the two drafts that are still open, #1164 (`di-on-phones-and-headsets.md`) and #1168 (`how-we-work-together.md`),
and `docs/architecture/TELEGRAM_ACT_TOKEN.md`. Every row is **VERIFIED** (read in code or a cited page, or a command run, 2026-10-29)
unless it says **MEASURED** (a command run that day, output quoted), **PROPOSAL** or **UNCHECKED**. Words follow `docs/ai/vocabulary.md`:
an **install** is one machine's di, a **space** is yours inside it, a **place** is a real room in the world. **di.bo** is the owner's
Telegram helper (`@diiii111bot`), built in the di-bo repo and running on the Mac. di.bo facts were read on di-bo `origin/master` e81d133
(2026-10-29 05:32 +04); di.iiii facts on `origin/dev` (this branch starts at 120eb286e, where the load-bearing lines were re-read).

## 1. What the owner asked (2026-10-29, ledger N1476)

*"yes and also we can use the di bo for easy link and things share and use so we can integrate di bo to"*

The "yes" at the start answers another question (the merge queue on dev, N1475); the ask is the part after "also". The sentence stops
at "to" and has no object. The reading, in one line (what · where · done when): **di.bo hands out the easy links (the wifi link with
its QR, an install's name, a space link) and carries shared things (files, pictures, proofs) between people and their installs.
First, di.bo sends him the wifi link so his phone arrives as a guest. Done when his phone, on the same wifi, opens that link with a padlock.**

The ending has two readings that lead to different builds, so the rule is one question with both (Q1, §8):
- **A — "too":** bring di.bo into tonight's network-name work: the link, the QR and the follow line travel through the chat he already has.
- **B — "into di.iiii":** make di.bo a door of the platform: sign-in, files carried into a space, approvals.

Slice 1 (§4) is the same under both readings. Nothing past slice 1 is built before he picks. Context of the night: the network-name
build landed (`di name`, `di wifi` with the Wifi panel and its QR, follow by name) and his install opened its wifi door live at 05:24
(N1418.16.5). A phone on that wifi is still his hand: the guest view has not been seen on a phone.

## 2. What exists today

### 2.1 di.bo (the Telegram helper)

| Fact | Source |
| --- | --- |
| **Where it runs.** The Mac: LaunchDaemon `xyz.di.dibo`, bot `@diiii111bot`. The console bot `@the_di_studio_bot` is a separate, older program. The VPS is gone. Deploy window 13 put e81d133 live at 05:47 +04. | di-bo `CURRENT.md:10-23`; the deploy-window log of 05:47 |
| **What it knows of di.iiii.** One base URL (`DI_SERVER`; on the Mac its own serverXR). Calls: `GET /api/spaces`, `GET /api/health`, a space's projects, scene and root, and `POST /api/auth/telegram/login-link`, `/whoami`, `/act-token` with the header `x-telegram-login-secret`. **Nothing about an install, a name, a wifi door or a QR** (no code hit for them; the only `wifi` hits are prose about venue wifi). | di-bo `bot.mjs:190,301,483,656,1025,1696,1724,2924,3332`; grep over the repo |
| **Links it hands out.** `${SITE}/<space>` buttons on /start, /spaces and /production. `DI_SITE` is unset on the Mac, so the buttons point at di-studio.xyz while the bot's description names diiii.xyz. Both answered 200 to HEAD on 2026-10-29. **di-studio.xyz is being dropped (owner, 2026-10-29, team-sync §15)**; the lapse date is not in the sources. | di-bo `bot.mjs:194,635-661,3335-3378`; di-atlas `tools/dibo-mac/overrides.env:55`; `curl -I` of both hosts |
| **Sign-in.** /login (private chat only) mints a one-time, 10-minute link through `login-link`. Telegram sign-in is on for prod only: `GET /serverXR/api/auth/providers` gives `telegram:true` (bot `diiii111bot`) on diiii.xyz and `false` on dev and on the local install. Dev lacks its two Telegram secrets. | di-bo `bot.mjs:1712-1740`; three `curl` calls 2026-10-29; owner's open-threads note |
| **Receive.** Keeps every message kind from the owner and the ids in `KEEP_FROM` (text, caption, forward with its origin, reply, edit, location, contact, poll, and the file kinds document, video, audio, voice, animation, video note, photo) in an inbox per day. Files up to 20 MB come through the Bot API, larger ones through MTProto up to the Mac's 2 GiB ceiling. A link pasted as text is kept as plain text. Typed text in a private chat is answered by the provider chain (`ANSWERS=everyone`); a forward or a file is kept, not answered. aylmo pulls the inbox every 15 min and checks every sha256. | di-bo `lib/fetch.mjs:47-57,135-175`, `lib/answers.mjs:103-131`, `sync/pull-inbox.sh`; Bot API page, fetched 2026-10-29 |
| **MEASURED (2026-10-29, aggregate only, no names or text read).** The pulled manifest has 447 rows: 446 saved, 1 refused (2,217,042,299 bytes, over the 2 GiB ceiling). 22 saved files are over 20 MB; the largest saved is 255,019,509 bytes. 2 distinct sender ids. | `python3 -I` over `manifest.jsonl` on aylmo |
| **Send.** `scripts/dm.mjs` (`--to <numeric id>`, `--text-b64`, `--from`, `--file`, `--dry-run`) and `scripts/send-file.mjs` (`--to <id>` or `owner`, documents up to 50 MB, caption up to 1024). Both run on the Mac: the script is piped into its node with `bot.env` loaded. Each send adds a row to `DM_LOG` (who, when, message id, first 200 characters). **There is no `sendPhoto`, no `copyMessage` and no QR. There is no guard in code for "owner present", for quiet hours (23:00-08:00 Asia/Yerevan) or for groups: `--to` takes any numeric id, negative group ids included.** Those rules are habit. A bot cannot write first, so only people who pressed /start can be reached. | di-bo `scripts/dm.mjs:4-40`, `scripts/send-file.mjs:5-33`; grep of `bot.mjs lib scripts` at e81d133 |
| **Groups and answers.** di-bo's own list names: owner, core, crew, partner, registered, stranger. Routes: core and crew Anthropic API → Ollama cloud → local servers → one plain line; partner and registered Ollama → local → plain; stranger local → plain. The plan logins are never used to answer other people (ledger N1388). Strangers: 60 messages and 20 files an hour each, 600 an hour all together; an output scan blocks replies that name a tailnet address, a home path or a machine name. Crew ids are unknown (they have not written); whether core people pressed /start is UNCHECKED. | di-bo `lib/groups.mjs`, `lib/guard.mjs:164-169`, `lib/stranger.mjs`; deploy-window log 05:47 |
| **Where a message ends up.** `observe.jsonl` (with `OBSERVE=1`: other people's words, no retention rule, "grows forever"), that day's `messages.jsonl` (pulled to aylmo), `DM_LOG`, and Telegram's servers. UNCHECKED here: that bot chats are cloud chats, not end-to-end encrypted (Telegram's FAQ, not fetched). A secret sent through di.bo lands in all of them. | di-bo `bot.mjs:2542-2587`, `README.md:241-263` |

### 2.2 di.iiii: the name, the wifi door, follow, and the bridge to di.bo

| Fact | Source |
| --- | --- |
| **Built on dev.** `di name` (#1159), `di wifi` with the server door and the Wifi panel (#1160), follow by name (#1166), `di wifi` proving the owner with the install token, default zone `l.diiii.xyz` (#1173). Not built: `di wifi --router`, the `di status` open/private lines, address-in-name DNS. | `git log` of the files below; `scripts/di/wifiCmd.mjs:55-56` |
| **The link.** `https://<label>.l.diiii.xyz`, with `:<port>` unless 443 (`wifiUrl`). The panel draws the QR only while the door is open; `di wifi` prints a terminal QR when `uqr` (0.1.3) can be imported. The follow line is `di follow <space> --from <label>`; the door hands out no key. | `src/landing/WifiPanel.jsx:15-24,71-79`, `scripts/di/wifiCmd.mjs:21-49`, `package.json` |
| **Who opens the door.** Only the person at the machine. `GET`, `POST` and `DELETE /api/wifi-door` answer 403 `owner-only` to anything that came through the wifi door, a proxy or a tunnel, and to another machine; a di.bo act token is not the install's own token, so it does not pass either. A local process on the machine passes the guard (a `GET` without a token answered 200). Whoever arrives through the door is a guest: a sandbox of their own and the Open Space, never the owner's spaces. | `serverXR/src/routes/wifiDoorRoutes.js:13-62`, `serverXR/src/localOwner.js:28-65`; probe 2026-10-29 |
| **MEASURED: the record can be stale (2026-10-29 06:27 +04).** After a restart at 06:22:10, `GET /serverXR/api/wifi-door` says `open:false` and only `127.0.0.1:443` listens, while 1.1.1.1 and the authoritative server both answer `A 192.168.15.53` with TTL 60 (the same at 06:32:53, door still closed). The record moves back to 127.0.0.1 only on the close path (`LOOPBACK_ADDRESS` is used nowhere else in `wifiDoor.js`); no boot-time re-point was found. Two reviewers saw the same at 06:17 after a restart at 06:11. The door's state lives in memory only, so DNS can say "open" for a door that is closed. | `serverXR/src/wifiDoor.js:30,145-149,230,246`; `curl`, `dig`, `ss -ltn`, `systemctl --user show di-server` |
| **The name.** `handleOf` slugs the account's display name (`user.name`, else `user.id`), so a two-word name becomes `first-last-<4 chars>`. The owner's live label reads as a full name and is already in Certificate Transparency logs; team-sync §12 says "a handle, never a full name". The broker has no lookup route (a label sits in KV as `label:<label>`): a label cannot be found from an account or a Telegram id. | `scripts/di/networkName.mjs:90-100`; `services/name-broker/README.md`; team-sync §12 |
| **Not yet seen or built.** The guest view on a real phone or headset (padlock, camera, WebXR); a router that hides the name (the one-line fix is documented only); two installs following by name with the internet cut. | team-sync §7, §8, §11 |
| **The bridge to di.bo.** Routes registered only when `TELEGRAM_LOGIN_SECRET` is set: `login-link`, `whoami`, `act-token`, `callback`. An act token is a 15-minute bearer that acts as the account bound to a Telegram id with that person's own role (root: the owner; admin; everyone else member, capped at editor); every write shows as "<name> via di.bo". Refused through it: `/api/auth/**`, `/api/users/**`, sync keys, integrations, `/api/dm/**`, approvals, `POST /api/invites/redeem` and owner changes. **The gate has no rule for `POST /api/spaces/:spaceId/join-codes`** (no "join" in `actTokenGate.js`); whether the route refuses an act token by itself is UNCHECKED. | `serverXR/src/actTokenGate.js:32-67`, `serverXR/src/catalogue/entries/access.js:69-81`, `docs/architecture/TELEGRAM_ACT_TOKEN.md` |
| **Ways to share today.** `di invite <space>`: a per-space, editor-scoped, revocable sync key that lives for months (`di follow <space> --from <url> --key <key>`). A web invite link, valid 7 days (Studio, Copy invite). A join code: four words, 10 minutes, single use, made by the owner or an admin in the Studio (space, Manage, Invite a machine) and used on the other install with Join. The share door (`di post`) sends public posts; its Telegram channel has its own token and chat (`SHARE_TELEGRAM_BOT_TOKEN`), is not routed through di.bo, and was verified only against a fake server. | `scripts/di/cli.mjs:1098-1155`, `serverXR/src/index.js:2950-2964`, `serverXR/src/follow/join.js`, `serverXR/src/share/telegram.js`, `docs/ai/publishing.md` |

### 2.3 The two open drafts, and what they leave open

- **#1164** (draft, 0 comments): a phone or headset with no install keeps the no-install route (scan the host's QR) as the default; an own
  local-first store in the browser is the second route; a pocket hub covers people working offline together. Five owner questions are open (N1419.2).
- **#1168** (draft, 0 comments): a new space starts private on the install where it was made; sharing means following the hub (dev); the
  public is a one-way promote; `di share <space>` (unbuilt) would carry a private space up to dev. Five owner questions are open (N1432).
- Neither mentions di.bo (no hit for di.bo, dibo, telegram or bot in them or in team-sync), and both predate the merges of #1160 and #1166.
- **The hub is not settled.** Team-sync records the owner's decision "any machine can be the hub" (2026-10-13); #1168 rule 2 says "Installs never
  follow each other (star, not mesh)", with dev as the hub, and asks it as its own Q1. **This design does not decide it.** A link names the host the person at the install
  picks: the label for a follow on the same wifi, the dev address for the hub.
- `di share` names two things (the wifi door in the wiki and in `beacon.js`; #1168's unbuilt carry command) and "share door" already means
  posting. The real wifi command is `di wifi`. This design uses neither `di share` nor "share door" for the wifi link.

## 3. The integration points, ranked (PROPOSAL)

Two designs were written, owner-first and people-first, and judged twice against the written rules. Owner-first won (31 and 32 against 30
and 31, out of 40): it is the only first slice that leaves the owner a checked link on his phone every time the door opens, with no
extra touch. It took the people-first design's guards. The rank is: fewest touches for him, most of it already built, least risk. di.bo is a
door, not a messenger between people: they already have Telegram.

| # | Point | Who | Builds on | Size |
| --- | --- | --- | --- | --- |
| 1 | **The door link on his phone.** When the wifi door of his install opens, his Telegram gets one checked link; one "Closed" line when it shuts. (§4) | the owner | `GET /api/wifi-door`, `wifiUrl`, `dm.mjs` | S |
| 2 | **Guards in code on the send scripts.** Owner-only by default, 08:00-23:00 Asia/Yerevan, key-like text refused, a negative id only when picked, one `DM_LOG` row per send. Before anything goes to another person. | everyone messaged | `dm.mjs`, `send-file.mjs` | S |
| 3 | **The di.bo wifi handler.** `t.me/diiii111bot?start=w_<label>_<port>` and `/wifi`: one photo message, the QR with the link as caption, edited to "Closed" when the door shuts. A "send to Telegram" line in `di wifi` and in the Wifi panel; the door status carries the bot name; the install re-points its record to 127.0.0.1 at boot. This is point 1's product home. | every owner of an install, for their own door | `/start` payloads (`bot.mjs:1786-1791`), `editMessageText`, `uqr`, `moveRecord` | M, plus two S in di.iiii |
| 4 | **`/link` and the right site.** `/link <space>[/<project>]` answers one link, sent only after it answers 200. `DI_SITE` moves to diiii.xyz, before di-studio.xyz lapses. | the owner, then anyone who taps a button | `/spaces` links, the golden rule on public links | S |
| 5 | **Pictures and files into a space.** A caption `#<space>` (or a button from `whoami`) puts a kept file into the space's library as the bound person. | the owner first, later core | the scrubbed upload route, the act token, the inbox pull | M |
| 6 | **A join code through di.bo.** The person with an install gets "four words, 10 minutes, once" and joins; never a key. Needs the gate rule first. | the owner, then a person with an install | `follow/join.js`, `access.js:69-81` | S, plus the gate |
| 7 | **Crew start links.** `t.me/diiii111bot?start=c_<signed token>`: one use, 7 days; the tap binds that person's Telegram id to a name. | crew, partners | the `/start` switch, `handleTunnelStart` (`bot.mjs:2262`), di-contacts | S to M |
| 8 | **One line for what core sends.** "<name>: 2 pictures, 1 link, kept", at most once an hour per sender; a link-only message costs no model call. | the owner | `noteOwner`, the keep receipt | S |
| 9 | **Sign-in on the hub.** /login and `whoami` against dev for core and crew. | core, crew | the Telegram routes already in dev's code; dev's two secrets | M to L |
| 10 | **A notice signed by an install.** Any install tells di.bo "door open, port N", so point 1 works for everyone and away from home. | everyone with an install | the install key; a broker lookup route that does not exist | L |
| 11 | **`/send`.** The owner picks a person, sees the exact text, presses Send. Held on Q4. | the owner | points 2 and 9 | M |
| 12 | **The right address for this person.** One question, "open <space>", answered with the public, the hub or the wifi link that works for them now. Last: it needs 3, 4, 9 and 10. | everyone | points 3, 4, 9, 10 | L |

Reading A buys points 1 to 4, 6 and 10; reading B adds 5, 8, 9, 11 and 12; points 2 and 7 serve both. A headset test is not a build: Telegram
Web signed in once on the headset's browser makes every di.bo link open with one tap instead of typing a 33-character name. It runs only as a
one-time test, with a logout, on a headset no one else wears, because whoever wears it reads all his chats.

Why this order. Point 1 is the first thing N1476 names, needs nothing new in di-bo or di.iiii, and turns the Wifi button into a ping on his phone.
Point 2 is small and blocks every send to another person. Point 3 is point 1 made a product feature for every install (rule: nothing is left behind).
Points 4 and 5 are the "easy link" and the "things share and use" of his words. Points 9 to 12 wait on points 3 to 5 and on his pick.

## 4. The first slice — the door link on his phone (PROPOSAL; size S; can be live the same day)

**Name:** `di-wifi-phone`, a tool in di-atlas `tools/`, run as a systemd user service on aylmo (the pattern of `di-inbox-pull.timer`). It
replaces the pending `dibo-wifi-link.sh` with its defects fixed: line 11 sent to the first of `ADMIN_TELEGRAM_IDS`, not to the owner; the
URL dropped the port; nothing checked that the door answers; `dm.mjs` was piped from a moving checkout; the text named a machine and a
command. It changes nothing on the Mac, in di-bo or in di.iiii.

1. **Read the state** every 3 s on the install (an owner-at-the-machine call, no token):
   `curl -sS -H 'Host: diiii.localhost' http://127.0.0.1/serverXR/api/wifi-door` gives `{"open":…,"name":…,"address":…,"port":…,"since":…}`.
2. **Closed to open, held for 2 reads:** `URL=https://<name>/`, with `:<port>` when the port is not 443 (the `wifiUrl` rule, `WifiPanel.jsx:24`).
3. **Check, then send.** Both must pass, retried for at least 60 s (the record's TTL) before giving up:
   `curl -sS -o /dev/null -w '%{http_code} %{ssl_verify_result}\n' --resolve <name>:<port>:<address> "$URL"` prints `200 0`, and
   `dig +short <name> @1.1.1.1` prints `<address>`. If either fails the link is not sent: the owner gets one line saying why ("the wifi door
   says open but does not answer"), and the reason goes to `~/.local/state/di-wifi-phone/status.json` and the journal (it never fails silently).
4. **Send to the owner only,** with `dm.mjs` pinned at di-bo e81d133: a file kept in di-atlas whose sha256 is checked before it runs, so a
   moving ref cannot change what is piped. The tool never reads another job's checkout:
   `ssh -o BatchMode=yes di-mac 'set -a; . /usr/local/di-bo/etc/bot.env; set +a; exec /usr/local/di-bo/deploy/node/bin/node - --to "$OWNER_TELEGRAM_ID" --text-b64 <b64>' < dm.mjs`
   The first run adds `--dry-run`, which prints the target id. No `--from` (it would add a signature line). Rate cap: 6 sends an hour.
5. **The text** (three lines, 12 words or fewer each, safe to forward): `Open on this wifi, as a guest.` then the URL, then
   `Only on the same wifi, while the wifi door is open.` Open to closed sends one line: `Closed. This wifi link rests until the next open.`
6. **Install and undo.** Installed from the merged di-atlas PR by `install-bin.sh`, then `systemctl --user enable --now di-wifi-phone.service`.
   One command undoes it: `systemctl --user disable --now di-wifi-phone.service`.

**Its test.** Passes only as listed; the first line is the one that counts.
- **On his phone, his hand once:** he presses Wifi at `http://diiii.localhost/#join` with his phone on the same wifi. The message arrives within 20 s of
  the door's `since`, and one tap opens the guest view with a padlock and http 200. Only this counts as "seen"; the rest is the tool's own checks.
- **Owner only:** the dry run prints his id. After one open and close, `DM_LOG` has exactly 2 new rows, both to that id, none to any other.
- **Today's fault:** with the record at the LAN address and the door closed (`open:false`, connection refused) the tool sends 0 messages and
  its status says "the door does not answer".
- **Close:** after `di wifi --stop`, "Closed" arrives within 20 s and `dig +short <name> @dina.ns.cloudflare.com` prints 127.0.0.1 within 60 s.
- **Restart while open:** `systemctl --user restart di-server`; the tool reports closed within 10 s and the authoritative record is back at
  127.0.0.1 within 60 s. **This is expected to fail today** and files the boot re-point row (point 3).
- **Service context:** one send from the user service exits 0 and prints a message id (BatchMode ssh, no agent prompt).
- **Message check:** every line has 12 words or fewer (di-bo's rule, `lib/lines.mjs`), and the text has no hit for `aylmo`, `di-mac`, `192.168.`,
  `di wifi`, `your` or `team`.

This slice is a **named workaround**: estate glue that lives outside the product. Rows owed the same night (nothing is left behind): point 3 (its
product home), the boot re-point in di.iiii, his answer on the label (Q3), point 2 (the guards), and the pinned `dm.mjs`.

## 5. Later slices (PROPOSAL; each is its own PR, in the order of §3)

**Slice 2 — points 2 and 3** (a di-bo PR and a di.iiii PR).
- Needs first: Q1 and Q3 (the label goes into a QR that travels); a run on r-di; then the Mac through the safe route: `dibo-mac-deploy.sh SHA=<sha>`
  (its built-in `PIN` is stale) in his password window. The di.iiii part lands on dev first, then `di update --from` on aylmo.
- Passes when: di-bo `npm test` prints `Tests N passed` with N above 0, and the new tests show: a `w_<label>_<port>` payload is accepted only at 64
  characters or fewer of A-Z a-z 0-9 _ -, with a label of a-z 0-9 - and a port of 1-65535 (the underscore splits cleanly, labels carry hyphens);
  the handler makes 0 HTTP requests for a label not bound to the owner (a spy) and asks 1.1.1.1; a public A record is refused as "not a wifi door"
  and 127.0.0.1 means closed; the reply holds a link and a QR photo and 0 addresses; the guards refuse at 23:00 and 07:59, send at 08:00, refuse any
  presser but the owner, and refuse text with `dii_sync_`, `dii_tgact_` or a PEM header. QR round trip: 20 URLs (port 443 and others) encoded and
  decoded with `qrencode` and `zbarimg` (both in `/usr/bin` on aylmo) and with `uqr`, 20 of 20 exact. A forward to a second account on the same wifi
  opens as a guest with a padlock; on mobile data it does not open. A stranger gets 0 state lines and 0 addresses, and the 61st message in an hour
  is refused. On di.iiii: a restart while open leaves the authoritative record at 127.0.0.1 within 60 s.

**Slice 3 — point 4** (`/link`, `DI_SITE`; a di-bo PR and one line in di-atlas `tools/dibo-mac/overrides.env`).
- Needs first: the check that both hosts serve the same spaces. Public links are permanent (golden rule), and di-studio.xyz is being dropped.
- Passes when: for every space from `GET /api/spaces`, `curl -sL` on both hosts gives 200 and the same body sha256; after the deploy every /spaces
  button starts with `https://diiii.xyz/`; `/link` answers only after a 200; the old host keeps answering for as long as it exists.

**Slice 4 — point 5** (pictures and files into a space).
- Needs first: Q1 = B. On prod the route is the 15-minute act token and `POST /api/spaces/:spaceId/assets` (EXIF and GPS scrubbed, `spaceRoutes.js:1448-1460`),
  and only where Telegram sign-in is on (prod today). For his own install, which has no Telegram sign-in, a `di` command imports from the pulled
  inbox by caption, as the owner at the machine (the 15-minute pull and its sha256 check exist).
- Passes when: a JPEG with GPS EXIF and the caption `#<space>` is stored with no GPS (`exiftool -gps:all` prints nothing) and history shows
  "<name> via di.bo"; the same file from an unbound id stores nothing; the manifest row keeps sender, date, sha256 and caption. Files to a person go by
  `copyMessage` of the kept message (no re-upload, no 50 MB cap, PROPOSAL): the largest kept file (255,019,509 bytes) arrives with the same sha256.

**Slice 5 — point 6** (a join code through di.bo).
- Needs first: a rule for `POST /api/spaces/:spaceId/join-codes` in `actTokenGate.js`, with its test; the other install must have Join (UNCHECKED
  for any install but his own); the text passes the vocabulary check (no host name). Sent only live, with his yes for that exact text, 08:00-23:00.
- Passes when: `POST /api/spaces/<id>/join-codes` with a `dii_tgact_` bearer answers 403 `not_through_di_bo`; `di follows` on the other install
  lists the space within the 10 minutes; a second use answers invalid-code; `grep -c dii_sync_` over `observe.jsonl`, that day's `messages.jsonl`
  and `DM_LOG` gives 0.

**Slice 6 — points 7 to 9.** Crew start links pass when a second tap gets the ordinary door, a token older than 7 days or with a bad signature binds
nothing, and `/forget` removes the binding; the row goes to di-contacts (N1472) before the deployed group list. The drop line passes when a burst of
10 messages from one sender gives at most 1 owner line an hour, strangers cause 0, and a link-only message from core causes 0 model calls. Sign-in on
the hub needs dev's two Telegram secrets (his password window) and a second server in di.bo, which today mints against one.

**Held.** Points 10 to 12 and the headset test wait for slices 2 to 6 and for Q4.

## 6. Risks and rules

- **A phone arrives as a guest, never as him.** By code everything through the wifi door is a guest (the `diWifiDoor` mark): the Open Space and a
  sandbox, never his spaces. If he expects his spaces on his phone that is a different build (Q2).
- **The link works on that wifi only, while the door is open.** A forward to someone elsewhere is a dead link, so the message says so. A phone that
  looked the name up while the door was closed may keep 127.0.0.1 for up to 60 s (TTL).
- **State comes from the install, never from DNS alone.** The stale record was measured at 06:17 and 06:27 (§2.2). A restart or `di update` closes
  the door silently; the "Closed" line says it.
- **Home proves nothing for a venue.** The Mac shares aylmo's wifi today, so a check from the Mac works at home only; at a venue the tool can repeat
  what DNS says but cannot confirm the door answers. A router with rebind protection may drop the name. Reported by the design pass, not re-run: the
  home router passes the name (NOERROR) but answers FORMERR to every EDNS query. `di wifi --router` is not built. Telegram's in-app browser may open the
  link itself; padlock, camera and WebXR there are UNCHECKED.
- **Tokens.** Nothing that lasts longer than ten minutes goes in a message: no sync key (`dii_sync_`), act token (`dii_tgact_`), `ADMIN_API_TOKEN`,
  install key, bot token or 7-day invite. Join codes and login links (10 minutes, once) go only in a private chat, with `protect_content` (it stops a
  forward, not a screenshot). A message is kept in `observe.jsonl`, `messages.jsonl`, `DM_LOG` and on Telegram's servers: a key sent once is a key
  kept four times. /login stays private-chat only.
- **Strangers.** Anyone can craft a `w_` link with any label. So di.bo builds the URL itself under `l.diiii.xyz`, accepts only a-z 0-9 -, answers from
  public DNS only, and never fetches or probes a label that is not bound to the owner (a crafted label could point the Mac at its own LAN or loopback:
  SSRF and DNS rebinding). Strangers get no state line, no address, no push, no dev link, no join code and no file into a space; each request counts
  against the stranger budgets. di.bo never becomes a way to find someone's install.
- **Consent and quiet hours.** Three written rules bind every send: only live, with him in the chat seeing the exact text and saying yes for that
  send (2026-10-22); nothing to another person between 23:00 and 08:00 Asia/Yerevan (2026-10-22); a deploy or restart can message nobody but him
  (2026-08-20). Today they are habit, not code (§2.1); point 2 makes them code. Slice 1 messages only the owner. A bot cannot write first and crew ids
  are unknown, so points 7 and 11 reach only people who tapped. Replies come to the bot, not to him: with `ANSWERS=everyone` a reply to a di.bo send is
  answered by the provider chain on the shared credit unless `/send` relays it (point 11, held).
- **Credits.** A link, a QR and a "Closed" line are templates: no model call, 0 tokens. A pasted link typed as text is answered by the chain on the shared
  credits (Console API keys, Ollama cloud), never on the plan logins, which carry our own work (owner 2026-10-28; Anthropic's terms, N1388). Point 8
  keeps a link-only message from a core person at 0 model calls. Telegram costs nothing; the lookups are DNS and one request.
- **Provenance and consent.** Everything carried in keeps sender, date, sha256 and caption, and "licence unknown" until the owner sets one. A picture
  belongs to the person who took it and may show other people: nothing carried in is published without his look and the space owner's decision. The
  upload route strips EXIF and GPS; the inbox keeps the originals, so the inbox is as private as `observe.jsonl`.
- **Words and names.** The owner's label reads as a full name (Q3). `vocabulary.md` has no rows for install, guest, label, join code, hub or follow
  (owed before slice 2 adds strings). di-bo's group names core, crew and partner are its own list; "crew" also names rig tools; di-bo's test bans "team"
  while `vocabulary.md` defines it as a space's members. A di.bo string carries no host or tier name ("the page is not the changelog"), so
  "Join dev.diiii.xyz with…" would break it. No `di share`, no "copy" for an install.
- **Deploy and failure.** di-bo changes are rehearsed on r-di, then deployed with a pinned SHA; di.iiii changes land on dev first (dev and local stay
  one). The console bot runs older code, so everything here targets `@diiii111bot`. If di.bo or the Mac is down no link arrives by Telegram: the Wifi
  panel QR, `di wifi` and Invite a machine stay the primary route, and the tool of §4 says so in its status file.

## 7. Not-do

- Never let a Telegram message, the Mac or ssh open the wifi door. It opens only for the person at the machine (`wifiDoorRoutes.js:21-38`).
- No secret that lasts longer than ten minutes in any message (§6), and no minting of sync keys or invites through di.bo. di.bo carries a join code a
  person made; it never makes one.
- No automatic push to other people: a door opening never messages a person, a group or a guest. No message to another person unless he sees the
  exact text and says yes for that send; none between 23:00 and 08:00 Asia/Yerevan; no group unless he picks it.
- No model in the path of a link: a model can mangle the URL, and its answer spends the shared credits.
- Never say "open" from DNS alone (refuted, §2.2). Never fetch or probe a network-name URL for a label taken from a `/start` payload, and never from the
  Mac for a label that is not bound to the owner.
- No LAN address, machine name (aylmo, di-mac), `*.localhost` address or tailnet address in a message: only the name link.
- Do not use the share door (`di post`) for the wifi link: a post is public and needs approval, the wifi link is private to one wifi.
- No second bot, and di.bo's token stays on the Mac: never copied to an install or into `SHARE_TELEGRAM_BOT_TOKEN`.
- Do not read another job's checkout (the local di-bo is on another branch, 34 commits behind) or pipe an unpinned `dm.mjs`; never treat the first of
  `ADMIN_TELEGRAM_IDS` as the owner.
- No service that looks up labels, and no second people list in di.bo: Telegram sign-in is the one bridge and di-contacts the source of who is who (N1472).
- Never change what an existing public address resolves to. `DI_SITE` changes what new buttons say; old links keep answering while their host exists.
- No 7-day invite in a message, no Telegram Web left signed in on a headset others wear, and no join code to another person before he answers Q1 and says yes
  to that exact send.
- Nothing builds his phone as him on his install through the bot without his word (Q2). di.bo is never the only route.
- Nothing past slice 1 before Q1.

## 8. Questions only the owner can answer

1. **Reading (Q1).** "Integrate di bo to…": **A** = too, bring di.bo into tonight's network-name work (links, QR, follow line in your chat), or **B** =
   into di.iiii, make di.bo a door of the platform (sign-in, files into spaces, approvals)? **Recommend A now**: slice 1 is the same, and B builds on A.
2. **Guest (Q2).** Your phone on the wifi door arrives as a guest, with the Open Space and none of your spaces. Is that enough? **Recommend yes**;
   your own spaces on your phone is a different build.
3. **Label (Q3).** Your install's name reads as your full name and is already in public certificate logs. Keep it, or claim a new one from a handle
   before any link goes out? **Recommend re-claim**: a forwarded QR spreads it.
4. **Present (Q4).** May a Send button you press later on your phone count as "you are in the chat, see the exact text and say yes for that send"?
   **Recommend no**, which keeps the 2026-10-22 rule as written and holds point 11.
5. **Crew links (Q5).** May di.bo make a one-tap start link for each crew member, so their Telegram ids come from their own tap? **Recommend yes**:
   a bot cannot write first and the ids are unknown.

## 9. Sources

- **Ledger (the owner's rows):** N1476 (this ask), N1475 (merge queue), N1432 (workflow), N1419 (phones and headsets), N1418.16.5 (the wifi door live),
  N1447 (who uses which credit), N1388 (the plan login stays his), N1472 (contacts), N1461.2 (join code), N650 (di.bo keeps every message).
- **di-bo** `origin/master` e81d133 (2026-10-29 05:32 +04): `scripts/dm.mjs`, `scripts/send-file.mjs`, `bot.mjs`, `lib/fetch.mjs`, `lib/answers.mjs`,
  `lib/groups.mjs`, `lib/guard.mjs`, `lib/stranger.mjs`, `lib/lines.mjs`, `tests/vocabulary.test.mjs`, `README.md`, `CURRENT.md`, `AGENTS.md`.
- **di-atlas** `origin/master` bd51bfd: `tools/dibo-mac/overrides.env`, `tools/dibo-mac-deploy.sh`, `services/di-bo.md`.
- **di.iiii** `origin/dev` (121b54897 to 120eb286e): `serverXR/src/wifiDoor.js`, `serverXR/src/localOwner.js`, `serverXR/src/routes/wifiDoorRoutes.js`,
  `serverXR/src/routes/authRoutes.js`, `serverXR/src/actTokenGate.js`, `serverXR/src/catalogue/entries/access.js`, `serverXR/src/follow/join.js`,
  `serverXR/src/share/telegram.js`, `serverXR/src/routes/spaceRoutes.js`, `scripts/di/wifiCmd.mjs`, `scripts/di/networkName.mjs`,
  `scripts/di/cli.mjs`, `src/landing/WifiPanel.jsx`, `docs/ai/team-sync-by-network-name.md`, `docs/ai/publishing.md`, `docs/ai/vocabulary.md`,
  `docs/architecture/TELEGRAM_ACT_TOKEN.md`; open drafts #1164 and #1168 (read 2026-10-29: both still open, 0 comments, 0 reviews).
- **Pages fetched 2026-10-29:** Telegram Bot API, https://core.telegram.org/bots/api (getFile "up to 20MB", sendDocument "up to 50 MB", message text 1-4096,
  caption 0-1024); Telegram bot features, https://core.telegram.org/bots/features (the `start` parameter: up to 64 characters of A-Z a-z 0-9 _ -).
- **Not re-fetched today:** Anthropic legal and compliance, https://code.claude.com/docs/en/legal-and-compliance ("Authentication and credential use";
  read 2026-10-27 and 2026-10-28): routing requests through Free, Pro or Max plan credentials on behalf of users is not permitted.
- **Commands run 2026-10-29 06:27 +04 (read only):** `curl -sS -H 'Host: diiii.localhost' http://127.0.0.1/serverXR/api/wifi-door`, `dig +short <name> @1.1.1.1`
  and `@dina.ns.cloudflare.com`, `ss -ltn`, `systemctl --user show di-server.service -p ActiveEnterTimestamp -p NRestarts`, `git grep` and `git show` on the
  files above. No message was sent, nothing was deployed or started.
