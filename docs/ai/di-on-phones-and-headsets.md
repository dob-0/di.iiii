# di on phones and headsets — no install, or their own copy, by case

Status: **DESIGN, not built.** Written 2026-10-28 for ledger N1420. Every fact line names its source (a file:line in
this repo on `docs/di-on-phones-2026-10-28` = origin/dev `bfc508bf0`, or a URL read on 2026-10-28). A line without
a source we read is marked **UNVERIFIED**. Estimates are marked **estimate**.

## 1. The question

The owner, verbatim (2026-10-28):

> "Limit: a phone or headset has no di installed, so diiii.localhost on it opens nothing ... we need to fix this ..
> its mean 2 or we need to write new tools there where everyone in phone and headset can run dii and work their
> copies we need to how"

> "but yes also we need to folow method where there are not need to install its depend from the case"

In our words: a laptop with di installed keeps its own spaces and projects, works with no internet, and follows the
others. A phone or a headset cannot do that today. We need **two routes side by side**, chosen **by case**:

- **(i) No install.** The phone, headset or guest laptop opens an address and works at once.
- **(ii) Own copy.** The device keeps its own spaces and projects, works alone with no laptop and no internet, and
  follows the others when one can be reached.

## 2. What we have today (read from the repo)

| Piece | What it is | Source |
| --- | --- | --- |
| The install | Node + Express + socket.io + `node:sqlite` + `sharp` (a native image library). Needs Node ≥ 22.5. About 67,800 lines of non-test JS in `serverXR/src`. | `serverXR/package.json:5-6` and `dependencies`; `serverXR/src/db.js:1` (`DatabaseSync` from `node:sqlite`); `find serverXR/src -name '*.js' ! -name '*.test.js' \| xargs wc -l` → 67803 |
| Where a project lives | One folder per project: `project.json`, `document.json`, `ops.json`; space and project lists in SQLite (`spaces`, `space_ops`, `projects`, `project_ops`). | `serverXR/src/projectStore.js:13-15`; `serverXR/src/db.js:12-61` |
| The op log | Every edit is an op with an `opId`; a write states `baseVersion` and gets 409 if the target moved. | `docs/architecture/SPEC_follow.md:14-19` |
| How ops are applied | **One function, shared by the install and the browser:** `applyProjectOps` in `shared/projectSchema.cjs`, mirrored as `src/shared/projectSchema.js`. | `shared/projectSchema.cjs:2116`; `serverXR/src/routes/projectRoutes.js:1133`; `src/project/state/projectStore.js:2` |
| Follow | A follower pulls and pushes each stream's op log over plain HTTP; **only the host has to be reachable**; the host's order wins a same-field race (Figma's server-ordered rule); a follower that holds things the host lacks is not overwritten and asks `--take-host` / `--take-mine`. | `docs/architecture/SPEC_follow.md:14-16, 28-55` |
| Follow, pure parts | `followPlan.js` (189 lines) and `followConverge.js` (169 lines) need no Node module; `follower.js` (1281 lines) needs Node's HTTP client and the store. | `grep require serverXR/src/follow/{followPlan,followConverge}.js`; `wc -l` |
| Follow, limits | Star only (two followers never talk); same-field intent is not kept (CRDT owed); no discovery wired to follows. | `docs/architecture/SPEC_follow.md:264-276` |
| Edits kept in the browser | Unacknowledged ops already sit in IndexedDB (`idb-keyval`) so a reload or a dead install loses nothing. Files too (`src/storage/assetStore.js`). | `src/project/services/pendingOpsStore.js:1-18` |
| Service worker | Only for the chat (`/chat-sw.js`, scope `/chat`), network-first, shell only. It refuses to stand in front of the editor on purpose: "A stale app shell served to a person authoring a scene is a far worse bug than a chat that needs the network." | `public/chat-sw.js:1-15`; registered at `src/chat/StudioChatSurface.jsx:209` |
| Web app manifest | `display: standalone`, start `/`, so "add to home screen" opens di full-screen. No offline promise. | `public/manifest.webmanifest` |
| Android wrapper | A Bubblewrap Trusted Web Activity for the chat only (`xyz.distudio.chat`, start `/chat`, host `diiii.xyz`). It is the website in a Play package, not an install. | `android-twa/twa-manifest.json` |
| Devices without di today | The host's install shows one HTTPS place address as a QR code (`di up --lan`); `*.localhost` on a phone is the phone itself. | `docs/ai/one-local-address.md` §1.3, §3 |
| Name per install | `di share` + follow by name (PRs 3 and 4 of that plan, PROPOSAL). | `docs/ai/team-sync-by-network-name.md` §7, §8, §14 |
| Size of the web app | `dist` = 124 MB, of which JS = 9.2 MB and `dist/assets` = 97 MB. Measured on `~/work/di.iiii/dist`, a build of a commit we did not check (**UNVERIFIED for this commit**). | `du -sh dist`; `find dist -name '*.js' \| xargs du -cb` |
| How the app reaches its data | 137 lines in `src` name `serverXR/api`; the app assumes an install answers. | `grep -rn "serverXR/api" src --include=*.js --include=*.jsx \| wc -l` |

**What this means:** the hard part of an own copy (the op format, applying ops, deciding who wins, keeping
unsent edits) is already shared code or browser code. What only exists inside the install is the store
(SQLite + folders), the HTTP routes, and the follower's loop.

## 3. The options

### A. The phone stays a client of a laptop or hub (today)

The device opens the host's place address (QR). Its work lives on the host.
- Offline: works with no internet as long as the host is in the room (the place address resolves on the place's
  wifi; offline follow between installs is **UNVERIFIED**, `one-local-address.md` §4).
- Without the host: nothing. The phone has no copy.
- Sources: `docs/ai/one-local-address.md`; `docs/ai/team-sync-by-network-name.md`.

### B. A real install on the device

**B1. Termux (Android).** Termux recommends F-Droid or GitHub; the Google Play build "has missing functionality and
bugs", and Termux "may be unstable on Android 12+" because Android may kill background processes
(https://github.com/termux/termux-app, read 2026-10-28). It needs a terminal, a Node build that has `node:sqlite`,
and `sharp` built for the phone's CPU (**UNVERIFIED**: not tried). Not a product for a crew or an artist.

**B2. serverXR packed inside an app with nodejs-mobile.** The latest release is **v18.20.4, based on Node.js
18.20.4** (https://github.com/nodejs-mobile/nodejs-mobile/releases, read 2026-10-28; the page shows no year). Our
install needs Node ≥ 22.5 and uses `node:sqlite` (`serverXR/package.json:6`, `serverXR/src/db.js:1`), which Node 18
does not have. So B2 means either a nodejs-mobile port to Node 22+ (nobody has shipped one we can find) or replacing
the store, plus `sharp` cross-built for Android and iOS. Licence: the repo links a LICENSE file that our fetch did
not name (**UNVERIFIED**).

**iOS.** App Store Review Guideline 2.5.2: apps "may not … download, install, or execute code which introduces or
changes features or functionality of the app"
(https://developer.apple.com/app-store/review/guidelines/#2.5.2). A server bundled in the app is not forbidden by
that text, but the di web app loaded into it changes with every deploy; shipping it inside the bundle per release
is what 2.5.2 leaves. Guideline 2.5.4: background services only "for their intended purposes: VoIP, audio playback,
location, task completion, local notifications" (same page) — so an install on an iPhone stops answering when the
app is in the background, and cannot be a host for others.

**Verdict:** B is the most work, the most risk, and on iOS cannot host. Recorded, not recommended.

### C. A local-first copy in the browser (the app and its data on the device)

The app is installed from its address as a web app (a PWA: a manifest + a service worker that keeps the app files).
Spaces, projects, ops and files live in the browser (IndexedDB; files in IndexedDB or OPFS). Edits apply locally
with the same `applyProjectOps`. When a host is reachable (dev.diiii.xyz, or a place's host or pocket hub), a
**browser follower** carries ops both ways over the existing follow routes.

- **It fits the follow engine as it is:** "The follower does all the reaching, so only the HOST has to be reachable"
  (`SPEC_follow.md:15-16`). A browser cannot accept connections, so a browser copy is always a follower — which is
  exactly the shape follow already has.
- **Method:** Ink & Switch, "Local-first software" (Kleppmann, Wiggins, van Hardenberg, McGranaghan, 2019,
  https://www.inkandswitch.com/essay/local-first/): ideals 1 "No spinners", 2 "Your work is not trapped on one
  device", 3 "The network is optional". Our merge today is server-ordered (an op log with the host's order), not a
  CRDT; the essay's CRDT route is the owed upgrade already listed in `SPEC_follow.md:266`.
- **Storage, measured by the vendors (MDN, read 2026-10-28,
  https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria):**
  - Chromium (Android Chrome, Quest Browser is Chromium-based): up to 60 % of the disk per origin.
  - Safari/WebKit (iOS 17+, visionOS): about 60 % per origin in the browser and for home-screen web apps; 15 % for
    web content inside other apps.
  - Firefox: best-effort min(10 % of disk, 10 GiB); persistent up to 50 %.
  - Safari "proactively evicts" script-written data of an origin with no user interaction in the last seven days of
    browser use, when tracking prevention is on (MDN, same page). WebKit grants `navigator.storage.persist()` "based
    on heuristics like whether the website is opened as a Home Screen Web App"
    (https://webkit.org/blog/14403/updates-to-storage-policy/). Whether a home-screen web app is exempt from the
    seven-day rule is **UNVERIFIED** (neither page says so). So: on iPhone, the copy must be a home-screen web app,
    must ask for persistence, and must follow a host whenever one is reachable. A phone-only copy that is never
    followed can be lost; that is the stated limit.
- **Background:** Background Sync is supported on Chrome Android and not on Safari iOS
  (https://caniuse.com/background-sync, read 2026-10-28). So sync happens while the app is open; on iPhone, only
  then.
- **What changes in the app:** the editor gets an offline app shell (today refused on purpose, `chat-sw.js:6-9`, so
  it must be versioned and say "a new version is ready" instead of serving a stale one silently), and a data layer
  that answers from the device when no install answers (the 137 `serverXR/api` lines go through one local store).
  The precache holds the app (~9 MB JS, **UNVERIFIED for this commit**), not the 97 MB of `dist/assets`.

### D. A pocket hub (a Pi-class box in the bag)

A small machine runs a normal di install and its own wifi; phones and headsets use it as **their** copy through
route A, or follow it through route C. r-di (the owner's Pi) is the rehearsal machine; di + node on r-di is still
owed (`~/.claude/CLAUDE.md`, rule "Rehearse on r-di").
- It reuses everything: the install, `di up --lan`, the place address, `di share` (team-sync PR 3).
- Limit: Debian on aarch64; `sharp` publishes linux-arm64 builds (**UNVERIFIED**, not tried on r-di); a battery
  and the box are hardware, which is the owner's to buy.

### Options table

| | A. client of a host | B. install on the device | C. local-first browser copy | D. pocket hub |
| --- | --- | --- | --- | --- |
| No internet, host present | works | works | works, follows the host | works |
| No internet, no host | nothing | works (Android only) | works alone, syncs later | works (the hub is the host) |
| Two phones sync offline | through the host | only via a host | only via a host or hub | yes, through the hub |
| Android phone | yes | Termux / nodejs-mobile, hard | yes (Chrome) | yes |
| iPhone | yes | cannot host (2.5.2, 2.5.4) | yes, as a home-screen app; storage limit above | yes |
| Meta Quest | yes (Quest Browser) | **UNVERIFIED** | yes (Chromium storage) | yes |
| Apple Vision Pro | yes (Safari) | as iPhone | as iPhone (WebKit) | yes |
| Guest laptop | yes | it can install di | yes | yes |
| Cost (estimate) | 0 (built; PR 3 of team-sync) | 6+ PRs, weeks, a Node 22 mobile port | 5 PRs, ~8–12 days | 2 PRs + a box |
| Main risk | no host, no work | port + store review; iOS cannot host | storage eviction on iOS; host-wins conflicts after a long offline | hardware to carry and charge |

## 4. Headsets

- **Meta Quest:** Quest Browser is Chromium-based and runs WebXR; the Horizon Store takes web apps packaged with
  Bubblewrap as a Trusted Web Activity (`bubblewrap init --manifest=<url> --metaquest`), "Choose `immersive` app
  mode only when the packaged app launches into an immersive WebXR session"; "A web app can remain available through
  its website without a PWA package" (https://developers.meta.com/horizon/documentation/web/pwa-overview/, updated
  2026-07-22). Same tool as our `android-twa/`.
- **Apple Vision Pro:** WebXR `immersive-vr` is on by default in Safari from visionOS 2; `immersive-ar` was reported
  unsupported before that (UploadVR, https://uploadvr.com/visionos-2-apple-vision-pro-webxr; Apple forum
  https://developer.apple.com/forums/thread/743655). Secondary sources; **UNVERIFIED** against Apple's own notes.
- **iPhone:** no WebXR in Safari iOS at any version caniuse lists (https://caniuse.com/webxr, read 2026-10-28).
- **WebXR needs a secure context** (`one-local-address.md` §2), which is why the place address is HTTPS.
- **Background:** a headset browser tab, like a phone's, syncs only while open (Background Sync absent on WebKit,
  above; Quest **UNVERIFIED**).

## 5. By case

| Case | Route | What they type or scan | What works offline | Owed to build |
| --- | --- | --- | --- | --- |
| A guest at a place with a host laptop | **(i) no install** — A | scan the QR on the host's screen → `https://<place address>/` | everything, while the host runs | team-sync PR 3 (`di share`, QR); a real-phone check |
| A crew member with only a phone, no laptop, no internet | **(ii) own copy** — C; D when two or more must share | once, online: open the address, "add to home screen"; then the icon | working alone: yes; sharing with others: only through a pocket hub | C1–C4; D1 for sharing |
| A headset in a hall | **(i) no install** — A (default); C if it must keep working when the host is off | scan the QR / type the place address in Quest Browser or Safari | everything, while the host runs | team-sync PR 3; WebXR check on Quest and Vision Pro |
| An artist's own phone at home | **(ii) own copy** — C, following dev.diiii.xyz | the home-screen icon | everything; syncs when online and the app is open | C1–C4 |
| A visitor from the internet | **(i) no install** — the public address | `https://diiii.xyz/<space>` | nothing (it is the web); later visits may open the cached app | none |

"Add to home screen" is **not** an install of di: it puts the website's icon on the device. With a service worker
(C1) it also keeps the app's files, so it opens with no signal. The data is only on the device after C2.

## 6. Recommendation

1. **No install stays the default** for guests, headsets in a hall and visitors (route A; the public address). It is
   built; what is owed is team-sync PR 3 and a check on a real phone and headset.
2. **Own copy = C, the local-first browser copy**, for anyone who must work without a host (crew on a phone, an
   artist at home). Reasons: one build reaches Android, iPhone, Quest and Vision Pro; it reuses `applyProjectOps`,
   the pending-ops store, the asset store and follow's pure planning code; it fits follow's shape (only the host
   must be reachable); it needs no store review. Limits stated: on iPhone the copy is safe only as a home-screen
   app that follows a host; sync runs while the app is open; a long offline means host-wins on same-field races.
3. **D, the pocket hub, for teams offline together.** Phones cannot reach each other without a host (browsers do not
   accept connections), so two or more phones with no internet share through a hub.
4. **B is not recommended** (Node 18 vs our Node ≥ 22.5 + `node:sqlite`; iOS 2.5.2 / 2.5.4). Re-open if a
   nodejs-mobile release on Node 22+ appears.

### Build plan (each PR visible alone)

| PR | What | Visible as | Reuses | Estimate |
| --- | --- | --- | --- | --- |
| C1 | Offline app shell for Studio and viewer: a versioned service worker that precaches the app, never serves a stale one silently ("a new version is ready — reload"). Measure size and first open on Android Chrome, iPhone Safari, Quest Browser. | airplane mode → the icon opens di | `chat-sw.js` rules, `manifest.webmanifest` | 2 days |
| C2 | Device store: spaces, projects, ops and files in IndexedDB/OPFS; the data layer answers from it when no install does; "on this device" list; `persist()` asked and its answer shown. | make a project offline, close, reopen: it is there | `applyProjectOps`, `pendingOpsStore.js`, `assetStore.js` | 3–4 days |
| C3 | Browser follower: `followPlan`/`followConverge` run in the browser and talk to the existing follow routes (CORS + the space's key); the sync light. | edit offline on the phone, reconnect, it appears on dev.diiii.xyz | follow routes, `followPlan.js`, `followConverge.js` | 3–4 days |
| C4 | Take mine / take host on the phone when copies differ; save the copy as a file. | the choice appears after a long offline edit | follow's `--take-mine` / `--take-host` | 1–2 days |
| C5 | Follow the place's host by its address from the phone (QR or remembered address; a browser cannot hear the UDP beacon). | phone follows the hall's host with the internet cut | team-sync PRs 3–4 | 1–2 days |
| D1 | Pocket hub recipe on r-di: install, own wifi, place address, one-command setup and undo; rehearsed. | phones join the hub's wifi and work with no internet | `di up --lan`, `di share` | 2 days + the box |

Each PR ends with a check on a real Android phone, an iPhone and a Quest (`AGENTS.md`, Validation), and a wiki
entry for what a person sees.

## 7. Questions only the owner decides

1. Which address holds the phone's own copy? The browser keeps data per address, so the copy's address is its home
   for good (`diiii.xyz` itself, or its own name).
2. May a space live only on a phone, never followed? (If the phone is lost, the space is lost.)
3. Buy a pocket hub box for the bag (r-di stays the rehearsal machine)? Money and hardware are yours.
4. Browser only, or also packages in Google Play / Horizon Store / App Store?
5. For crews offline for days: is "the host's order wins" acceptable, or do we fund keeping both edits (the CRDT
   work)?
