## 2026-09-09 — every tool got a door, the install got a padlocked name, and a space can now live on two machines at once

- **`/tools`** — one screen every tool opens from (Studio, Raw, Light, Projection, and the
  sessions desk on a local install). Before it, the lighting desk answered at `/light` with
  nothing linking to it and the projection mapper lived at `/<space>/map/<project>`, an address
  that needs a project id nothing in the interface would tell you. Projection and Raw now ask
  which project through a dialog that walks spaces then projects. Built to the house tokens
  after reading how Blender, Unreal, Resolve, Notch and QLab build a launcher: a bounded set of
  destinations grouped by what they are for, one tile each, one drawn mark, one line of state,
  no scrolling. The first attempt — plates floating on a perspective floor — was rejected as
  "messy and ugly" and is not what shipped.
- **`di up` prints the doors** — tools, spaces (with the count), light, wiki — and says plainly
  when phones cannot reach a loopback start.
- **One padlocked name.** serverXR speaks https when `TLS_CERT`/`TLS_KEY` are readable and falls
  back to http saying so once. `di` takes the address from the certificate's own subject, and
  under `--lan` points that name at the machine's address on tonight's wifi through an optional
  `~/.di/dns-update` hook (no DNS credentials ever live inside di). On aylmo that is
  `https://local.thedi.studio`, port 443, a real Let's Encrypt certificate — and with it a phone
  gets the camera, the microphone, Web MIDI and XR, none of which a browser grants a LAN address
  over plain http. `deployMode` reads `local.<domain>` as this machine, or the first paint says
  "hosted" and the local-only tools vanish from the tools room until a request resolves.
- **`di up --lan --guests`** — a room can work without being handed the estate. Auth on for
  everyone except the person at the machine: a visitor gets a guest session, their own sandbox
  and the open space, 403 on a private space, on deleting anything and on the user list. The
  owner is decided by the address the request came from (every address this machine holds, not
  loopback alone — one name now points at the wifi address), refused outright to anything
  carrying a proxy header, and container bridges do not count.
- **`di invite` / `di follow` / `di follows` / `di unfollow`** — a space living on two di.iiii at
  once, the room and every project in it, edits both ways: **25ms host→follower, 97ms
  follower→host, 2 reads/minute idle**. The op log is the transport, over plain HTTP, resting on
  three things the log already guaranteed: opId dedupe on write (an op returning home is a
  no-op), per-install version counters that are never compared, and a 409 that hands back
  exactly the ops we were missing. `GET /ops?wait=` holds a read open until a space changes.
  Whole-scene replacements are deliberately NOT carried — a snapshot restore on one machine must
  not silently become the other's room.
- **Verified between two real installs** (`~/.di` on 443 and `~/.di-b` on 4200, separate
  databases) and in `serverXR/src/follow/followIntegration.test.js`, which spawns two servers and
  asserts the edit lands in the SCENE, that simultaneous writes converge, that no opId is ever
  duplicated, and that a follow survives the other machine being killed and restarted. Proved
  non-vacuous by stubbing the follower out and watching five of them fail.
- **An adversarial review of my own code found six things worth fixing**, all in `known-fixes.md`:
  the cursor advance that silently dropped everything past one batch; the 20-second wait on the
  follower's own edits; `POST /ops` answering 500 for an unknown space (which a follower reads as
  "keep trying, forever"); `di.env` world-readable while holding the session secret and an admin
  token; rate limiters disabled in the one mode built for strangers; and `di status` reporting
  "not running" about a server that was serving the room.
- **Owed:** a follow does not carry images or models yet (`di follow` says so out loud); no
  warning yet when op-history retention drops something a follower had not carried; the internet
  case (two installs meeting on di-studio.xyz) is architecturally the same URL but untested.
