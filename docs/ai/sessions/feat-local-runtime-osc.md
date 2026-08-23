## 2026-08-23 — `runtime: 'local'` stops being decorative

Owner: *"full freedom and flexibility to work and live perform, in local space
with the local copy, projection lasers, light, robotics."* The vocabulary for
that already existed and none of it was connected.

`device.*` was already the node family. `runtime: 'any' | 'web' | 'local'` was
already a field on every node type, with a test enforcing the three values. But
**nothing read `runtime` at run time** — its only consumer was `listNodeTypes`,
and the palette never passed the argument, so the filter never fired. Seven node
types were marked `runtime: 'local'` and **all seven were on the unimplemented
list**. The one device family that worked, MIDI, is `runtime: 'web'` — it works
in a hosted tab too. So di.iiii had zero working local-only nodes: nothing that
a local install could do and a browser could not.

`device.osc.out` is the first, and it is the right first one — `RAW_WORKSPACE.md`
§5.4 puts `device.osc.*` immediately after `device.midi.*`, and OSC is what
lighting desks, media servers, lasers, Resolume, TouchDesigner, QLab and robots
all already speak. One node turns every one of them into something a graph can
address.

**The page composes the message; a di.iiii on the same machine sends it.** OSC is
UDP and a page cannot open a UDP socket — not with a flag, not ever (§3 of the
same document says so in those words).

- `serverXR/src/osc.js` — OSC 1.0 encoder, hand-rolled. `di up` ships a prebuilt
  `serverXR` version directory, so a dependency here is a bigger commitment than
  the 60 lines of spec it would implement.
- **Numbers go out as floats.** JavaScript cannot tell `440.0` from `440`, so an
  encoder that infers "whole number → int" sends `i` for every fader resting at
  1.0, and a desk expecting a float fader ignores it — which on stage is
  indistinguishable from a light that will not come on. `numberAs: 'int'` is how
  an author asks for a channel or an index, and a fractional value stays a float
  even then rather than being silently rounded. This was found by the spec's own
  worked example (`/oscillator/4/frequency 440.0`) failing.
- `localRuntimeGuard.js`, deliberately NOT `requireDevLocal`. That guard is
  `NODE_ENV !== production AND loopback`, and `di up` runs a real install with
  **NODE_ENV=production AND DI_LOCAL=1** — so reusing it would have refused the
  exact case this exists to serve. Hosted gets 404 rather than 403: a deployed
  server should not admit the route is a thing.
- **LAN is refused by default.** Reachable off-machine, this is a UDP relay any
  device on the network can aim at any host. `DI_ALLOW_LAN_DEVICES=1` opens it by
  hand, the same shape as the SDK's public-move gate, and the 403 names the flag
  rather than failing blankly. `di venue` will need a real auth story; an env
  flag is the honest placeholder, not the destination.
- One socket per target, refcounted and idle-swept — a fader at 60fps otherwise
  opens 60 sockets a second, each holding an ephemeral port.
- `GET /api/local/capabilities` answers **even where it must say no**, so a node
  can show "Needs a di.iiii running on this machine" instead of accepting values
  and dropping them. `src/project/graph/portStatus.js` names the six states
  RAW_WORKSPACE.md §5.1 asked for (idle/starting/live/denied/unavailable/error) —
  the keystone that document warned to build first or every later device node
  invents its own convention.

**Two tests that were decoration until they were watched failing.** The flood
guard's first test passed with the guard deleted, because React's dependency
array was doing the work — the real hole is the effect re-running when the
TARGET changes, so retyping a port re-sent a value nobody touched. Rewritten to
edit the port and the address with the value held still, it fails without the
guard. The encoder test was proven by flipping it to little-endian and watching
the byte assertion go red.

Also caught by eslint and worth keeping: the status detail was a ref read during
render, so a target moving from one desk to another would have kept showing the
old one. It is state now.

**Seen, end to end, not asserted:** a real `serverXR` on :4310 (a scratch
DI_HOME, so the real install on :4000 was never touched), a real vite on :5310
proxying to it, a real Chromium at `/raw`. Placed an Oscillator and an OSC Out
from the palette — it is offered now, where before it was filtered out entirely —
dragged Sine into Value, and **247 real UDP packets arrived at a real listening
socket on port 9000**, `/control` as big-endian float, decoded by hand from the
hex. Zero console errors. The card, the wire and the inspector were looked at in
a screenshot, not inferred from a green run.

**Still gated, on purpose:** `device.osc.in`. Hearing OSC needs a listening
socket pushing into the graph, which is a different problem from sending and
should not ride along on this. `device.ptz.osc`, the `stream.*` family and the
RealSense/stereo sources remain unimplemented.

## 2026-08-23 (later) — two worktrees had files deleted out from under them

A sweep for work that existed only on this machine turned into a repair job.
The di.iiii half of it, recorded here because the next person to open these
trees deserves to know what happened in them:

- **`~/di.iiii-dijetnode`** (`feat/raw-dijet-source`) showed 119 changed files.
  It was 113 DELETIONS — the whole of `serverXR/src`, 0 files on disk where a
  healthy tree has 93 — plus 14 inserted lines, every one of them a reversion
  to a pre-2026-08-08 file. Committing it would have deleted the backend and
  un-done `028430cf`/`7cdde5fc`, the blob-GC fix written after that bug nearly
  deleted four irreplaceable br_id_ge stills. The mtimes name it as an
  interrupted bulk copy at **2026-08-18 00:52**, mangling `scripts/` in a
  contiguous alphabetical run and stopping dead partway.
- **`~/di.iiii-rawadmin`** (`feat/raw-admin`) showed 36 changed files, all
  deletions: `src/raw/utils/` and `.claude/agents/` emptied wholesale, dated
  **2026-08-10** — a separate incident, not the same night.

Both branches matched their pushed remotes exactly, so nothing was authored and
nothing was lost. `git restore .` in each; both now report 0 changes and match
their commits file for file (110/110 in dijetnode's `serverXR/src`, all seven
Dijet panels intact). **Neither was committed** — the instruction was to commit
and push everything, and doing that literally would have destroyed working code.

Also pushed in the same sweep, for anyone looking for them: 14 di.iiii branches
that had never reached the remote (20 distinct commits, oldest from June) plus
the `pre-rebase-backup-20260805` tag. `git log --branches --not --remotes` is
now empty in this repo. One commit had a same-titled but different-patch twin
upstream and went to `rescue/gc-markup-refs-local` rather than being forced over
anything.

**A correction worth keeping:** pushing a task branch here does NOT open a PR.
`auto-pr.yml` carries `if: github.repository != 'dob-0/di.iiii'` — it is
fork-side only, and origin in this checkout IS the upstream. Task-branch pushes
are pure backup; treating them as outward-facing was wrong and cost a day of
branches sitting unpushed on one disk.
