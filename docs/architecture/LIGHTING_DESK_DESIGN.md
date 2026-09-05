# The desk we are building

An audit of professional consoles (grandMA3, ETC Eos, ChamSys MagicQ, Avolites Titan,
Hog 4, ONYX), the club and VJ tools (Resolume Arena and Wire, Daslight/Nicolaudie,
SoundSwitch, MADRIX, Arkaos, TouchDesigner), the open-source field (QLC+, xLights,
LightJams, OLA) and the protocol layer, read against what `serverXR/src/lighting`
actually is today. Written 2026-09-03. The raw audits are in the session scratch; what
survives of them is here.

---

## 1. What the field actually knows

Six consoles, three vocabularies, one machine:

> patch → programmer (a scratch buffer of what you are touching) → **palettes** (named,
> typed, reusable values) → **cues** that store *references* plus sparse deltas → a cue
> list resolved by **tracking** → **executors** that put a list under a finger → a
> **priority/merge** engine → an **effect** engine that adds a time-varying offset
> distributed across an ordered selection by **phase**.

Four abstractions carry all of it, and we have none of them.

**Reference, not value.** A cue stores a pointer to "Position 4 — Downstage Centre", not
the numbers. The truss moves 1.2 m in the next venue; you re-point the palette once and
two hundred cues are correct. grandMA3 says it flatly: *a reference to the preset is
stored, not the actual values.* Avolites adds the axis nobody else names cleanly —
a palette is per **fixture** (position), per fixture **type** (colour, gobo), or
**global**. Two consequences a builder must design for: deleting a palette has to bake
its values into whatever referenced it, and whether a value is still a reference must be
visible at all times, because that confusion is the single biggest support topic in the
field.

**Tracking.** Cues store only what changes; the state at cue *n* is a fold over the cues
before it. A 200-cue play with 300 channels is 60,000 numbers stored flat, and a note
change means editing every cue after it. Stored as deltas, the object on disk is the
designer's intent — "this warm wash comes up at 12 and stays until 47" — and raising it
at 12 fixes 13 through 46 for free. The vocabulary around it (block, assert, trace, cue
only) is the control surface over that fold. The derived feature worth envying is
**AutoMark**: the desk reads its own dependency graph and inserts the invisible
pre-position move into the preceding cue, so heads never swing in view.

**Selection order is data.** A group is a list with grid positions, never a set. Fan,
effect phase, "next fixture" and chase direction all read that order. This is where a
fast programmer's speed actually lives — Eos `Offset` (even/odd/reverse/random/mirror
in/chan-per-group, chainable) and MA3's MAtricks with its *seeded, reproducible* shuffle.

**Phase as an ordinary attribute.** MA3's phasers are the cleanest idea in the whole
audit: an effect is *a preset with more than one step*. Speed, Phase (0–360°), Width and
Transition are attributes like any other, so `Phase 0 Thru 360` across an ordered group
turns any two-step phaser into a wave. There is no separate chase object — a chase is a
phaser whose transition is zero. And **Stomp** is the honest answer to "what happens when
static data lands on a running effect".

**Fan** deserves its own line, because it is the most-loved tool in lighting and the
cheapest thing on this list to build. One gesture turns an ordered selection into N
*related* values. A rig where every fixture is identical reads as a machine; a rig whose
values walk reads as design. Fan is to lighting what a gradient tool is to graphics, and
its output is plain static data you can record like anything else.

## 2. What the club tools know that the consoles do not

**One clip per layer.** Resolume's whole interaction is a grid where each row plays
exactly one cell, so the entire state of the show is readable at a glance and every
change is one gesture deep. No dialogs, no ambiguity.

**Effect chains are scoped.** An effect on a clip travels with the clip; an effect on a
layer stays in the slot; an effect on the composition rides everything. Lighting desks
have no equivalent, and it is exactly what "add a strobe over whatever is running" wants.

