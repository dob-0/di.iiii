## 2026-08-08 — Raw as a workspace: the plan, and the first node in it

Wrote `docs/architecture/RAW_WORKSPACE.md` and built the keeper node it names as
step one.

**The plan, read out of the code rather than the roadmaps.** Three findings
changed its shape:

- Nodes are already windows. Nine panel components exist plus `DesktopWindow`,
  and Studio is itself a node. "Nodes are windows, windows are small apps" is
  the existing architecture, not a proposal.
- The runtime ceiling recorded in `reference-raw-node-runtime-truth` (2026-08-06:
  no stream output ever carries data) is **out of date**. `nodeGraphRuntime.js`
  reads `context.liveOutputs`, a `Map` keyed `nodeId:portId` that panels write
  into; webcam frames and mic readings already flow through it. That seam is
  what the whole plan hangs off.
- `stream.*` and `device.osc.*` are gated because they are **not implementable in
  a page** — NDI and OSC are UDP/LAN — not because nobody got to them. So the
  workspace needs a local process, and `di` is the obvious host. Raised with the
  session designing `di` phase 2 rather than designing a second daemon.

The owner chose the hybrid shape (local *and* online, connect when needed), and
asked whether this could cover a festival toolkit. §7 answers that: the palette
is already a portrait of the Notations #2 rig, `source.realsense.d405` exists
because a D405 was used — and the keeper, which was that show's **main**
installation layer, had no node type at all. That is what this branch fixes.

**`agent.keeper`.** Endpoint-shaped, not account-shaped: you name a URL and a
model, so nothing runs as anyone and no credential is held. That side-steps the
open "agent authority" question entirely, and it is the only shape that works in
a room with no internet. One request body reaches both Ollama and any
OpenAI-compatible server; only the reply differs. Reasoning models' `<think>`
blocks are stripped and a truncated answer says so, both carried over from what
the rite hit live. `reply` and `busy` are real ports.

Set up in the window itself, not only the inspector — a node the palette can
place has to be usable where it lands.

**Two bugs found by looking at it in the real editor**, neither visible to unit
tests, both now in `known-fixes.md`:

- The panel sat on "Asking…" for ever while the request had actually succeeded.
  `RawEditor` passes its callbacks as inline arrows, so the unmount effect that
  listed one as a dependency re-ran on every parent render and aborted the live
  request. Any panel using the `liveOutputs` channel is exposed to this.
- The panel overflowed its own window by exactly its padding, clipping the reply
  on a phone. `raw.css` sets `box-sizing` per rule, not globally.

Verified end to end against a stub model box at 1440×900 DPR 2 and 390×844 DPR 3
— placed from the palette, configured, asked, answered, `<think>` stripped, and
looked at in both.

**Not done, deliberately:** no streaming responses (one reply per ask), no
conversation history, and no bridge — MIDI is the next step and the cheapest
proof of that contract.

## 2026-08-08 — MIDI In, the first node with two possible providers

`device.midi.in` came off `UNIMPLEMENTED_NODE_TYPES`. Web MIDI is real in the
page, so this is the one device family that needs no bridge — which is exactly
why it is the cheapest proof of the provider contract the bridge will later
implement for OSC and NDI.

Three things the parsing had to get right, none of them obvious from the spec:

- **A note-on with velocity 0 is a note-off.** Most keyboards release a key that
  way rather than sending `0x8`. Read as a press, every released note stays
  stuck on for ever.
- **System messages carry no channel nibble.** Clock (`0xF8`) and active sensing
  arrive constantly; masking their status byte yields a plausible-looking
  channel 16 and would fire the node dozens of times a second.
- **The default channel is now 0 (all).** The registry had it at 1, which
  silently dropped everything from a controller set to any other channel — and a
  node that hears nothing looks exactly like a broken cable.

`trigger` is declared `signal`, and the runtime computes no signal outputs, so
it carries a monotonically rising count — the same idiom as `time.beat`.

**Honest limits of the verification.** There is no MIDI hardware on this machine
and none in CI. The ACTIVE path was driven through a fake port installed at the
`navigator.requestMIDIAccess` boundary, so everything above that line is the
real code; the DENIED path was seen for real, because headless Chromium refuses
Web MIDI even with the permission granted. **NO_DEVICES is unit-tested only** —
it has never been seen in a browser, and no real controller has ever been
attached to this node.

Fixed while looking: `defaultFrame` of 320x260 was too small twice over — the
window's own four header buttons wrapped to a second row, which pushed the
channel select and the message line below the fold.

Still gated: `device.midi.out` (no sender yet) and all the OSC types (UDP —
needs the bridge).

## 2026-08-08 — zen: the workspace with nothing resident on it

§5.3 of the plan, built to a design the user delegated to a peer session and
which is better than what I had been heading toward. **One mechanism, not
three.**

I was about to build a zen-flip *plus* per-panel `⌘1..9` toggles — two systems
and a memorisation tax, and with no path at all on a phone, which has no
keyboard. The palette was already the answer: double-tap on empty canvas has
opened it since Raw existed. Extending *that* into the single summons means the
touch path is preserved for free and no new chrome is introduced.

- Default is zen: no topbar, no zoom buttons, no help or chat button. The canvas
  keeps its own empty hint, so a new workspace is **minimal, not blank** — worth
  stating because the first version of this genuinely was blank until I looked.
- `⌘K` / `/` on a keyboard, the existing double-tap on touch. `/` is ignored
  while typing, or no text field in the workspace could accept the character.
- Commands sort **above** node types: with the chrome hidden they are the only
  way back to it, so they must not be below a scroll.
- Hidden panel windows are listed generically, so a node type added later — or
  by PR #99 — is summonable without touching the list.
- **Relocated, not deleted.** Zoom controls vanish on a fine pointer (the wheel
  zooms) but idle-fade to 0.28 on a coarse one, where they are the only way to
  zoom. Deleting them would have undone a real touch fix.
- Extends the existing `universe.space` `showChrome` concept rather than adding
  a parallel flag.
- Preference is per-device localStorage, **not** document state: one
  collaborator choosing zen must not strip the topbar from everyone else. The
  first resolution is remembered, or a workspace that opened empty would get its
  chrome back by itself once it had a node in it.

**Two pre-existing CSS bugs surfaced.** Palette rows are flex children, so
`min-width: auto` let them grow to min-content — 301px inside a 268px box — and
the right-hand tag rode past the palette edge, rendering "PANEL" as "PAN". They
also lacked `border-box`, so `width: 100%` plus padding overflowed by the
padding. Both were there before; a wide enough tag just reached far enough to
show them. Found by measuring the box chain after guessing wrong twice.

**Also fixed a test that could not fail honestly:** the `RawGraphSurface` mock
never rendered `emptyHint`, so the hint tests were asserting against a mock
incapable of showing what they claimed to check. The mock now mirrors the real
component, including its `nodes.length === 0` condition.

Rebase note: recovering from a conflicted rebase with uncommitted work stashed
on top is how work gets lost — commit first, then rebase. The `agent` node's
category conflict resolved keeping **both** sides: dev's new palette `keywords`
and the move into the Agent category.
