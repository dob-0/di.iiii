# The Rig: di.iiii everywhere

**Every di.iiii is equal, and any version works with any other. Machines
either run di.iiii or speak to it with their own software. In jam anyone can
cue anyone; press show and one machine calls the show while everything else
locks.**

Agreed with the owner on 2026-09-16, one step at a time:

- *"mb we can make di.iiii like it can run everywhere"*
- *"we need to control from di.iiii side if keep the devices like how their softs"*
- *"b, but we need to jem mode and show mode"*: the mesh, not a conductor
- *"i want to all cases"*
- *"we need that all and also the local workflow and the version connections
  where every version can work with every other one"*

It sits under [THREE_DISTANCES](THREE_DISTANCES.md). That document says where
a show runs (this machine, this network, the world). This one says how
machines at the second distance find each other, share work and take cues,
without having to be on the same release.

The picture the owner chose from is [`rig/sketch.html`](rig/sketch.html), also
pushed as a local page, space `di-iiii-everywhere-the-rig`. The 20 cases and
the pieces each one needs are data in [`rig/cases.json`](rig/cases.json).

---

## 1. Two kinds of machine

| | runs di.iiii (a **member**) | **speaks** (keeps its own software) |
|---|---|---|
| examples | aylmo, the Mac, asuz, r-di (Pi) | di.jet (ROS), vizzz ESP32, projectors, TouchDesigner, Resolume, QLab |
| how it connects | joins the mesh itself; nothing to type | a **driver node** on any member speaks its protocol |
| what is installed on it | di | nothing |
| safety | blackout from anyone | stays on the device: robot arm switch, dead-man, firmware blackout |

A member starts as one of three **parts** of the same release, chosen by what
the machine can carry. It can always be overridden.

| part | runs | typical machine |
|---|---|---|
| **Studio** | everything: editor, Raw, 3D, server | aylmo, Mac |
| **Stage** | server + a screen that draws only what is shown | asuz, an old laptop, a TV box |
| **Hands** | server with no browser; its ports are nodes in the patch | Pi, VPS |

**People are not machines.** Visitors join from a browser through a **door**
(a QR code on any member) and act through that member. A crowd of 200 phones
is not 200 mesh members.

## 2. Jam and show

The mesh never changes shape. The mode changes who may cue and what may change.

| | **jam** (default) | **show** (pressed on any member) |
|---|---|---|
| cues | anyone to anyone; every cue carries its sender; last wins, unless the target is **held** | only the **caller**; everyone else's cues are held |
| blackout | anyone | **anyone, always**; a safety call is never locked |
| patch | live edits from any member | frozen as a snapshot, which becomes the show version |
| joining | free (the room can require approval) | waits for the caller |
| updates | offered, may be declined | none: not di.iiii, not the operating system |
| handover | n/a | the caller passes the call on with one press |

**Jam room settings**, for many people: **open** (anyone takes anything),
**lanes** (each person or group gets their own part), **turns** (one player,
the rest queue). **Holding** means a hand on the fader: a node, surface,
fixture or layer can be held by one person, everyone sees the holder's name,
and letting go or going idle frees it.

**Pre-flight**, before show is allowed, checks **features, not version
numbers**. The question is whether every member in the show can do what the
show uses. It also checks health (temperature, throttling, network). Anything
amber is listed and confirmed by a person.

Flow: jam → pre-flight → show → back to jam (the snapshot stays and can be
replayed).

## 3. Any version with any version

No member ever has to match another member's release.

### Protocol 1: the frozen core

Five messages that every release, forever, speaks the same way. They are never
renamed, never removed, and new fields are only ever added.

| message | meaning |
|---|---|
| `hello` | `{ protocol: 1, release, machine: { id, name }, part, features: { "<name>": <int> } }` |
| `card` | part, ports, health, what it shows, holders |
| `cue` | run a named cue: `{ name, args, from, mode }` |
| `blackout` | every output to black; accepted from anyone in any mode |
| `picture` | receive a picture stream; H.264 baseline is the floor codec |

### Features: agreed per pair

Everything that isn't core is a **feature with its own integer version**:
`pictures`, `hold`, `lanes`, `vj`, `showmode`, `drivers.dijet` and so on. On
`hello`, both sides compute the intersection and use only that. A newer member
talking to an older one simply doesn't use what the older one lacks. There is
no global "compatible release" number anywhere.