**Every parameter has an animation mode.** Not a separate effects engine — each parameter
can be static, or driven by the clock, by clip position, by the crossfader, or by one of
three FFT sources, with its own envelope, savable as a preset. That is what replaces a
timeline for improvised work.

**The Dashboard**: one control wired to many parameters, so the operator moves a meaning
("intensity", "chaos") rather than eight sliders. The highest-leverage idea in the audit.

**The clock shows phase, not just tempo** — a square that blinks the beat, a highlight
every 16 — and it has *nudge*. It assumes the clock will drift and hands the human a
continuous fix instead of a re-tap.

**Daslight's approachability is one primitive**: a scene is a list of steps, each a
snapshot with a fade time and a wait time. That single object replaces cue, cue list,
chase and submaster, and a club operator can learn it in ten minutes.

**And its best idea is one no console has**: the programming surface and the operating
surface are different documents. You build the show in one, then author a *custom
operator surface* per venue — big labelled buttons, the six things tonight actually needs
— and mirror it to a phone. Eos reaches the same place from the other side with magic
sheets, which are loved for four separable reasons: you touch the light where it is in
the room rather than by number; the sheet shows live state; it flattens the hierarchy to
one screen; and it lets someone who is not the programmer run the show.

## 3. What everyone gets wrong

Every tool in the audit fails the same way at showtime: **automation trusts pre-computed
metadata, and when the assumption breaks the room goes quietly dead** rather than loudly
wrong. SoundSwitch skips a track with no beatgrid. A missing cached scene renders black.
A network peer disappears and the layer holds its last frame for ever. Nobody defines
what the room looks like when the machinery stops.

We already have one half of this right: DMX is continuous-refresh, and this desk learnt
the hard way that fixtures fall into their built-in programs when frames stop, so it
transmits every tick whether or not anything changed. The other half — *a defined
failure state* — is a thing to design in rather than discover.

## 4. Where we actually are

The desk today (`serverXR/src/lighting`, ~12k lines) is a good single-layer instrument
and a poor multi-layer one. Precisely:

- **One value per fixture per attribute, one layer.** A scene recall assigns straight onto
  `fixture.values`. There is no merge, no priority, no second thing running.
- **Scenes bake absolute numbers.** No palettes, so a repatch or a refocus means
  re-recording every scene that used the value.
- **Effects are a level multiplier.** `fxLevel()` returns one 0–255 number per fixture
  that scales the dimmer. Fourteen good modes, all of them intensity-only. There is no
  colour chase, no gobo spin, no position effect except through the LFO side-channel,
  which is capped at sixteen and one attribute each.
- **The chase is a flat list with one time.** No per-step times, no follow, no tracking,
  no second stack.
- **Groups are selection metadata**, with no fader and no order semantics.
- **One fade time per scene**, linear, all attributes together.
- **No fan, no palettes, no undo, no cue list, no timecode, no sACN, no fixture library.**

What is genuinely good and must survive: the honest status reporting, the continuous
refresh with its hard-won comment, the role/kind type system for channels
(emitter/level/position/control/fine), the audio engine's freshness gate as a dead-man's
switch, the stage view as a spatial addressing surface, and the fact that the whole thing
has no dependencies and boots from one file.

## 5. The design

One structural bet, from which most of the rest falls out.

### 5.1 A look is a list of steps, and that is the only content object

```
look = {
  id, name,
  kind:  'all' | 'intensity' | 'colour' | 'position' | 'beam',   // what it may set
  scope: 'each' | 'type' | 'global',                             // whose value it holds
  steps: [ { values, width, transition, accel } ],
  speed: { bpm } | { seconds },   phase: <fan spec>,   measure
}
```

- One step and no speed → a **scene**, or a **palette** if its kind is narrow.
- Two steps and transition 0 → a **chase**.
- Two steps with transition and a phase fan → a **wave**, a ripple, a colour swell.
- `values` may hold a number **or a reference to another look** — that is palettes, and
  fanning across three or more references keeps them referenced, the way Eos does it.
