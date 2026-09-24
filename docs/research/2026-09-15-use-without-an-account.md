# Use it without an account — how close is di.iiii? (2026-09-15)

**The owner's idea.** A stranger who opens di.iiii in a browser, or installs it
(`curl https://diiii.xyz/get | sh`), can use all of it without registering. An
account adds one thing: your work online and on your other devices. When you
sign in, what you made on the device goes up to your account by itself.

**Questions asked.** How close is di.iiii to that today? Can the step from
signing in to being online happen by itself?

**How this was checked.**
- Headless Chromium, signed out, against **dev.diiii.xyz** (release `757bebc6`)
  on 2026-09-15/16. It ran with `--disable-gpu --use-angle=swiftshader`.
- Every journey below was driven by clicking and uploading, then reloading.
  Where it matters, the server was read back to confirm.
- Screenshots are in the session scratchpad (`noacct/01…34-*.png`).
- The installed copy was checked from code, docs and the `di` CLI only. The
  installer was not run, and no local data was touched.
- File and line references are to `origin/dev` at `757bebc6`.

---

## The short answer

**In the browser, about 80% is already true, and the last step is broken.**
- A stranger can open every public space, build in the shared Open Space, get a
  private sandbox, and use Studio, the node editor, uploads and chat. No
  registering, and nothing is lost on reload.
- The server already carries the sandbox onto the account when they sign in.
- **But a brand-new account cannot open that work in the editor.** The browser
  checks access with a rule that leaves out the account's own sandbox and the
  Open Space. So signing in locks you out of what you just brought, and out of
  the Open Space you were building in a minute earlier. This was seen on dev,
  not just read in the code.

**The installed copy already meets the idea, and goes further than it.** It has
no accounts at all: the one person on the machine is the owner and can do
everything. What it lacks is the second half, **a door from the install to an
account online**. The pieces exist (the `.diiii` file, per-space sync keys,
`di follow`), but nothing joins them to a sign-in.

**Can sign-in → online be automatic? Yes, mostly with machinery that exists.**
In the browser it is four small fixes to what is already built. For an install
it is a new step that joins three existing pieces. Neither needs a new sync
engine.

---

## A. The browser visitor, signed out, on dev.diiii.xyz

| Journey | State | Evidence |
|---|---|---|
| Open a public space (`/spaces`, any card) | **works** | `02-spaces.png`. 13 spaces are listed, with the note "Guest session — step into any space here". |
| Open Space / jam (`/open`, `/open_jam/scene`) | **works** | `03-open.png`, `23-open-jam-plus.png`. "+" offers photo, text and shapes, and the guest session holds `editor` on `open`. Nothing was added, to keep the communal room clean; guest writes to `open` are covered by `httpContracts.test.js:840`. |
| Create a new named space | **blocked by a login wall** | "Sign in to create" on `/spaces` (`05-sign-in-to-create.png`). `POST /api/spaces` as a guest returns **403** "Sign in with an account to create a space." (`spaceRoutes.js:240-249`). |
| Get a private space of your own | **works** (one sandbox) | "Your private sandbox" opens `/sandbox-guest…/studio` (`04-sandbox-click.png`). |
| Create a project | **works** | "Create your first project" → `audit-noacct-1` → Studio opens (`07-after-create.png`). |
| Edit in Studio (add a box) | **works, survives reload** | `08`/`09-studio-after-reload.png`: 2 objects before and after the reload. |
| Upload an image | **works, survives reload** | `POST …/assets` then `POST …/ops`. The file shows in the Files list after reload. |
| Upload a 3D model (.obj) | **works** | `10-studio-model.png`: 3 objects and 2 files. The server document holds 2 assets, and both answer 200. |
| Node editor on that project | **works, survives reload** | `17`/`18-raw-*.png`: a Cube node added and still there after reload. The server document shows `nodes: 1`. |
| Node editor with no project (`/raw`) | **works, but kept only in this browser** | It says so plainly: "A canvas in this browser — nothing here is saved to a space yet" (`14-raw-bare.png`). It survives reload (`localStorage dii.localNodeWorkspace.open`), is empty in any other browser, and **becomes unreachable after sign-in** (see C). |
| Chat (`/chat`) | **works** | "signed in as Guest". The Open Space room shows history and the text box is live ("Say something to the studio…", `21-chat-open-room.png`). No message was sent, to keep the persisted room clean. Two guests chatting was proven 2026-08-26. |
| Same work, other browser / cleared cookies | **lost to that person** | A second browser gets **403** on the sandbox and its project ("Access restricted", `22-other-browser-guest-url.png`). The guest cookie lives 7 days, and the sandbox is swept after about 7 idle days (`config.js:306`, `spaceStore.js:301-307`). |

