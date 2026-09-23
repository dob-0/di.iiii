## 2026-09-23 — layers: a project opens bare and the bar grows with it (units 1–3)

Units 1, 2 and 3 of `di-atlas/decisions/2026-09-23-layers-what-inside-what.md`. The owner's
words that decide them: "make it layer as layer, you create 1st what inside what and next
next" and "a clear layer-by-layer creating process, not all at once". Question 1 of the
decision (does the bar grow inside a project) is answered yes by those words. Questions 2
(a thing inside a Geo) and 3 (which one is the Desk) are not answered; nothing here depends
on them. Method: progressive disclosure (J. Nielsen, NN/g, 2006), as the decision names it.

### Built

- **`src/project/layers.js`** — the one plain function every later unit reads:
  `readProjectLayers(document, { loaded })` → counts, what each layer holds, which layers are
  open, and `empty`. The decision's table and its three riders: a layer that holds something
  never hides; `loaded: false` answers `open: null` ("not decided") so every caller keeps
  today's screen; nothing is stored. `describeProjectLayers` writes the card line.
  `shared/layers.cjs` is the server twin with the 17 standing node kinds and the windows
  written out; `layers.test.js` runs the decision's 8 fixture projects through both and
  checks the lists against the registry.
- **Decisions taken inside the rule, for the owner to see.** (1) A *window* on the Nodes
  canvas is neither a thing nor a connection: the registry's own `watch` and `agents`
  families plus `view.library` and `view.publish`. Without this, opening an outliner opened
  the wall. A mic, webcam, MIDI in are drawn as windows but are sources, so they stay
  connections. (2) A cue that calls a light scene or look counts as the lamps layer holding
  something (the decision lists it among the lamps facts; hiding Light from a project that
  already drives the desk would take a control away from a project that holds something).
  (3) A project in code mode is never "empty", so a page project never opens bare.
- **Unit 1.** `GET /api/spaces/:id/projects` carries each project's non-zero counts, read
  from the document (normalized in memory, never written back) and cached per
  (space, project, version, updatedAt) like the scene-or-page mode. Each card in the one
  project list gets one line (`sh-code-blurb`, an existing class): "4 things · 2 nodes ·
  1 wire · 1 surface · 1 lamp", or "empty". `/api/spaces` carries `projectCount` /
  `publishedCount` from one grouped query (re-applied from 2efc05c7; nothing else from
  that branch), only for a space the caller may enter; the card says "11 projects ·
  11 published" (`ssh-space-project`, existing class). "Published" = on show, the
  `/contents` rule.
- **Unit 2.** `useProjectLayers` (the rule plus one page-only memory: what was given on this
  page is not taken back, so an undo of the first box keeps the tools). A new project in
  Studio shows the bar, the room, Create (not closable while bare) and the hint. The
  cluster, the other windows, Drive, Commons, the Files list and the saved layout return
  with the first thing, no reload. The open jam is untouched; "⚒ All tools" is on every
  project's cluster (own key `di.studio.allTools`, per browser, live to the bar). The first
  hint in an empty project is "Add something", then "Tap it", done by the tap itself
  (placing a thing already selects it); the coach mounts only after the document has
  loaded and waits behind a phone sheet instead of covering its text. Phone: Create alone,
  then the full phone bar. `scripts/count-controls.mjs` (`npm run count:controls`) is the
  sketch's counter, in the repo.
- **Unit 3.** `SurfaceBar` takes `layers`; inside a project only, Nodes shows when the
  connections layer is open, Projection the wall, Light the lamps. Never the surface you
  stand on; nothing before load; every name under All tools. Studio, Nodes (RawEditor: one
  import, one hook line beside `showBar`, one prop) and Projection pass it.
- **"Loaded"** is the store's `hasLoaded` — the `projectStore.js` hunk and its test taken
  verbatim from `feat/things-are-cards` (#545) so both lanes carry one flag — AND the
  document's id being this editor's project (a switched editor keeps the old document and
  the flag until the new one lands).

### Numbers (dev stack on 4380/5380, fresh data root, local-install mode)

- **Controls on a new project, Studio, 1440×900 at DPR 1.5** (`count-controls.mjs`):
  **61** today → **30** after unit 2 → **27** after unit 3 (bar 7, Create 17, room 2,
  hint 1). The decision's 62 was the sketch's counter on his install; this counter also
  counts the "Import files" label the sketch's selector missed, and here the room has 2
  controls, not 3. Phone 390×844: 19 → 11.
- **Screens that must open as today**, same counter, before/after: the open jam simple
  25/25 desk, 10/10 phone; jam with all tools 68/68, 19/19; Nodes and Projection on a full
  project 27/27, 32/32, 23/23, 29/29. A full project in Studio 73 → 74 (the All tools
  button the decision asks for, nothing removed). An objects-only project loses
  Projection and Light from its bar (unit 3 by design) and gains All tools.
- **Project list, 5 × `curl -w '%{time_total}'`**, a 74-project space of 18 MB documents
  (60 × 50 boxes, 10 × 250, 4 × 4000 — larger than the biggest real space, 74 projects):
  before 1.60 / 1.05 / 1.12 / 0.82 / 0.92 ms, 19.3 KB; after **192 (first read after the
  server starts) / 2.16 / 1.34 / 1.26 / 1.21 ms**, 22.0 KB. The 13-project lab: before
  0.68–1.01 ms, 2.3 KB; after 4.9 cold, then 0.83–1.34 ms, 3.3 KB.
- **Reload, full project, 10 × each** in Studio desktop, Studio phone, Nodes and
  Projection, every bar state recorded from first paint by a MutationObserver: **no name
  went away in 40 loads.** In Studio, Projection arrives 40–70 ms after first paint —
  measured identical on today's code (the shell learns the space id late); not this change.

### Seen

Every screenshot read: new project desk/phone, the Create sheet on the phone, one box
placed (the saved Scene window returns at its saved x; its y is clamped to fit by the
existing panel code), "Tap it" completed by tapping the box, undo keeping the tools and a
reload of the emptied project opening bare again, Nodes on the project (bar without
Projection), a node (Projection appears), a wire drawn by drag (Blur's input reads WIRED),
a lamp (Light appears), /tools, /wiki, a space's contents page and /spaces, the lab list
and /spaces cards desk and phone. No page scrolls sideways.

### Owed

- **On his install and the S24.** Seen here on a dev stack with the phone emulated at DPR 3.
  The decision checks each unit on local.thedi.studio after `npm run di:pack` and
  `di update --from`, and on the S24 in LAN mode. Not done: this session must not touch
  the install on 443/4000.
- **The phone bar cuts a word at the right edge** (it scrolls sideways by its own CSS).
  At 390 px: a full project's bar is 599 px wide, Projection · Tools · Light · Wiki past
  the edge — the same today. A new project's is 405 px (Wiki only). Unit 3 forbids
  restyling the bar, so it is left: the fix is a design call (drop the project title on a
  phone, where every tool repeats it below; or a fade at the edge).
- **"All tools" is not on a bare screen**, following the decision's "nothing else": it
  arrives with the first thing, and once set in any project it covers every project.
  Putting it behind the room's "?" would reach it with no new control — the owner's call.
- **The window is still titled Create**; the decision calls it Add. A rename is a
  vocabulary change, not made here.
- "N projects · N published" will read the same number twice on most spaces (every
  project is live unless set otherwise).
- Projection's late arrival on Studio's bar (above) — Studio could hand the bar the
  route's space id, known at first paint.
