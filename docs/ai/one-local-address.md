# One local address — `http://diiii.localhost/`

Status: **approved by the owner 2026-10-07, being built.** Draft PRs: di-atlas #57 (the dev-router
part), di.iiii `feat/one-local-address-2026-10-07` (this file, the server and the CLI).
Written 2026-10-07. Every claim below carries its source or its measurement, or is marked
**unverified**.

## 1. The decision

The owner asked: *"everyone runs di.iiii on their own machine; others can join and work; everyone
remembers only one link."* He said yes to this design:

1. On **every machine with di installed**, `http://diiii.localhost/` opens **that machine's own
   installed di**. It is the same link everywhere. A `.localhost` name is a secure context, so
   WebXR, the camera and the microphone work with no certificate.
2. **Joining someone** means your own di follows the same space (`di follow` from dev, or a machine
   in the same place when offline). You never open another person's machine.
3. **Devices without di** (a phone, a headset, a guest's laptop) get **one HTTPS address for the
   place**. It has a real certificate, and the host machine shows it as a QR code. Never mDNS
   `.local`: plain http there is not a secure context, and two hosts claiming one name collide.
4. Dev trees stay at `http://<tree>.diiii.localhost/`. The index of dev stacks is
   `http://stacks.diiii.localhost/`.

Words follow `docs/ai/vocabulary.md`:
- a **space** is yours inside di.iiii;
- a **project** is one thing made in a space;
- a **place** is a real room in the world (a hall, a festival site).

The brief said "venue name". In this file that is **the place address**.

## 2. Why `.localhost` works, with sources

| Claim | Source |
| --- | --- |
| Resolvers and libraries SHOULD answer every `localhost` name with loopback and SHOULD NOT ask DNS. Applications MAY treat the names as special themselves. | [RFC 6761 §6.3](https://www.rfc-editor.org/rfc/rfc6761.html#section-6.3) |
| A host that is `localhost`, or ends with `.localhost`, is a **potentially trustworthy origin**, provided the browser follows let-localhost-be-localhost (it resolves those names to loopback itself). | [W3C Secure Contexts §3.1, "Is origin potentially trustworthy?"](https://www.w3.org/TR/secure-contexts/#is-origin-trustworthy), step on `.localhost`. The draft it cites, [draft-ietf-dnsop-let-localhost-be-localhost](https://datatracker.ietf.org/doc/draft-ietf-dnsop-let-localhost-be-localhost/), expired and never became an RFC. |
| WebXR (`navigator.xr`) and `navigator.mediaDevices` are `[SecureContext]`. | [WebXR Device API](https://immersive-web.github.io/webxr/), [Media Capture and Streams](https://w3c.github.io/mediacapture-main/) |
| Firefox hard-wires `localhost` and `*.localhost` to loopback and treats them as potentially trustworthy, since Firefox 84. | [Mozilla bug 1220810](https://bugzilla.mozilla.org/show_bug.cgi?id=1220810), [bug 1488740](https://bugzilla.mozilla.org/show_bug.cgi?id=1488740) |
| Safari does not resolve `*.localhost` subdomains the way Chrome and Firefox do. | [WebKit bug 160504](https://bugs.webkit.org/show_bug.cgi?id=160504). **Unverified** on the current Safari; measure on the Mac. |
| mDNS `.local` is not in the secure-context list, so `http://x.local` is not a secure context. Two hosts that claim one `.local` name are renamed by conflict resolution. | Secure Contexts §3.1 (no `.local` step); [RFC 6762 §9](https://www.rfc-editor.org/rfc/rfc6762.html#section-9) |
| `421 Misdirected Request` is the answer for a request to a name this server does not serve. | [RFC 9110 §15.5.20](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.5.20) |

### Measured on aylmo, 2026-10-07

**Setup.** Headless Playwright browsers, no WebGL. A test server bound to **127.0.0.1 only**. It
set a `Secure` cookie on its first response. Script:
`/tmp/claude-1000/…/scratchpad/probe/localhost-probe.mjs`. The method is in the commit message.

The OS resolver on aylmo answers **`::1` only** for `*.localhost`. Evidence: `getent ahosts
diiii.localhost` printed `::1`, and the nsswitch line is `hosts: … resolve … myhostname`. So a page
that loaded from the 127.0.0.1-only server proves the browser mapped the name itself.

The same results held for all four names in both browsers: `localhost`, `diiii.localhost`,
`stacks.diiii.localhost` and `moxir-flip.diiii.localhost`.

| Browser | Page loaded | `isSecureContext` | `Secure` cookie kept over http | `navigator.mediaDevices` | `navigator.xr` |
| --- | --- | --- | --- | --- | --- |
| Chromium 151 | yes | true | yes | yes | yes |
| Firefox 153 | yes | true | yes | yes | **no** (Firefox desktop ships no WebXR; not a localhost effect) |

So on aylmo:
- Chrome and Firefox reach `*.diiii.localhost` without DNS.
- The page is a secure context.
- The session cookie, which the installed di marks `Secure`, survives plain http on that name.

## 3. Who opens what

| Who | Types | What answers |
| --- | --- | --- |
| Anyone at a machine with di | `http://diiii.localhost/` | That machine's installed di. |
| — on aylmo (the dev-router holds :80) | same | `dev-router.service` forwards it to the installed di. It reads where the di listens from di's own files (https 127.0.0.1:443, verified as `local.thedi.studio`). It forwards **loopback clients only**. |
| — on a machine without the dev-router | same | The installed di's own **door**: a second listener on 127.0.0.1:80 and [::1]:80 that hands requests to the same server. It needs port 80 to be allowed (§6). |
| A developer on aylmo | `http://<tree>.diiii.localhost/` | dev-router → that tree's vite (`di-dev up <tree>`). |
| A developer on aylmo | `http://stacks.diiii.localhost/` | dev-router's index: every stack, its owner and its database. |
| A phone, headset or guest laptop in a place | the QR code → `https://<place address>/` | The host machine's di, on its certificate's name, under `di up --lan`. |
| Anyone, anywhere | `https://dev.diiii.xyz/<space>` | The dev tier, which every install follows. |

`*.localhost` always means **this device** (RFC 6761). On a phone, `http://diiii.localhost/` is the
phone itself. That is why devices without di need the place address.

## 4. How joining works

- **Online:** `di follow <space> --from https://dev.diiii.xyz --into <space>`. dev is the hub, and
  every install follows it (the owner's rule "Dev and local stay one", 2026-10-04). `di follows`
  shows each follow. Open your own `http://diiii.localhost/<space>`: it is your copy, kept in step.
- **Offline, in a place:** the host machine runs `di up --lan`. The rig discovery beacon
  (`serverXR/src/rig/discovery.js`, UDP) lets the other installs see it (`di status` → "rig:").
  Following the host over the place address is the design. **Unverified offline:** it has not been
  measured with the internet cut.
- Nobody types another person's address. The only cross-machine address a person ever types or
  scans is the place address, and only on a device without di.

## 5. The guest path (devices without di)

**Today.** The installed di serves https on its certificate's name: `local.thedi.studio` on aylmo,
Let's Encrypt, valid until 2026-12-07. `di up --lan` points that name at the address of the day
through the owner's `~/.di/dns-update` hook (`scripts/di/name.mjs` `updateRoomName`). A phone that
opens that name gets a padlock, a secure context, the camera and WebXR.

**Owed:**

1. **One name per place, or per host machine.** A certificate for a name we control, issued by
   DNS-01 so the machine needs no open port ([Let's Encrypt challenge types](https://letsencrypt.org/docs/challenge-types/)).
   aylmo already does this for `*.thedi.studio` (`di-gateway-cert`).
2. **Name resolution in the place.**
   - (a) Public DNS points the name at the host machine's private address. That is today's hook.
     **Limit:** routers with DNS-rebind protection drop public answers that point at private
     addresses. OpenWrt's dnsmasq has `rebind_protection` on by default
     ([OpenWrt DHCP/DNS docs](https://openwrt.org/docs/guide-user/base-system/dhcp)), so the
     owner's own `dob-0` router would need `rebind_domain` for that name. **Unverified on dob-0.**
   - (b) Offline, with no public DNS at all: the place's router answers the name itself (dnsmasq
     `address=/<name>/<ip>`). The certificate is still valid because it was issued beforehand.
     This is the professional path for a place with no internet.
3. **The QR code** (§8, D).

## 6. Limits — stated plainly

- **Port 80 on Linux.** An unprivileged process cannot bind it unless its binary carries
  `cap_net_bind_service` ([capabilities(7)](https://man7.org/linux/man-pages/man7/capabilities.7.html))
  or `net.ipv4.ip_unprivileged_port_start` ≤ 80
  ([kernel ip-sysctl](https://docs.kernel.org/networking/ip-sysctl.html)).
  - On aylmo the installed di's pinned node already has the capability (`getcap`:
    `cap_net_bind_service=ep`, and it binds :443), and the sysctl is 1024.
  - On any other Linux machine the door stands aside with `EACCES` until the owner grants one of
    the two. The capability is lost when that node binary is replaced, for example by a node
    update. The sysctl is machine-wide.
  - Both are privileged and are the owner's step.
- **macOS and Windows: unmeasured.** macOS 10.14 and later is reported to let unprivileged
  processes bind low ports. Windows has no privileged ports, but :80 is often held by `http.sys`
  or IIS, and then the door stands aside. Measure both before saying "works" there.
- **Safari:** see §2. Unmeasured.
- **Browser-held state is per origin.** Things the browser keeps for `https://local.thedi.studio`
  start empty at `http://diiii.localhost/`:
  - the asset cache in IndexedDB (`src/storage/assetStore.js`);
  - about 40 `localStorage` settings;
  - a sign-in cookie.

  The work itself lives in the installed di, so every space and project is the same.
- **The door is not retried.** If :80 frees up after the server started, the next start takes it.
  Retrying would race a dev-router that is restarting.
- **One door per machine.** If two installed di run on one machine, only one holds :80. `di status`
  then says `diiii.localhost opens another di.iiii on this machine`.
- **Command-line tools.**
  - macOS and Windows do not resolve `*.localhost` for programs.
  - systemd's `nss-myhostname` answers `::1` only (measured).
  - `di status` and `di open` therefore connect to 127.0.0.1:80 with `Host: diiii.localhost`, and
    never by name. For curl: `curl -H 'Host: diiii.localhost' http://127.0.0.1/`.
- **The dev-router listens on every interface (`*:80`).**
  - The installed route is refused to anything but loopback. This is enforced and tested: a
    request from the wifi address gets 403 and never reaches the di.
  - Dev trees are still forwarded to the wifi. That was already so before this change. **Owed:**
    bind the router to loopback, or firewall :80 (check `tools/aylmo-firewall.sh`).
- **Firefox desktop has no WebXR at all.** Headset work uses Chromium-based browsers
  (Quest Browser).

## 7. What was built (2026-10-07)

**B. di-atlas PR #57: the dev-router opens the installed di.**
- `tools/di-dev/installed.mjs` finds the installed di's address from di's own files. It reads
  `~/.di/state.json` → `service.unitFile` → that unit's `EnvironmentFile=` and `Environment=`
  lines in systemd order (`PORT`, `HOST`, `TLS_CERT`). With no unit it falls back to
  `di.env PORT`, and then to di's default 4000. With a certificate it connects over https and
  verifies the certificate's name. No number is typed in anywhere.
- Front values:
  - `installed` is the default when an installed di is found, else `index`;
  - `index`;
  - a tree name.
  - `stacks`, `installed` and `index` are reserved tree names.
- The Host header is kept, so the app sees its own origin. `X-Forwarded-*` headers are added.
  Websocket upgrades go over TLS when the upstream is https.
- **Tests: 56 passed**: 41 before, plus 15 new.
  - The file readers, on fixtures.
  - The real router on a spare port against fake http and https upstreams, with name
    verification on and off.
  - A request from off the machine is refused.
- **Checked against the real installed di.** A router on :8099 with a temporary `DI_DEV_CONFIG`,
  read-only GETs: `/`, `/serverXR/api/health` and `/serverXR/api/config` all returned 200.
- **Checked in a browser.** Headless Chromium with 3D off loaded `http://diiii.localhost:8099/`:
  - the "Spaces — di.iiii" page;
  - `isSecureContext` true;
  - every request same-origin.

**C. di.iiii: the installed di answers the name itself.**
- `serverXR/src/localName.js` is the door.
  - It is on only when `DI_LOCAL=1` **and** `DI_LOCAL_NAME` is set. `di up` sets
    `DI_LOCAL_NAME=diiii.localhost` (`scripts/di/runner-node.mjs`). Test servers, rig members and
    scratch copies set only `DI_LOCAL=1`, so they never take :80.
  - It binds 127.0.0.1:80 and [::1]:80 and hands requests and upgrades to the main server's own
    handlers: one app, one Socket.IO.
  - It serves the exact name only. Any other Host gets 421, which guards against DNS rebinding.
  - It stands aside by name on `EADDRINUSE` or `EACCES`, and the start never fails over it.
  - `DI_LOCAL_NAME=off` in `~/.di/di.env` turns it off.
- `di status` prints `open it: http://diiii.localhost/` only when the name was asked and answered
  as **this** install: the same `machine.id` directly and through :80. Otherwise it prints one dim
  line saying why not. `di open` opens the address under the same rule, and otherwise opens the
  old address.
- **Tests: 27 passed** (`serverXR/src/localName.test.js`, `scripts/di/oneAddress.test.js`).

## 8. Rollout order, and what the owner runs

Privileged or tier-writing steps are the owner's. Agents never run them.

1. **Land di-atlas #57.** Review, merge, then on aylmo:
   ```
   git -C ~/work/di-atlas pull                       # the router's new code
   sudo systemctl restart dev-router                 # load it (system unit)
   journalctl -u dev-router -n 3                     # expect: bare address → installed
   di-show http://diiii.localhost/                   # look at it on your screen
   ```
2. **On aylmo, before the di.iiii change arrives:** keep :80 for the router, with no race at boot.
   ```
   printf 'DI_LOCAL_NAME=off\n' >> ~/.di/di.env      # the router forwards the name; di's own door stays shut
   ```
3. **Land the di.iiii PR** to `dev`. aylmo's install follows the dev channel and updates itself.
   Then:
   ```
   di status                                         # expect: open it: http://diiii.localhost/
   ```
4. **Every other Linux install** (Emilya, Kiara, asuz). This is privileged, once per machine,
   and must be redone after the pinned node is replaced:
   ```
   getcap "$(jq -r .service.node ~/.di/state.json)"                                  # already granted?
   pkexec setcap cap_net_bind_service=+ep "$(jq -r .service.node ~/.di/state.json)"  # allow :80 for di's node only
   di down && di up                                                                  # the door opens
   ```
   **Owed product decision:** should `di up` offer that line itself (pkexec asks for the
   password), instead of only printing it?
5. **macOS (the Mac) and Windows (`win`):** measure §6 before any claim. The Mac goes through
   `mac-safe-change`.
6. **The guest path** (D below).
7. **MOXIR on every install** (E below).

### D. The guest QR code — plan only

What exists:
- `serverXR/src/lighting/ui/qr.js` is a hand-written QR encoder. It is fixed at version 3 (42
  bytes), checks its own geometry, and refuses rather than draw a bad code.
- Its only use is the Light page's phone panel, which shows **`http://<raw IP>`**: not a secure
  context, no camera, no XR.
- There is no QR library in any `package.json`.

Design:
1. Move the encoder to `src/shared/qr/` with its tests, so the app and Light share one copy. Widen
   it to versions 1–6, or adopt a library through `docs/ai/dependency-decisions.md`. 42 bytes fits
   `https://local.thedi.studio/` (27 bytes) but not a long space path.
2. The server adds the place address to `/api/config`: the certificate's names, and whether
   `listen.lan` is on.
3. A panel on the local home: **"Phones and headsets in this place"**.
   - It shows the QR code of `https://<place address>/<space>` only when the install has a
     certificate and `--lan` is on.
   - Otherwise it says the one command: `di up --lan`.
   - Light's phone panel then uses the same address instead of the raw IP.
4. Verify on a real phone: scan, padlock, camera permission, WebXR on the Quest. Screenshots must
   be opened (verification charter).

It is plan-only because it is a UI change on the local home, a wiki entry and real-phone
verification, plus the per-place name decision in §5. That is more than one evening, and the
owner should see the panel first.

### E. MOXIR beta v0.9 on every install — plan only, nothing executed

**What it is.**
- MOXIR beta v0.9 is the project `moxir-known-full-stage-back`: slug `beta-v0-9`, title
  "MOXIR beta v0.9", in the aylmo **scratch** tree `moxir-flip`, api `127.0.0.1:4323`.
- Read 2026-10-07 21:2x: `documentVersion` 61, last touched 21:08 today. It is still moving.
- Counts: 125 objects, 74 lamps, 10 cues.

**The goal.** It goes into dev's `moxir` space, which every install follows. Then
`http://diiii.localhost/moxir/beta-v0-9` opens it on every machine.

**The proven route** is `scripts/rigbuild/copy-version.mjs --from-api`. It was used 2026-10-04 to
bring PONYO's Known · full to dev.
- It reads the source on another install, and **creates a new project** on dev under the same id.
  It replaces nothing, so it is not a whole-document write over existing work.
- It uploads every asset again and remaps changed ids.
- It refuses a taken id (409).
- It lists the copy as a `candidate` in the version list.
- One command undoes it.

The owner runs these (auto mode denies agents dev writes):
```
# 0. freeze: ask the session working in moxir-flip to stop editing beta v0.9; note its documentVersion
curl -s http://127.0.0.1:4323/serverXR/api/spaces/moxir/projects | jq '.projects[]? // .[] | select(.id=="moxir-known-full-stage-back") | .documentVersion'
# 1. back up dev's moxir space first (your usual dev backup; at minimum the project list, private ones included)
mkdir -p ~/di-backups/moxir-beta-v0.9-2026-10-07
# 2. dry run: reads both sides, writes nothing
node scripts/rigbuild/copy-version.mjs --api https://dev.diiii.xyz/serverXR --token-file <dev token file> \
  --from-api http://127.0.0.1:4323/serverXR --from-token-file <a dummy token file> \
  --space moxir --from moxir-known-full-stage-back --to moxir-known-full-stage-back --label "beta v0.9" --dry-run
# 3. the copy (same line without --dry-run)
# 4. undo, if needed: deletes only the copy
node scripts/rigbuild/copy-version.mjs --api https://dev.diiii.xyz/serverXR --token-file <dev token file> --undo --to moxir-known-full-stage-back
# 5. every install: it arrives through the follow
di follows                                        # moxir followed from dev?
```

**Open calls for the owner:**
- (a) Keep v0.9 **beside** Known · full as a candidate (the route above), or make it **the** show
  version. The latter changes Known · full **in place, by ops** at its current `documentVersion`,
  and needs a document-diff-to-ops tool that does not exist yet; it is owed.
- (b) The slug is `beta-v0-9`, while he typed `beta_v0.9`. Confirm which link he wants printed.
- (c) Emilya's and Kiara's installs must follow `moxir` from dev. Check with `di follows` on each.

## 9. Owed — the list

1. **Owner:** merge #57, restart `dev-router`, look at `http://diiii.localhost/` on his screen.
2. **Owner:** `DI_LOCAL_NAME=off` on aylmo, then land the di.iiii PR.
3. **Owner, per Linux machine:** grant :80 (`setcap`). **Product call:** should `di up` offer it?
4. Measure macOS, Windows and Safari (§6).
5. The guest path:
   - the per-place name and certificate;
   - the place router's DNS (rebind protection);
   - the QR panel (D).
6. Offline follow between two machines in one place: measure with the internet cut.
7. The dev-router forwards dev trees to the wifi: bind it to loopback or firewall it.
8. ~~`di-dev doctor` called the installed di UNMANAGED.~~ Fixed in di-atlas #57: it looked only in
   `di-up.service`, and the server runs under `di-server.service`. Live `doctor` now prints `ok`.
9. MOXIR beta v0.9 to dev (E), with the owner's calls (a)–(c).
10. `docs/ai/vocabulary.md`: the local tier's address is now `http://diiii.localhost/` (amended in
    this change).