### Rules that keep it true

1. **Tolerant reader.** Ignore unknown fields and unknown message types, count
   them, and never error on them.
2. **Never delete what you don't understand.** A patch from a newer release
   opens on an older one with unknown nodes as grey placeholders ("made in a
   newer di.iiii"), preserved byte for byte in the document. Saving keeps them.
3. **Documents move forward only by reading.** A newer member reads every older
   schema. It never rewrites a shared document into a shape an older member
   present in the room cannot open. Migration happens in memory, and on write
   when no older reader is present.
4. **Updating is an offer, never a condition.** Being behind is never a reason
   to be locked out of a jam or a show.
5. **Speaking devices negotiate in their driver.** A driver declares the
   firmware or ROS versions it knows. An unknown version connects read-only and
   says so on its card.
6. **The compatibility grid.** CI plays each release against the older released
   artifacts (`di:pack` tarballs): hello, card, cue, blackout, picture, a patch
   opened back and forth with placeholders surviving. A red square blocks the
   release.
7. **The honest limit.** Protocol 1 begins with the first release that ships it.
   0.4.x installs predate it. Newer members reach them through an adapter over
   the existing follow and sync routes (`/api/sync/spaces/:id/*`, machine
   links), limited to what those routes can carry.

## 4. The local workflow

1. **Install once.** `di`, then no internet needed.
2. **Make** at home. Snapshots are automatic, and named saves are available.
3. **Jam.** Open the room. Every member who joins keeps a **full copy**.
4. **Show.** Pre-flight, then a frozen snapshot is the show version.
5. **Go home** with a copy. Changes merge when members meet again.
6. **Share.** Publish to diiii.xyz, send a `.diiii`, or keep it private.

There is no single master copy. When two people changed the same thing apart,
both changes are kept and shown side by side for a person to choose; nothing
is silently overwritten. A member that was off for a month catches up when it
joins, whatever version it runs.

## 5. State on 2026-09-16

Checked by grep on `origin/dev` and the open branches that day.

| piece | state |
|---|---|
| LAN room, `di up --lan`, `--guests` | in dev |
| second install follows a space (#445) | in dev |
| live project events between browsers | in dev |
| offline (vendored libs), `.diiii`, `di backup`, publish | in dev |
| presence | partial: jam markers and authorship, not in Raw |
| local HTTPS | partial: https server in dev; certificate placement on `feat/local-name-by-default` |
| machine links, picture engine, pictures between machines | branch: #447 (open, one failing check) |
| clips, VJ deck | branch: #450, #451 (drafts on #447) |
| drivers | partial: DMX/Art-Net and MIDI in dev; OSC declared; robot on `feat/raw-dijet-source`; no PJLink |
| cues | partial: map cue list only |
| blackout | partial: lighting desk only |
| versions | partial: `di update --from`, no downgrade; nothing between members |
| appliance (boot, restart, health) | hand-made on asuz, not in the product |
| holding, lanes/turns, show mode, handover, parts, protocol 1 | missing |

## 6. Build order

1. **Members know each other, in any version.** Protocol 1 core and feature
   hello, the machine card, discovery on the LAN, both-way member links, the
   compatibility grid, and the 0.4 adapter. Everything else is a feature on top.
2. **Land the picture work** (#447, then #450 and #451) and rehearse the
   two-artist jam on real machines.
3. **Jam rules.** Holding, presence in Raw, the local certificate for phone
   camera and mic, and placeholders for unknown nodes.
4. **Show mode.** Pre-flight, caller, lock, snapshot, blackout from anyone,
   handover, and a show-wide cue list with GO.
5. **Parts and appliance.** Stage and Hands, draw-only-what-is-shown and redraw
   only on new frames (measured on asuz: the picture network holds ~55% CPU),
   boot into the job, restart, and health from afar.
6. **Drivers.** OSC made real, the robot merged, PJLink, and sound-reactive
   nodes in the patch.
7. **Big groups and distance.** Lanes and turns, and a jam between two cities
   (never a show).

Test machines are the owner's own: aylmo (Studio), asuz (Stage, Ivy Bridge,
boots into a kiosk since 2026-09-16), r-di (Hands, Pi 3 B+, 0.9 GB), di.jet
(speaks; Ubuntu 18.04 can't run Node 22), a phone, and the Mac.
