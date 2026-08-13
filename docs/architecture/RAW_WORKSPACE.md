# Raw as a workspace — nodes are windows, windows are small apps

Status: **plan, not built.** Written 2026-08-08 against `origin/dev` @ `9bb3e4e7`.
Every claim about current behaviour below was read out of the code, not the roadmaps.

---

## 1. What the thing is, in one paragraph

Raw becomes the place the work happens, instead of a place scenes are authored.
A node is a **window**; a window is a **small app**; the graph is the wiring
between them. A webcam node is a window showing the camera *and* a port carrying
its frames. An agent node is a window you type into *and* a port carrying what it
returned. Opening a workspace should feel like opening a desk with the tools
already on it — not like opening a file.

That is the whole idea. Everything below is about which parts of it already exist,
which part is a genuine wall, and the order to build in.

---

## 2. What already exists (verified, not assumed)

This vision is much further along than the roadmap docs suggest, and the reason is
one commit that nobody wrote down.

**Nodes are already windows.** `getNodeRender(node) === 'panel-2d'` makes a node a
panel; `RawEditor.renderViewNodeContent` dispatches on `typeId` to a real
component. Nine already exist:

| Window | Component |
|---|---|
| world / viewport | `WorldPanelWindow.jsx` |
| webcam | `WebcamSourcePanel.jsx` |
| microphone | `MicSourcePanel.jsx` |
| text | `TextPanelWindow.jsx` |
| image | `ImagePanelWindow.jsx` |
| chat | `ChatPanelWindow.jsx` |
| outliner | `OutlinerPanelWindow.jsx` |
| director | `DirectorPanelWindow.jsx` |
| timeline | `TimelinePanelWindow.jsx` |

plus `DesktopWindow.jsx` as the frame and `PropertyInspector.jsx`. Studio itself is
a node (`typeId: 'studio'`). So "nodes are windows, windows are small apps" is not
a proposal — it is **the existing architecture**, with nine apps in it.

**Streams can already flow.** This is the important one. The old audit
(`reference-raw-node-runtime-truth`, 2026-08-06) recorded a hard ceiling: the graph
could only carry number/color/vec3/boolean/string, so no `geometry`, `texture` or
`signal` output ever produced a value. **That ceiling has since been broken** and
the note is out of date. `nodeGraphRuntime.js` now has:

```js
case 'source.webcam':
    if (portId === 'frame') return context?.liveOutputs?.get(`${node.id}:frame`) ?? null
```

`liveOutputs` is a `Map` keyed `nodeId:portId`, held in `RawEditor` state, written
by panels via `handleLiveOutputChange`, and folded into the graph context. It is
the **escape hatch for values that cannot be serialised into `node.values`** — a
live `VideoTexture`, an analyser reading, a process handle.

That single mechanism is the seam this entire plan hangs off. It already carries a
webcam frame and a microphone's volume and frequency.

**The palette is 54 types, 22 gated.** `UNIMPLEMENTED_NODE_TYPES` is honest about
why each is gated: *"no OSC client, no WebMIDI"*, *"no compositor, no transport"*,
*"zero consumers outside this file"*.

**There is an agent surface, but it cannot run anything.** `agentBoardRoutes.js`
exposes `GET /api/agent-board` and `GET /api/agent-board/session/:sessionId` —
read-only observation. `aiConnectionRoutes.js` exposes `status` / `connect` /
`disconnect` — credentials, not execution. **Nothing starts an agent.** There is no
`agent` node type at all.

---

## 3. The wall, stated plainly

**A browser tab cannot speak NDI, OSC, or arbitrary local processes.** This is not
a gap in di.iiii; it is the sandbox. Specifically:

- **NDI** is a LAN discovery + transport protocol over UDP/TCP with a native SDK.
  No browser API reaches it. Not now, not with a flag.
- **OSC** is UDP. A page cannot open a UDP socket.
- **MIDI** is the one exception — `navigator.requestMIDIAccess` is real in
  Chromium, needs a permission prompt, and is absent in Safari.