**Nothing in this walk failed silently.** Every Studio upload first asks
`GET …/assets/<sha>/meta` and gets a 404 in the console. That is a "do I already
have this?" check, not a failure.

**What the site says vs what happens.** The landing page promises "you get a
space of your own, no account needed. Sign in to keep it and to make more", and
that is accurate. The account popover says "Temporary — sign in to save your
work", which undersells it: a guest's work *is* saved on the server, for a week,
in one browser.

---

## B. The installed copy (`di`, local tier)

These findings come from reading the code, not from running an install.

**A fresh install needs no account for anything it does on the machine.**
- The node runner forces `REQUIRE_AUTH=false`, `DI_LOCAL=1` and
  `NODE_ENV=production`, after reading the user's env, so `di.env` cannot turn
  auth on (`scripts/di/runner-node.mjs:83-109`).
- With auth off, every request is a built-in admin (`serverXR/src/index.js:690-697`),
  and every guard skips its check (`index.js:1250, 1289, 1307, 1320`).
- **Yes, without an account:** create a space, make it public, delete it, the
  admin page, AI chat (stored key, local `claude`, or the model on the box),
  `.diiii` save and open, `di invite` / `di follow`.
- The browser sees `local: true` and shows no sign-in, no quota counter and no
  "Access restricted" card (`src/hooks/useLocalInstall.js:35`,
  `AuthGate.jsx:394-412`).
- **So a local owner exists by default.** It is "whoever reaches the server", not
  a named person.

**Where an account still appears on an install:**
- **`di link SPACE --remote URL --key`** (`scripts/di/cli.mjs:830-854`) asks for a
  sync key "minted in the space settings online". That means you need an owner
  account on the hosted site, and must copy a key by hand.
- `di sync` only reports; it writes nothing (`cli.mjs:856-881`). The wiki says it
  "moves work in whichever direction is safe" (`wikiContent.js:1153`), which is
  wrong.
- Google Drive import needs a *Google* sign-in, not a di.iiii account.
- **Docker mode** turns auth off but does not set `DI_LOCAL`
  (`docker-compose.di.yml:16`). A docker install therefore shows hosted-site
  wording, including the `0/3` space counter.

**The branch in the main checkout, `feat/local-name-by-default`,** puts the
certificate a release carries into `~/.di/tls`. That way every install answers
on `https://local.thedi.studio`, which is pinned to 127.0.0.1. It does not touch
identity, but it matters here: an https name on the install is what a browser
sign-in handshake with diiii.xyz would need (secure cookies, a stable return
address).

---

## C. The sign-in moment — what carries, what is lost

### What exists

| Machinery | What it does | Who can use it |
|---|---|---|
| **Sandbox hand-off** `promoteGuestSandbox` (`index.js:854-889`) | At sign-in, moves the guest sandbox with its projects, ops and files onto the account's sandbox, marks it permanent, and fixes each project's space id. Runs for GitHub, Google, Telegram, password and magic link. | automatic, in the browser |
| `.diiii` file (export `GET /api/spaces/:id/bundle`, import `POST /api/spaces/bundle`) | The whole space: scene, op log, projects, files. | the person: export from Spaces or `di save`; import needs an account |
| Per-space sync key + `di follow` (`follow/follower.js`) | Copies a space between two servers, both ways, through the op log. | CLI, install to install. Proven on asuz↔aylmo; **carries no files yet**; untested over the internet |
| `di link` / `di sync` | Records a remote and a key; reports what differs. | CLI; writes nothing |
| `tier-sync`, `space-pull`, `local-mirror`, `space-sync` | Move spaces between local, staging and prod. | developers only, admin tokens |

### What was seen on dev when a guest signed in

1. **The first device, with a fresh account.** Guest `sandbox-guestb723…`
   registered as `audit-noacct-a` from the page it was working on.
   - The server answered `201 … "keptSandbox": true`.
   - The project moved to `sandbox-22b50e95382240d7`. Its document and both
     files answer **200** to the new account.
   - **The old address now says "Nothing lives at sandbox-guestb723…"**
     (`27-…png`). The page you were on disappears under you.
   - **The account's own sandbox shows "Access restricted — your session isn't
     scoped to sandbox-22b50e95…"** (`31-…png`), and the Open Space editor says
     "Sign in to open the editor for 'open'" to a signed-in person (`32`/`33-…png`).
   - The server allows both (the API answers 200). The browser refuses both. The
     cause:
     - `src/components/AuthGate.jsx:419` checks
       `inScope = … spaces.includes(requiredSpaceId)`.
     - A guest's `spaces` contains `open` and its sandbox.
     - A new account's `spaces` is `[]` (`userStore.js:54`, every provider).
     - The session reply carries `openSpaceId` and `sandboxSpaceId` separately
       (`index.js:1108-1109`), and the gate never reads them.
     - The line dates from 2026-06-18, so prod very likely behaves the same. Prod
       was not tested.
   - The `/spaces` page then describes the moved sandbox as "nothing in it yet"
     (`29-…png`).

