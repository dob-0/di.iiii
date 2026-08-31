# Three Distances

**One product at three distances. The internet is for sharing, never in the
signal path of a running show.**

Stated by the owner 2026-08-31, recorded here so every session builds toward it
instead of rediscovering it. This is the top layer over MANIFESTO's "Where It
Is Going" — the decentralized, local-first direction was already written there;
this names the shape it takes for a person standing in a venue.

## The three distances

**This machine.** The local install (`di up`, `DI_LOCAL=1`): no account, no
internet, the Blender model. The show RUNS here — lights, visuals, scenes.
When the venue wifi dies mid-set, nothing on stage notices.

**This network.** The room, the festival LAN: stages, rigs (vizzz nodes,
projectors), phones, and other artists' local installs all reachable without
leaving the building. Live control and co-presence happen at this distance —
one desk driving five stages is a LAN story, never a cloud story.

**The world.** thedi.studio — which is not a different product. **Hosted is
our local that happens to be public.** It is the square: where works are
shared, spaces are handed out as addresses, and a phone can open a space, take
it home, and install a local of its own. Sync passes through here when the
internet exists; the show never depends on it.

## Why the walls we hit are actually the architecture

- A https page cannot fetch a http rig (mixed content). So the hosted editor
  physically cannot be in a lighting signal path — the DMX Out node says this
  in its panel instead of failing silently. The wall enforces the rule.
- The vizzz firmware already lives at distance two: UDP peer discovery,
  fleet forwarding, one blackout reaching every node. The rig layer got this
  shape before the platform did.
- `.diiii` files are distance three with no network at all — a work you can
  carry on a stick between festivals. Sneakernet is a supported transport.

## What each distance already has, and what it is owed

| | exists | owed |
|---|---|---|
| machine | `di up`, auth off, work-as-files, snapshots, schema-guarded update | first install still needs the npm registry once (vendor `node_modules` into the artifact) |
| network | mesh presence hub, vizzz fleet, phone-as-output (a URL is a surface) | peer discovery between di.iiii installs; one desk → many stages |
| world | hosted spaces, invites, publish, bundle import/export, GitHub sync | **the sync door** (below) |

## The sync door — design sketch

The missing piece is a space that lives in more than one place and reconciles
when a connection exists. What is already true in the code shapes the design:

**Already shipped, and kept:**
- `GET/POST /api/spaces/:id/bundle` — whole-space export/import, the cold
  transport. `di save` / `di open` are its doors.
- `/api/sync/spaces/:id/{status,pull,push}` — whole-scene sync against ONE
  configured peer (`liveSync.url` + bearer token), with the three hard-won
  rules: read verbatim or refuse, state the version you are replacing (409 is
  a 409), snapshot before overwriting.
- The status route's honesty: versions are per-install counters, so "are these
  the same?" is answered `unknown` — nothing tracks a shared ancestor yet.

**Step 1 — lineage (small, unlocks honesty).**
Mint every space a stable `originId` at creation; carry it in bundles and
scene reads. Each install keeps a per-space **sync ledger**: for every peer,
the last reconciled pair of versions and the content hash both sides agreed
on. `status` can then say *ahead / behind / diverged / in sync* instead of
`unknown`, and `pull`/`push` can refuse a diverged overwrite by name. No new
transport — the existing whole-scene sync just stops flying blind.

**Step 2 — peers, plural (the festival shape).**
`liveSync.url` becomes a peer list, where hosted is merely the default peer.
Add LAN discovery (a UDP beacon in the vizzz idiom) so installs on one network
find each other with zero internet and zero configuration. The UI door is one
control on the space card next to "Save to file": **Sync** — showing the
ledger's verdict per peer and offering push/pull. Pairing = the existing
bearer token, exchanged once (QR/link), because an auth-off local must still
choose who may write into it.

**Step 3 — ops, not scenes (rides the CRDT non-negotiable).**
Whole-scene sync cannot merge two people's offline evenings — one side wins.
The op-log is already append-only and CRDT-compatible by contract
(MANIFESTO non-negotiable #3, "the seed of the future P2P sync layer" — this
is that layer arriving). Stamp ops with (actor, counter); sync becomes
"give me your ops since my last ledger mark", both directions; convergence
comes from the CRDT discipline the format has been holding all along.
Step 3 is the real door; steps 1–2 make it arrive as an upgrade instead of a
rewrite.

**What sync is NOT:** live control. Reconciliation is background and eventual;
driving five stages at once is a distance-two, realtime concern (the mesh hub,
the rig fleet) and must keep working when sync has never run.

## The phone, precisely

A phone does not run a server. Its three honest roles: a **surface** (any URL
— the audience's phone as an output was always di.iiii's own ground), a
**hand** (touch-first editing, the toybox), and a **courier** (open a hosted
space, hand it to a local install on the LAN). "Install the local" from a
phone means the phone walks you through putting the local on the machine that
can hold one — and then talks to it at distance two.

## What this refuses (unchanged from the position)

No social presence stack, no team SaaS, no dependence on our servers to
function, no number about scale. And no sync feature may add a lock, a
central authority, or a history rewrite — non-negotiable #3 outranks
convenience here.