- `scope` decides whether the value is per fixture, per fixture type, or global.

Scene, palette, chase and effect stop being four objects with four editors.

### 5.2 A layer is a look under a finger

```
layer = { id, name, content: lookId | cuelistId, level, on,
          merge: 'htp' | 'ltp' | 'multiply', priority, mask,
          rate, size, flash }
```

Render composites layers bottom-up: each contributes values for the attributes its mask
owns; intensity merges HTP inside a priority tier, everything else is LTP; the layer's
level scales its contribution. This one structure is a submaster, an executor, a Resolume
layer and "a strobe on top of the current look" at the same time. Priority plus LTP is
the core, with HTP as one merge function inside it — the audit is unanimous that HTP as a
first-class concept is a sacred cow to drop.

### 5.3 Every parameter can be animated

A value is `number | {ref} | {from, to, wave, speed, phase, band}`. The fourteen effect
modes we already have become wave shapes available on *any* attribute, and the LFO engine
becomes the same mechanism rather than a parallel one. Audio bands are just another
driver, with attack/release and a gate, because naive audio-reactive looks bad.

### 5.4 The clock is a first-class object

BPM with visible phase, tap, **nudge**, per-layer rate multipliers, and later Ableton
Link and timecode. Speed masters as in MA3: several clocks, one of them audio-driven.

### 5.5 Two surfaces, not one

The programming surface (what Setup and Control are now) and a **drawn operator surface**
— buttons, faders and live state placed on a canvas, bound to layers, looks and masters,
authored per venue and opened on a phone. This is Daslight's Easy Remote and Eos's magic
sheet, and it is the piece that lets someone who is not the programmer run the night.

### 5.6 A defined failure state

A named look the desk falls back to, a watchdog that fires it, and an explicit answer to
"the beat source vanished" / "the graph stopped sending" / "nobody has touched anything
for ten minutes". Loudly wrong beats quietly dead.

### 5.7 The thing only this desk can do

Resolume pixel-maps lights as an afterthought and has no fixture model. Consoles have no
visuals. Nobody treats the show as a shared, linkable, multi-operator document. di.iiii
already has the 3D space, the projection mapper, the node graph and the publishing. So
the end state is not "a lighting desk that also does visuals" — it is **one show
document** in which a cue moves the lights, the projection surfaces and the room at once,
addressable by URL, editable by two people, and openable on a phone.

## 6. The order of work

1. **Layers and looks.** The render pipeline becomes a composite. Existing scenes migrate
   to one-step looks in a base layer; the chase becomes a layer; FX becomes a layer.
   Nothing in the API breaks. *Everything below depends on this.*
2. **Fan and selection order.** Cheapest visible win in the audit.
3. **Palettes.** Values by reference, with scope, visible reference state, and baking on
   delete.
4. **Effects on any attribute.** The existing modes as wave shapes on colour, position
   and beam; phase as a fannable attribute.
5. **Cue lists with tracking**, per-attribute times, follow/hold, and derived marks.
6. **The operator surface**, drawn, phone-first.
7. **The outside world**: sACN alongside Art-Net, Open Fixture Library import (629
   fixtures, fetched through their API rather than vendored), multi-universe on the
   serial widget, OSC in, timecode and Link.
8. **One show**: a cue that fires light, projection and space together.

Traps the audit names, recorded so nobody re-proposes them: DMX from a browser tab is
impossible (no UDP, no raw socket — the local daemon owning transport is the only shape,
and we already have it); Web Serial can open a widget but has no BREAK duration control;
RDM pays off only at rig scale and needs splitters most venues lack; and a purely spatial
"lights near this shape follow it" model, seductive as it is, makes precise cueing
inexpressible — it belongs as one node, not as the paradigm.