2. **A second device, with an account that already has work.** Guest
   `sandbox-guest029b…` built `audit-noacct-2`, then signed in to the same
   account.
   - `"keptSandbox": false`. **Nothing was said to the person.**
   - The account gets **403** on that sandbox. The work is orphaned: it sits on
     the server until the sweep deletes it after about a week idle. The wiki's
     "existing account work is never overwritten" is true, but the new work is
     silently dropped instead.

3. **Browser-only work.**
   - The canvas at `/raw` (`dii.localNodeWorkspace.*`) is never carried. The keys
     stay in `localStorage` after sign-in.
   - `/raw` then shows the same false "Sign in to open the editor for 'open'"
     wall, so the canvas can't be reached.
   - Nothing in the sign-in path reads or clears those keys (`RawEditor.jsx:515-549`).

**Also not carried** (from code, not walked):
- **Invite grants a guest redeemed.** The new session uses only `user.spaces`
  (`authRoutes.js:131`, `index.js:985`), although a comment at
  `index.js:1971-1972` says sign-in keeps them.
- **The "your sandbox came with you" notice after a password or magic-link
  sign-in.** Only OAuth redirects add `&kept=1`. `keptSandbox` is returned but no
  client code reads it.
- **A sandbox with only files or ops in it, and no project.** It is not promoted
  (`index.js:861`).
- **A Telegram or magic link opened in a different browser** (Telegram's in-app
  browser, a mail app). That browser has no guest cookie, so there is nothing to
  carry. This is inferred, not walked.

**Where you can sign in from.** The sign-in popover in Studio offers only
GitHub and Google (`25-sign-in-card.png`). Creating a password account, which
the camp needed, is only offered on the "Access restricted" card.

**A bug in `.diiii` import:** `spaceRoutes.js:581` calls
`grantSpaceToSessionUser(req, opened)`, but the function takes
`(req, res, userId, spaceId)` (`index.js:730`). `userId` is undefined, so it
returns straight away. **An account that imports a file gets no access to the
space it just created.** That is the only way today to take an install's work
online.

---

## D. Gaps, ordered by how much they block the idea

1. **A new account can't open its own sandbox or the Open Space in the
   editor.** `AuthGate.jsx:419` ignores `openSpaceId` and `sandboxSpaceId`.
   Signing in makes you weaker than a guest.
   *Fix: count both as in scope, in the gate and in anything else that checks
   `spaces.includes`. About a line, plus a test with `spaces: []`.*
2. **The second device's work is silently orphaned.** When the account sandbox
   already holds work, the hand-off refuses and says nothing.
   *Fix: move the guest's projects into the account sandbox instead of refusing.
   Project ids are global, so they don't collide. If an id ever clashes, keep the
   guest sandbox as its own space granted to the user. Then say what came along.*
3. **No door from an install to an account.**
   - The file import doesn't grant the importer access (the bug above).
   - `di link` needs a key copied by hand from a settings page.
   - `di follow` carries no files.
   - So "sign in and my install's work goes online" has no path a non-developer
     could walk.
4. **Browser-only work is not carried.** The `/raw` canvas and invite grants are
   lost, and the canvas becomes unreachable behind the false wall.
5. **The sign-in step itself leaks.**
   - The page you signed in from 404s, because the sandbox id changed.
   - A password sign-in gives no "your work came with you" notice.
   - The Studio popover offers no password or "create account".
   - A link opened in another browser carries nothing.
6. **Wording that contradicts the idea.**
   - "Temporary — sign in to save your work" (it *is* saved, for a week).
   - `README.md:5` opens with "You sign in".
   - The wiki on `di sync`.
   - A docker install shows the hosted quota.

## The smallest design: "sign in = your work goes online"

**In the browser**, where one server holds both the guest and the account, it is
four changes to what exists:
- **(a)** The gate fix (gap 1).
- **(b)** `promoteGuestSandbox` merges instead of refusing (gap 2), and also moves
  the guest's invite grants into `user.spaces`.