- **Running an agent** means spawning a process with filesystem access. A page
  cannot, and should not be able to.

So `stream.*` and `device.osc.*` are not gated because nobody got round to them.
They are gated because **they are not implementable in the page**, and the gate is
telling the truth.

### The consequence

A workspace that runs cameras, NDI, OSC and agents needs **a local process on the
same machine as the person**. There is no design that avoids this.

And that process already exists: **`di`**, the CLI, shipped v0.3.1 tonight. It
already installs and serves di.iiii locally and offline. Making it also a **local
bridge** — a small localhost daemon the page talks to, which owns the things the
sandbox forbids and publishes results back into `liveOutputs` — is a smaller step
than building a second host.

This must be agreed with whoever owns `di` phase 2 before any of §5 is built.
Raised with that session already.

---

## 4. The two shapes this can take

The fork is real and it decides everything downstream.

### Shape A — browser-only workspace

Only what the sandbox allows: webcam, mic, MIDI, screen share, browser panels,
agents via the server. No NDI, no OSC, no local processes.

- Works today, on any machine, with no install. Works on the phone.
- Ships in days, not weeks.
- Permanently cannot do NDI or OSC.

### Shape B — workspace with a local bridge

Shape A, plus a `di` daemon on localhost owning NDI/OSC/MIDI/process spawning.

- Can actually do the thing that was asked for.
- Only works where `di` is installed — so the workspace has two modes and the UI
  must show which one it is in, honestly, per node.
- Needs an auth story on the LAN, which `di venue` needs anyway.

> **DECIDED 2026-08-08 by the owner: Shape B, hybrid** — *"have the local and
> online version and if needed connect."* Both modes exist; the page works
> online without a bridge, and gains the local capabilities when `di` is
> present. Which mode a node is in must be visible in the node, never guessed.

**Recommendation: build A's foundation in a way that B plugs into.** Concretely
that means one contract — the *capability provider* in §5.1 — with a browser
implementation first and a bridge implementation second. It is the same work up to
the seam, and choosing wrong later costs a rewrite of every device node.

---

## 5. The build, in order

Each step is independently useful and independently shippable. Nothing here needs
a schema change: `typeId` is a free string and `values` is unvalidated, so new node
types cost zero migration.

### 5.1 Formalise the live-port contract — the keystone

`liveOutputs` works but is ad hoc: a `Map` in one component's state, with no
lifecycle beyond mount/unmount, no error state, no notion of *who* provides a port.

Turn it into a small explicit contract:

- a **provider registry**: `registerProvider(nodeId, portId, { get, subscribe, status })`
- a **status per port**: `idle | starting | live | denied | unavailable | error`,
  so a node window can show *why* it is dark instead of silently reading `null`
- a **capability query**: `capabilities()` returns what this host can do
  (`webcam`, `mic`, `midi`, `ndi`, `osc`, `process`) — the browser answers one way,
  the bridge another

Everything else in this plan is a provider. Do this first or every later node
invents its own convention.

**Regression guard:** a test asserting that a node whose provider reports `denied`
renders a denied state rather than an empty panel — the silent-failure class that
43 of 134 known fixes fall into.

### 5.2 The agent node — the highest-value single node

`agent.run`: a window you type a prompt into, showing streamed output, with ports
`prompt` (in), `result` (out), `running` (out).

Server side, this is the real work: an execution endpoint with a session, streaming
back over the existing SSE the project routes already use. `agentBoardStore.js`
already models sessions — extend rather than duplicate.

**Blocked on a decision:** whose credentials, and what the agent is allowed to
touch. `aiConnectionRoutes` holds the connection; nothing yet says an agent may run
as *you* against *your* files. Do not build this without answering that.

### 5.3 Window-manager honesty

Nine window types exist but the workspace around them is thin. What is missing is
the boring part that makes it feel like a desk:

- layouts that persist per workspace, not per node `values.frame`
- a way to focus/cycle windows from the keyboard
- windows that survive a reload in the same place