- **(c)** At sign-in the client saves the browser-only canvas into the sandbox,
  using the existing "save to space" path (`RawEditor.jsx:822-854`).
- **(d)** The client sends the person to the moved project's new address, and
  reads `keptSandbox` on every door, not only the OAuth redirect.

After that, signing in *is* the upload. Nothing is manual.

**On an install**, where the work lives on the machine and the account lives on
diiii.xyz, it is one new command that joins three existing pieces. `di link`
without `--key` (or a "Put this online" button on the install's Spaces page)
would:
1. Open diiii.xyz in the browser and have the person sign in there. It should be
   a one-time code shown on both screens, like a TV sign-in. A code avoids
   copying any key or password into the terminal.
2. Send the space as a `.diiii` file to the existing import route. The grant bug
   must be fixed first. The space arrives **private** and permanent, owned by
   that account.
3. Have the hosted side mint an existing per-space **sync key** for it and hand
   it back.
4. Have the install store it through the existing `di link`, and start the
   existing **follower** against that address.

From then on edits travel both ways, as asuz↔aylmo already proved.

**What this is NOT:**
- Not a new sync engine. The follower and op log are the engine.
- Not `space-sync.mjs` or `tier-sync`, which move repo-built pages between tiers
  with admin tokens.
- Not an account system on the install. It stays account-free.
- Not "upload everything on the machine". It is one space at a time, chosen by
  the person.

**What it still needs that doesn't exist:**
- The follower must carry files. CURRENT.md already lists this: a followed scene
  shows grey walls.
- The one-time-code sign-in handshake is new, but small. Telegram sign-in already
  mints single-use, 10-minute, hashed tokens (`authRoutes.js:207-319`), and the
  same pattern fits.

## Security questions

- **A public install lets strangers write, and more.** `di up --lan` without
  `--guests` makes everyone on the wifi the built-in **admin**: delete any space,
  the users and config APIs, minting sync keys. The start-up warning says only
  "anyone … can edit" (`scripts/di/ui.mjs:96`). `--guests` is the safe mode, and
  the owner should decide whether it becomes the default under `--lan`. With
  auth off, a sync key also protects nothing, because the guards are skipped.
- **Shared computers.** Automatic carrying means whatever a guest built in *this
  browser* goes to *whoever signs in next in this browser*. At the camp (one
  login, six laptops), a kid's sandbox would land in the next person's account.
  Carrying should follow the signed guest cookie, which it already does. The
  person should be told what came along, and be able to undo it.
- **Hosted abuse.** Every cookie-less visitor gets an editor session and a
  sandbox that accepts 100 MB uploads. New guest sessions are limited to 60 per
  address per 10 minutes, and there is **no per-space byte quota** (CURRENT.md).
  "Use everything without registering" costs disk that nobody is accountable for.
- **An install linking to an account** would hold a live editor key for an online
  space in `~/.di`. That is fine on a laptop. On a `--lan` install with auth off,
  confirm nothing a LAN visitor can reach reads that key back.
  `/api/follows` is already loopback-only (`statusRoutes.js:13-18`).
- **Privacy by default.** A space taken online from an install must arrive
  private. Installs hold library and funding material.

## Questions only the owner can answer

1. Should a guest be able to create **named spaces** (today only one sandbox), or
   is "one sandbox, plus the Open Space" the right line for "all of it"?
2. When two devices each carry work into one account, should it be **merged into
   one sandbox** or kept as **separate spaces**, one per device?
3. On a shared computer, **carry by itself, or ask** ("Bring the 3 projects from
   this browser?")?
4. For an install: **every space goes online at sign-in, or one space at a time**
   by choice? And public or private on arrival?
5. `di up --lan`: should **`--guests` be the default**, so a stranger in the room
   can never delete?
6. How long should a signed-out guest's work live: 7 days in one browser as now,
   or longer?

---

## Left on dev by this audit (for cleanup)

| What | Id | Why |
|---|---|---|
| Account `audit-noacct-a` (password, no email) | `22b50e95-3822-40d7-99c2-3535f92123be` | the sign-in hand-off test |
| Its sandbox, holding project `audit-noacct-1` (1 box, 1 image, 1 .obj, 1 Cube node) | `sandbox-22b50e95382240d7` (permanent) | moved there by the hand-off |
| Orphaned guest sandbox with project `audit-noacct-2` (1 sphere) | `sandbox-guest029b23af273` | the second-device test; the sweep removes it after about 7 idle days |
| Empty guest sessions and sandboxes from fresh test browsers | `sandbox-guest*` | swept automatically after about 7 days |

Nothing was written to the Open Space, the Open Jam or the Open Space chat.