This is where "all things on hand" actually gets delivered, and it needs no new
capability at all.

### 5.4 Bridge-backed nodes — only after §4 is decided

In dependency order once the bridge exists: `device.midi.*` (also works
browser-only, so it is the cheapest proof of the contract) → `device.osc.*` →
`stream.*` / NDI.

`stream.compositor` and `stream.switcher` are a video-mixing engine. They are the
largest single item in this plan and should be last, not first — and probably a
separate plan of their own.

---

## 6. What this plan deliberately does not do

- **It does not touch Studio.** Studio is locked to five windows and its UI is
  preserved as-is. Raw is where this happens.
- **It does not add chrome to working surfaces.** New windows, not restyled ones.
- **It does not promise NDI in the browser.** If the answer is Shape A, NDI is not
  on the roadmap at all, and the palette should say so rather than gate it silently.

---

## 7. Festival scope — what this toolkit should and should not be

The owner's question was whether Raw can cover a full multimedia artist's toolkit
for a festival. **"Full" is the wrong target**, and the palette already shows why
the right one is reachable.

### The palette is a portrait of a real rig

`source.realsense.d405` exists as a node type because a D405 was used at Notations
#2 (Jul 20 – Aug 2 2026). The show's tech rider had five layers, and the registry
is those layers with the runtime missing:

| Rig layer | Palette | State today |
|---|---|---|
| **Keeper** — a local LLM on site; *the main installation layer* | — | **no node type exists at all** |
| Senses — RealSense D405, Orbbec Astra, mic | `source.*` | mic + webcam live; D405 / stereo / insta360 gated |
| Body — ROSMASTER, 2× ESP32, RPi | `device.osc.*` | gated; needs the bridge |
| Projection — 2× 5000 lm | `stream.*` | gated; needs NDI |
| Visitors — jam laptops + phones | the web | **already the strongest part** |

The keeper is the striking absence: it was the *main* layer of that show and it is
the one thing the graph cannot express.

### What di.iiii uniquely owns

**The audience's own device as an output surface, addressed by a URL, with the
whole show as one document that syncs and survives as an archive.** Proven three
times in public — br_id_ge, beyond_form, platform-recordar. No festival tool on the
market does this. That is the band worth owning, and it is already won.

### What to refuse, explicitly

- **A video mixing engine.** `stream.compositor` / `stream.switcher` is rebuilding
  OBS. Speak NDI to it instead.
- **A timeline editor.** `cutlab` already exists for that and is destined to live
  inside di.iiii — compose with it rather than absorbing it.
- **A DAW, and projection mapping.** Ableton and MadMapper exist and are not the
  fight.

Interoperate via OSC / MIDI / NDI; do not replace.

### What actually decides a festival

Not features — **not failing in a room with no internet, on one laptop.** `di`
running offline is worth more than ten node types. The estate's own rule applies
directly: the desktop goes offline, so nothing critical may depend on it.

### The shape, then

Aim at **the show's nervous system plus the audience layer**: cue/go, sensing in,
devices out, phones as the surface. `view.timeline` and `view.director` already
exist as the cue spine. In that shape the toolkit is genuinely completable.

**Build order:** the keeper node first — it restores the missing main layer and
needs no bridge — then MIDI, as the cheapest proof of the bridge contract.

---

## 8. Open questions, for the owner

1. ~~**Shape A or Shape B?**~~ **ANSWERED: B, hybrid.** Local and online, connect
   when needed.
2. **Agent authority** (§5.2) — what may an agent node read and write, and as whom?
   *Deliberately side-stepped by the first keeper implementation, which talks to an
   endpoint the user names rather than running anything as anyone. Still open the
   moment an agent needs to touch files.*
3. **Is `di` the bridge**, or a separate daemon? Overlaps `di venue` and its LAN
   auth problem.
4. **Does this workspace need to work on a phone?** A touch path for every
   interaction is a standing requirement; a window manager designed mouse-first
   fails it, and retrofitting is expensive.
