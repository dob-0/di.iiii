# Vocabulary — one word, one meaning

The words a person reads in di.iiii are a contract, the same way the schema is. This file is
that contract. It governs **strings a user can read**: copy, labels, headings, buttons,
`aria-label`, `title`, `alt`, placeholders, toasts, errors, empty states, node labels, wiki
prose, meta tags, and the READMEs.

It does **not** govern identifiers. Type ids, op names, document keys, CSS classes, filenames,
route segments and variable names stay exactly as they are — `space` alone appears 5,607 times
in source and renaming it would buy nothing. The whole point is that the two sets barely
overlap: roughly 200 sentences carry the entire user-facing vocabulary.

Written 2026-08-19 after a full audit of the product's words. Guard: `src/copyVocabulary.test.js`.

---

## The dictionary

Each word does exactly one job. If you need a second job done, use a different word.

| Word | Means, and only this |
| --- | --- |
| **space** | A place that is yours: an address, a guest list, and everything in it. |
| **project** | One thing you make inside a space. |
| **canvas** | The surface your nodes sit on. |
| **node** | One card on the canvas. |
| **object** | One thing standing in the scene. |
| **scene** | The 3D place you can be inside. |
| **page** | A published web page (HTML/CSS/JS), never a project. |
| **Studio** | The one you walk into for the four editing panels. A node, not a lane. |
| **di.iiii** | The whole thing. Spaces live in it. |
| **place** | A real room in the world: walls, a rig, an audience, a date. A space may be its twin; it can never *be* it. |
| **production** | A place, a client, a work and a run. What the studio makes. It uses di.iiii; it does not live in it. |
| **work** | What the public meets: a title, an author, an address. The same object a **project** names backstage. |
| **Nodes** | The node canvas: the tool where a project's nodes are wired together. Opens at `/{space}/raw/projects/{project}` — the route stays `raw`, the word a person reads is Nodes. Added 2026-09-23. |
| **Projection** | The tool that puts a project on a wall: drag its surfaces onto the shapes there. Opens at `/{space}/map/{project}` — the route stays `map`, the word a person reads is Projection. |
| **Light** | The lighting desk: patch, looks, cues, Art-Net out. Runs only on your own machine (a local install), at `/light/`. Added 2026-09-23. The capital is the tool; a light in a scene and a stage fixture have their own words, **light** and **lamp** below (settled 2026-10-13). |
| **lamp** | A stage fixture: the real device on the rig (a moving head, a par, a strip). In a scene it is a light that carries a fixture: a typed one from the rig builder, or a join to a fixture of the lighting desk. A project's card counts these: "74 lamps". Owner, 2026-10-13: *"lamp" = a stage fixture.* Added 2026-10-13. |
| **light** | A 3D scene light: the sun, a point, a spot, an ambient light, joined to nothing on the rig. Written with a small l; the lighting desk is **Light** with a capital. A project's card counts these: "2 lights". Owner, 2026-10-13: *"light" = a 3D scene light (sun, point…).* Added 2026-10-13. |
| **head light** | A flashlight that follows a visitor's view while they walk in a scene. A project turns it on; the visitor switches it on and off with L (on a phone, the Head light button) and it starts off, never saved. Two words; the button says Head light. Not **Light** (the lighting desk), not a **light** (a 3D scene light that belongs to the scene, lit for everyone) and not a **lamp** (a stage fixture): only the visitor who walks sees it. Added 2026-10-28. |
| **scan** | Collecting a **place** with a camera so a space can be built from it — the walk, the photographs, and the measured wall. Opens at `/{space}/scan`. Added 2026-09-22. |
| **mesh** | serverXR's live hub at `/serverXR/mesh`, where every screen and phone in one **group** hears what the others publish on a **channel**. Spoken in Nodes through Mesh In and Mesh Out. The hub's own protocol calls a group a `room`; copy says **group**, because Room is banned copy. Added 2026-10-21. |
| **post** | A short message the share door sends out about a space or a project: words, one link, pictures or a video. A draft until it is approved; then sent to the channels it names. Never a project and never a page. Added 2026-10-21. |
| **share channel** | An outside place a **post** can go: a Telegram channel, Bluesky, Mastodon. Not a release channel (`dev`, `stable`) and not a lighting-desk channel. Where the context is clear, "channel". Added 2026-10-21. |
| **share door** | The part of di.iiii that drafts a post, shows its preview and sends it to the share channels (`serverXR/src/share/`, `di post`). Added 2026-10-21. |
| **wifi door** | The part of an install that opens its door on the wifi for guests, under the install's network name and certificate (`di wifi`, `/api/wifi-door`). Added 2026-10-28. |
| **team** | The members of a space, said as one word where a page has to name them to a guest — the show page's "who may choose: team". Not a role and not a new group: exactly the people the space's scope already lets edit. Added 2026-10-08. |
| **view** | A named camera a project keeps — a button that takes you there. A **live** view is one visitors get; a **work** view stays in the Studio. A project that is a version of a **production** shares its views with every other version. Added 2026-10-13 (decisions 1–3, `docs/ai/decisions/2026-10-13-views-library-words-workflow.md`). |
| **View \| Edit** | The Studio's one switch for what a pull does (owner 2026-10-28). **View**: every pull turns the camera, nothing moves. **Edit**: a pull on the selected thing slides it along the floor. The owner's words on the switch; not the named camera **view** above. In code: the Navigate and Edit tools (`viewportEditMode`). **Mouse in Edit** (Scene → Move): **Pull to move** (default) or **Like Blender** (the 2026-10-12 Edit mouse, kept as a mode; `editMouse.js`). |
| **quality** | The room's one render setting, with two values: **Low** (beams and haze, light enough for a phone) and **High** (the work renderer: shadows, bloom, every lamp a real light). The button shows the quality now in use; its title says what a tap switches to. `?quality=low\|high` in an address. Why these words: the field names a renderer's two presets Low / High (quality presets in games, video players, Blender's render presets); HD / HQ name video formats, not a renderer setting. Owner 2026-10-15 ("Full and Lite do not suit"). Stored values and old links `lite` / `full` are read as `low` / `high`. |
| **render** | What a room is drawn FOR, three values: **Studio** (the building view, every tool — where you make it), **Tech** (the crew's schematic in the live show: only the rig as plain shapes, the floor and the hall outline; no air, no glow, no other objects) and **Show** (the room as the audience and a client see it — the public link, the Studio's Preview, the room page's default). Display → Tech \| Show on the room page; `?render=tech\|show` in an address. Separate from **quality** (what the device can carry). Why these words: the owner's own (2026-10-15 07:0x–07:2x: "Studio work when we create", "the light show" → Tech, "the showcase" → Show); previz and CAD keep a drawing view apart from a rendered view. **Show** here is a way of drawing, not the **show** of a production (the cues in order) — the button sits under Display, never alone. Decision: docs/ai/decisions/2026-10-15-studio-tech-show-render.md. |

| **master clock** | The one loop of beats a project keeps running; every LFO follows it unless it picks another clock. Added 2026-10-14. |
| **clock** | A loop that counts beats at a tempo. A project has one master clock and may add more; the `/light` desk's clock and tap are an optional source for it, not its leader. Added 2026-10-14. |
| **cube group** | A named set of LaserCubes (for example "left", "right") that a graph can address as one. Lives in the project, not in `laser.json`. Added 2026-10-14. |
| **draw mode** | How a laser node draws a shape: outline (its silhouette, the default), wireframe (every edge) or points. Added 2026-10-14. |
| **point budget** | How many points one laser frame may use per cube; set by a wire, an on-screen control or automatically from path length, and never above the server's frame cap. Added 2026-10-14. |

Two words that are already right and must not drift: **port** (where a wire attaches to a node)
and **wire** (what runs between two ports). They are the node model's own vocabulary, they are
used consistently, and every node tool a visitor might arrive from uses one or the other.

## Banned in user-visible strings

| Banned | Because | Use instead |
| --- | --- | --- |
| `Raw` (the lane) | A branch name. Never explained. Already absent from the page it names. | **Nodes** (the node canvas), or nothing at all |
| `Beta` | The lane was deleted 2026-08-06. `src/beta/` does not exist. | — |
| `lane` · `surface` · `V1` · `seed` | Names for editor generations. Internal history. | the thing itself |
| `entity` | ECS jargon, in the sentence the Inspector shows on every selection. | **object** |
| `workspace` | Reads as a bigger or smaller *space*; meant four different things. | **canvas** (the surface) · **space** (the place) · *layout* (Studio's panels) |
| `scene` *(as a project)* | It meant a project, a panel, a URL segment and a beat at once. It now means exactly one thing — the 3D place — so use **project** when you mean the thing you make. | **project** |
| `document` (as a project) | Two meanings 400 lines apart in the wiki. | **project** |
| `page` (as a project) | It is the slot in `/{space}/{slug}`, but the thing there is a project. | **project** |
| `desk` | A metaphor used six times, never defined, colliding with a node label. | say the true thing |
| `chrome` (the UI) | Developer jargon. | **toolbar** |
| `linked space` · `code space` | Implementation notes. A visitor sees a space. | **space** |
| `Universe` | Promised a world, delivered a toolbar switch. | **Kiosk** (see below) |
| `di.i` *(inside the product)* | The studio's signature, not the product's name. Correct on a byline, a deck, thedi.studio; a slip in product copy, which names the product. | **di.iiii** |
| `Lite` · `Full` *(as the room's render quality)* | Two words that did not say what they measure; `Full` also read as "complete". Retired 2026-10-15. The keys `lite` / `full` and old `?quality=lite\|full` links still open, as aliases. | **Low** · **High** (the setting is **Quality**) |

`raw` in its ordinary English sense (*unparsed, unformatted*) is fine in code, but never in a
user-visible string where it can be mistaken for the lane — rewrite those.

## The page is not the changelog

A visitor reads what **is**. Our arrangements for getting there are not user-visible copy.

Keep out of any string a person can read:

- A row, tab, rail or feature that does not work yet — "not open yet", "coming", a greyed
  button. If it does not work, it is not on the page.
- A count of our own progress: "2 of 5 open", "3 of 7 ready".
- Which supplier sits behind something, what it charges, and which ones we turned down.
- Which tier, branch, account or host a thing lives on.
- Why we picked one arrangement over another. That is a decision record; it lives in `docs/`.

**Why.** It publishes our decision-making to people who came for the work, it dates the page
the moment anything changes, and it asks a visitor to care about our logistics. It also ages
badly in public: a row that says "not open yet" is a promise with no date on it.

**Instead:** ship only what works, named by what the person does — *Give once*, *Write to us* —
never by who processes it. When a new arrangement opens it replaces the link behind that verb;
it does not arrive as a new row announcing itself.

Found 2026-09-21 on `/support`, which listed five ways to give of which two worked, named every
payment platform and its fee, and printed "2 of 5 open" in the section heading. Owner: *"why
public need info what kind of fee and platform are there"*.

**Not this rule:** an honest label on a shipped-but-rough feature. `(dev preview)` on the Studio
split buttons stays — stripping those was a regression on 2026-08-21. The difference is that a
label describes what the visitor is about to use; a changelog describes us.

## `platform` — true, but a third-person word

di.iiii **is** a platform, and the word is correct wherever someone is placing it in a
category: the README, a deck, a grant form, an agent-readable `type` field, a section
eyebrow that labels what the section is about. Nothing bans it and no test guards it.

What it must not do is stand in for the name inside di.iiii's own sentences. "A platform
admin", "as the platform grows", "released back to the platform", "the platform's loading
screen" — in every one of those the true subject is **di.iiii**, and the name is shorter,
clearer and unambiguous. A product does not refer to itself by its category; that is what
outsiders do. Swept 2026-08-23: ~25 sentences, zero left.

Where a category genuinely has to appear in a sentence rather than a label, the verb is
cleaner than the noun — **di.iiii — public spaces on the open web** (the line picked
for the front door, the README and the link-preview card; Q2 pick, 2026-10-21, which retired the
older "hosts 3D spaces" wording) — and Terms and Privacy may
use *the Service*, which is the legal convention.

## Node labels settled 2026-08-19

| Type id (unchanged) | Was | Now | Why |
| --- | --- | --- | --- |
| `universe.world` | `World`, and `Scene` inside Studio | **Scene** | One type wearing three names. Scene is what Blender, Unity, Godot and three.js — the engine actually underneath this — all call the 3D place, and what serverXR's own `/api/spaces/:spaceId/scene` calls it. It is also the rare word native to both 3D and theatre. |
| `universe.space` | `Universe` | **Kiosk** | It is not a space and not a universe: it is a container you enter whose one setting hides the editor's furniture for everything inside it. Not "Container": Geo shipped as "the plain container" while this pass was in flight, so two palette entries would have answered to one word — and Geo is the one people should reach for. Kiosk names what only this node does, and is the word its own registry comment already used. |
| `universe.space` input | `Show Chrome` | **Show the toolbar** | |

`universe.desk.2d` / `universe.desk.3d` keep their labels. The ambiguity was the *abstract* desk
in prose; once that is gone, "3D Desk" reads as one concrete thing in a scene, which is what it
is. `universe.desk.2d` is in `UNIMPLEMENTED_NODE_TYPES` and never reaches the palette anyway.

## Do not "fix" these

Flagged by a sweep, deliberately kept:

- **the commons** — a defined concept with its own wiki article, not a stray word.
- **port**, **wire**, **node**, **graph** — the node model's real vocabulary.
- **torus**, **texture**, and the rest of the shape/material names — correct terms of art.
- **sandbox**, **Open Space** — defined in the wiki, and load-bearing in the access model.
- **slug**, **commons**, **inscription** — real product concepts; teach them, don't rename them.

## Deliberate survivors

Three sets of strings still carry a banned word on purpose. They are decisions, not misses —
if you "fix" one of them you will make the product less true, not more.

1. **The V1 space-scene surfaces keep the word `scene`.** `src/hooks/useServerPublishing.js`,
   `useStatusItems.js`, `useSceneApply.js`, `useSceneActions.js` and the admin console's
   Scene Version / Scene Stream rows all describe a real thing: the scene a *space* owns
   directly (`spaces.scene_version`, `serverXR` `scene.json`, `src/shared/sceneSchema.js`),
   which is a different object from a project's document. Calling it a project would be a lie.
   These strings retire when the fossil does — see item 2 below, not before. (Since the
   2026-08-19 second pass they are no longer even a carve-out: `scene` now means the 3D place,
   which is what these strings are talking about.)
2. **Wiki `tags` keep the old words.** Tags are never rendered; `WikiPage.jsx` feeds them only
   into the search haystack. Someone who learned "workspace" or "raw" should still find the
   article that no longer says it. New words are *added* to tags, old ones are not removed.
3. **Wiki article `id`s never change.** `WikiPage.jsx` reads `window.location.hash` as the
   article id, so every id is a live deep link — including `raw-lane`,
   `raw-zen-workspace` and `reading-the-workspace`. Titles moved; ids did not.

## Out of scope for the 2026-08-19 pass

These are architecture, not wording, and each needs its own decision:

1. `/studio` renders a page headed *Spaces*; `/{space}/studio` renders one headed *Projects*.
   Routes are permanent addresses — the same standing `/raw` gets — so no route moved in this
   pass. Fixing it belongs to `docs/architecture/SPEC_url_architecture_and_tree_addressing.md`.
2. The space-owned `scene.json` (`spaces.scene_version`, `src/shared/sceneSchema.js`) is the
   only reason "space" can still honestly mean "a 3D scene". Retiring it is a schema decision.
3. `entities[]` and `nodes[]` are two content models in one document that never reference each
   other. Reconciling them is the load-bearing unknown in the URL spec's §7.

## Amended 2026-09-11 — the studio, the place, and the production

Three words were missing and one was doing two jobs. Settled after four audits of what exists
(every address, every space, every audience, and this project's own written words) and one
judgement over the top of them.

**The studio signs `di.i`. The platform ships `di.iiii`.** `di-brand/NAMING.md` said so on
2026-09-02; this file said "retired" and the guard enforced the retirement, so the two documents
contradicted each other for nine days. This file is the one that was wrong — it governs the
*product*, and inside the product `di.i` really is a slip. Outside it — a byline, the deck,
thedi.studio — `di.i` is the correct and only signature. The guard is unchanged, because it only
ever read `src/`. Applying this file's own rule: an overloaded word is not banned, it is given
exactly one meaning.

**`place` and `production` are new, and `production` is the important one.** The studio makes
work for real rooms — proposal, site check, scan, a virtual copy, then connect it to the real
rig. Nothing in this vocabulary had a noun for that, so the sentence kept being written with
platform words that do not fit: a production is not a space, not a project and not a work. It
uses di.iiii the way a show uses a lighting desk.

**`work` and `project` are one object from two sides** — project backstage, work out front. The
visitor never reads "project"; the operator never needs "work". This also closes the estate's
open question "what is a part?" (`di-atlas/CONCEPTS.md`): the piece met in the wild is a **work**,
made of **scenes**. No new noun.

**Studio, the editing surface, gives the word up.** It becomes **Editor** — the word Unity,
Unreal and Blender all use, and the word MANIFESTO already uses: "the visit is the product; the
editor is backstage." The reason is the section below: "studio" cannot mean the practice, the
domain and a surface inside the product at once, and the practice is the one that cannot rename
itself. Decision recorded here; the UI copy follows in its own change, and `/studio` keeps
answering forever like any printed link.

**The world is `diiii.xyz`.** MANIFESTO's three distances named thedi.studio as the public
distance. The public distance is the platform, and the platform's address is now `diiii.xyz`
(live 2026-09-11). `thedi.studio` is the studio's own address on it — one space, eventually
served under its own domain. `diiii.xyz` is the one public address (owner, 2026-10-21:
"diiii.xyz main public"): every new link, default and page names it. `di-studio.xyz` is the old
address and is to forward to `diiii.xyz`; it is the name printed on the QR in the room and on
the workshop handouts, so it keeps answering, and its job is never to mean anything new again.
`scripts/oldAddress.test.js` fails when new code names it outside its allowlist.

## One open product call

**The creator host must not be named `studio.`** The URL spec (DRAFT, unsigned) proposes
`studio.diiii.xyz` for the authoring host. That would make Studio the name of the entire
authoring side of di.iiii — which is the exact one-word-two-sizes disease this file exists
to cure, and a hostname in every creator's URL bar teaches it harder than any copy can undo.

The ratified direction is the opposite: MANIFESTO §6 states that "Studio's own role is being
drawn into Raw's node model as a container node — one palette entry you enter to find its
subgraph." Ratified beats unsigned, so **Studio is one place inside the product, not the product**. If Stage 0 of the URL spec ever
ships, give the host a name that is not a product noun — `edit.diiii.xyz` — or reopen this.

## Spelling

**British.** `colour`, not `color`, in every sentence a person reads — it was already the 3:1
majority. Code keeps `color` (`bgColor`, CSS, three.js), so a property and its label may differ
by one letter; that is correct, not drift.

## Amended 2026-08-19, same day

The first pass chose **Room** and **Stage**. Both were reversed within hours, on the owner's
call, after asking a plainer question: *which name is professional?*

- **Room → Scene.** Room was chosen because the product's prose already said it. But no 3D tool
  in the world says Room, and the engine underneath is literally `THREE.Scene`. Banning `scene`
  because it was overloaded was the wrong instinct: the professional fix is to give an
  overloaded word back exactly one meaning, not to retire it.
- **Stage → Container → Kiosk.** Stage collided with the deploy tier and with *stage = phase*.
  Container lasted a few hours: Geo landed upstream as "the plain container" mid-pass, which
  would have put two entries in the palette answering to one word. Checked before settling it —
  `universe.space` appears exactly once in all saved work, in a project called `nodetypetest`,
  so the cost of getting this wrong was two strings and the cost of asking was more.

The lesson worth keeping: **a name that reads well in your own copy is not the same as a name
your field already uses.** Check both before settling one.

## The node table — every label, settled (2026-08-20)

The full census, extending the 2026-08-19 label settlements to all 68 registered types.
Rules for labels: bare nouns, no articles, no parentheticals, ≤2 words, British spelling,
the field's own term where the field has one (TouchDesigner, Blender, three.js). Type ids
NEVER change — labels, keywords and prose only.

Changed by this table:
| Type id | Was | Now | Why |
| --- | --- | --- | --- |
| `view.director` | `Director (algovrithm)` | **Director** | The parenthetical was a code pointer, not a name. |
| `math.op` (new) | eight type labels | **Math** | The operator family (2026-09-01). The eight old labels are alive as the operation menu; only the palette entry is new, and it is the field's own word for the card that does arithmetic. |
| `logic.route` (new) | `Gate`, `Switch` | **Route** | Not "Gate" or "Switch" — both are operations ON this card now, and a type wearing one of its own operation names reads as if the other were something else. Not "Logic" either: `logic.combine` already holds that label. |
| `node.null` | `Node` | **Null** | TD's exact term for the blank pass-through primitive; "Node" named it after its whole category. (Still a shell, hidden from the palette.) |

Confirmed as they stand (the census found no better professional word):
- **make**: Cube · Sphere · Plane · Cylinder · Cone · Torus *(the TD-audit geometry wave, 2026-08-20 — primitives the entity system always had, finally spoken as nodes)* · Merge · Array *(shipped 2026-08-20 — repeats what arrives, Count × Offset)* · Transform *(re-frames one copy — Array's sibling)* · Constructor · Text · Browser · Image · QR Code *(2026-10-21 — draws an address as a picture wire)* · Create *(paletteHidden in the node editor — objects belong to Studio)* · Line · Circle *(2026-08-21 — Line is a stroke between two wirable endpoints, drawn as a thin cylinder; Circle is a flat disc facing +Z like Plane; both answer Geometry descriptors so Array and Transform can repeat them)*
- **numbers**: Number · Colour · Vector · Boolean · String · Time · **Math** *(the operator family, 2026-09-01 — one card with an operation menu, wearing the name of the operation it is set to: Add · Subtract · Multiply · Divide · Modulo · Power · Sin · Absolute. Those eight labels survive as OPERATION names, not type names, so nothing a person had learned to read on a card changed)* · Mix · Clamp · **Route** *(Gate and Switch, merged the same day — same menu idea; Gate is the operation it is born in)* · Compare *(stayed its own card: it is wire-first, three boolean outputs, and an operation menu can only answer one question at a time)* · Lag · Noise *(shipped 2026-08-20; Noise's variation input is Variant — "seed" is banned copy)* · Range · Oscillator · Logic · Extremes · Absolute · Round · Ease *(the TD-audit numbers wave, 2026-08-20 — wire-first: Oscillator speaks Sine/Square/Triangle/Saw, Logic answers Both/Either/One/Neither, Ease shapes Smooth/Ease In/Ease Out/Bounce)* · Counter · Hold · Delay · Timer · Trigger · Speed · Toggle *(the state wave — every one remembers through frameMemory and reacts to rising edges)* · Flash Guard *(2026-10-21 — WCAG 2.2 SC 2.3.1, three flashes or below: holds a light or picture value back so no more than three flashes a second pass; Rate and Limited say when it acted; the count is `src/project/nodes/flashRule.js`, shared with the offline flash checks; Limit only goes stricter)* · Cue *(2026-10-21 — the project's cue list as wires: Index, Name, Look, Progress, Fading, Fired out; Go, Back, Jump, Loop in. Where the list is comes from the shared cue clock, `shared/cueClock.cjs`, the same lines the desk's cue runner and the show's clock run)* · Split · Combine · Channels · Compose · Distance · Ramp *(the vector/colour wave — pure taps and joins for the two compound wire types)* · Dot · Cross · Direction · Rotation · Aim · Random *(the second vector wave, 2026-08-21 — Dot's Angle and Rotation's Angle input speak degrees; Aim's output is a rotation ready for any shape's Rotation port; Random is one fixed draw per Variant, Noise is the one that wanders)*
- **the scene**: Scene · Kiosk · Geo · Constructor's siblings 3D Desk / 2D Desk *(deliberate survivors — see the 2026-08-19 note; 3D Desk retires from the palette with the container pass)* · Light *(splits into Light + Environment in the Light pass — reserved below)* · Camera · Background · Grid · In · Out · Studio · Node 0 / Activate Node / Universe Link *(shells, hidden)*
- **watch**: Monitor · Inspector · Outliner · Timeline · Director
- **bring in**: Button · Keyboard *(the operator's hands, 2026-08-20 — the desk's Go and a chosen key; Keyboard ignores keys typed into fields)* · Slider · Pad *(the thumb controls, 2026-10-21 — Button's split: the level every window agrees on is written when the finger lifts, the finger itself is this window's while Held; Slider has Min, Max and a Direction, Pad answers X and Y in -1..1 and springs back to the centre unless Spring back is off)* · Visitor *(what the person's phone or screen is, 2026-10-21 — Phone, Reduced motion, Portrait, Width, Height, Language, Embedded, and a Name, Hue and Id kept in that browser; "visitor" because it describes whoever opens the page, the word this file already uses for them)* · Tilt *(how the phone is tipped, X and Y in -1..1, 2026-10-21; not "Gyro" — the reading is deviceorientation, not the gyroscope's rate)* · Model · Video · Sound *(kept over "Audio": a Sound is a thing standing in the scene, matching Blender's Speaker idea; "audio" is reserved for the analysis outputs coming with the show operators)* · Mesh In *(2026-10-21 — what other screens and phones in the group publish on one channel: Value, From, Time, a Signal count per event, Up, Status; optional Min/Max, Allowed and Max Length checks)* · Webcam · Microphone · MIDI In · OSC In *(REAL since 2026-10-21 — OSC 1.0 heard by this machine's di.iiii at /osc: Address, Value, a rising Signal count, Status)* · DMX In *(2026-10-21 — one channel of the lighting desk's input, 0..1, holding the last value on loss)* · the capture shells (AR Camera, Insta360 Camera, Stereo Camera, RealSense D405, PTZ Camera)
- **send out**: MIDI Out *(REAL since 2026-08-21 — Web MIDI send: Trigger holds the note, a change while held re-strikes, a changed Value goes out as CC; Status answers what it is doing)* · Mesh Out *(2026-10-21 — publishes Value on a channel to the group, at most once per Interval (200 ms by default, 50 ms floor), the latest value winning, only while Up)* · OSC Out *(REAL since 2026-10-21 — one OSC 1.0 message per Value change, Trigger re-sends, through this machine's di.iiii at /osc; Status says when there is no local bridge)* — and the streaming four keep their labels until built
- **agents**: Agent · Keeper · Agent Run · Work Status *(dev-local, low-stakes; renamed only if they ever ship)*

Reserved names — settle NOW so the build waves don't invent their own:
| For | Reserved label | Source |
| --- | --- | --- |
| `world.environment` (Light split) | **Environment** | TD Environment Light; the scene's ambient/directional settings |
| `light.point` (Light split) | **Light** | the lamp you place; the legacy dual-identity `world.light` goes paletteHidden with a non-colliding label decided in that pass |
| streaming four, when built | **Composite · Switch (texture) · Output** · ~~Record~~ **Recorder** (built 2026-10-21, see the amendment below) | TD TOP names; if number-Switch and texture-Switch would meet in one palette, the texture one ships as **Composite**'s sibling and the collision is resolved in that PR, not silently |

Guard: `src/nodeLabelVocabulary.test.js` — labels must carry no banned word, no
parenthetical, no leading article, and stay within two words. The prose guard
(`src/copyVocabulary.test.js`) already covers every string a person reads.

## One name per space (owner, 2026-09-14)

A **space's** own name — its label, set with Rename — is the one name a visitor sees for that
space anywhere in di.iiii's own furniture: the `/spaces` card, the list row, the map star, the
`/{space}/projects` heading, the surface bar, the browser tab, the link preview, and the room's
heading for screen readers and crawlers. A **project's** title shows only where the URL names
that project (`/{space}/p/{project}` or its vanity form). A space that opens straight into one
piece shows no "Project: …" line on its card; an account's own card says "Opens on: …" only when
the door's title differs from the space's name.

What this does not reach: a published page's own content is the artist's. The WCC landing's
"WCC: Women Creating Change" heading and anything inside a page's iframe are the work, not the
furniture. Where a stored name is simply wrong (a space labelled "di.iiii", a door project titled
"Main"), the fix is data, not a code carve-out.

Code: `src/studio/utils/spaceNames.js` (the card rule), `src/hooks/useDocumentTitle.js` (tabs),
`PublicProjectViewer`'s `viewerTitle` (headings). Guards: `spaceNames.test.js`,
`SpaceHub.test.jsx`, `PublicProjectViewer.test.jsx`.

## Amended 2026-09-16 — the tiers are local · dev · prod

The owner, plainly: "we have not staging anymore." The word leaves our language the same way
`Beta` did: the thing it named is still there, under its true name.

| Tier | Is | Address |
| --- | --- | --- |
| **local** | your machine | `http://diiii.localhost/` — this machine's installed di, the same link on every machine (amended 2026-10-07, `docs/ai/one-local-address.md`); dev trees at `http://<tree>.diiii.localhost/` |
| **dev** | the rehearsal server, built from branch `dev` | `https://dev.diiii.xyz` |
| **prod** | the live site, built from branch `main` | `https://diiii.xyz` |

**`staging` is retired from our own words** — prose, docs, comments, log and CLI messages, help
text, copy. Say **the dev tier** or **dev.diiii.xyz** wherever a reader could mistake "dev" for the
branch, `npm run dev`, or a local dev server.

**`staging.di-studio.xyz` is switched off** (2026-09-16: removed from Caddy, DNS record
deleted). The dev tier answers only at `https://dev.diiii.xyz`. No host matcher or allowlist
accepts the old name.

**The identifiers were renamed too**, the same day:

| was | is |
| --- | --- |
| `docker-compose.staging.yml`, project `dii-staging` | `docker-compose.dev.yml`, `dii-dev` (`dii-dev-server-1`) |
| `.github/workflows/deploy-vps-staging.yml` | `deploy-vps-dev.yml` |
| env `STAGING_*`, `VPS_STAGING_*` | `DEV_*`, `VPS_DEV_*` |
| `/opt/di.iiii-staging` | `/opt/di.iiii-dev` |
| image tags `staging`, `staging-<sha>` | `dev`, `dev-<sha>` |
| manifest `tiers.staging`, `deployEnv` `staging`, `--tier staging` | `tiers.dev`, `dev`, `--tier dev` |
| `DI_TOKEN_STAGING` | `DI_TOKEN_DEV` |

A CLI handed `staging` fails with `"staging" is now "dev"` — no silent alias.

Two survivors, both left for the owner to decide: the legacy cPanel pipeline (dead since
2026-07-15 — `publish-cpanel-prebuilt-v2.yml`, `scripts/cpanel-*`, branch `cpanel-staging`) and the
Android package id `xyz.distudio.chat.staging` (changing it makes a new app).

The line in "Amended 2026-08-19, same day" — "Stage collided with the deploy tier" — is history and stays as it was said.
It explains a 2026-08-19 decision; the tier it collided with is now called dev.

## Amended 2026-09-20 — Projection is one name

A newcomer walk found one feature wearing four names: the Tools card said "Projection", the
mapper's own header said "MAPPING", the URL said `/map/`, and the wiki article was "Putting a
space on a wall". None of the four shared a word with the other three, so nobody scanning for
"projector" or "mapper" could find any of them from any of the others.

**Projection is the one name a person reads, everywhere.** The mapper header now says
PROJECTION, not MAPPING; the Tools card already said Projection; the wiki article keeps its
sentence title (a real title says more than a category word) but now opens "Projection opens a
mapping, at …" so the first line ties it to the other two. Routes, ids and CSS classes do not
move — `/map/`, `MapSurface.jsx`, `mapRouting.js`, `createMappingSurface` and the rest stay
exactly as they are, the same rule this whole file has followed since 2026-08-19.

## Amended 2026-09-23 — one name per tool

A stranger's walk (2026-09-22) found the tools wearing two names each, one screen apart: the node
canvas was "Raw" on `/tools` and the local home but "Nodes" in the surface bar, and Projection's
Carry panel said "Mapping" and "Paste a mapping". Owner's words: *"connect all things together
so it's easy to use."*

**The tools are Studio · Nodes · Projection · Light**, everywhere a person picks one. Nodes is
the node canvas; Light is the lighting desk on a local install. `/tools` and the local home now
say Nodes, the local home's desk link says Light (it said "Lights"), and the Carry panel says "Projection as text", "Paste a projection" and "Replace this
projection". Routes, keys and folders stay: `/raw`, `/map`, `/light`, `src/raw/`. The guard
(`src/copyVocabulary.test.js`) now also reads `src/kit/KitPage.jsx` and
`src/landing/LocalHome.jsx`, so "Raw" as a name there fails the build.

Settled since, on 2026-10-13 (see "Amended 2026-10-13" below): the light you place in a scene
stays a light, and **lamp** is the stage fixture. The recommendation written here, that the
object becomes Lamp, was not taken. Studio's "Lights" button and the rig button were not changed
by that amendment, and the guard does not police them.

## Amended 2026-09-22 — `scan`, and the one thing it must never say

A new word, admitted under the rule below because no existing one does its job. **place**
is the real room. **space** is the address. **scan** is the ACT that turns the first into
the second: the walk, the photographs, the measured wall, and the footage they become.
Nothing else in the dictionary names an act of collecting, and "capture" and "record"
already mean smaller things elsewhere in the product.

Owner's words, 2026-09-22: *"create new space and start to scan."*

One thing on that page is forbidden, and it is not a style rule. The ring of 36 marks is
labelled **directions covered** and must never be called *room covered*, *coverage*, or
anything else that implies the hall has been seen. It counts which way the lens has
pointed, and a person can stand still in a doorway, turn on the spot, and fill every mark
having seen almost nothing. Calling that "the room is covered" would be the product
telling somebody their walk is finished when it is not — and they will have left the
building before anyone finds out.

For the same reason the page says a room's size is a **GUESS**, in capitals, until
somebody measures a wall. That is not new wording; it is the guess/measured rule from
`docs/architecture/PLACE.md` reaching the one screen where the person who could fix it is
standing in the room.

## Amended 2026-10-02 — an operator card wears both names

The nodecheck found the palette's **Math** placing a card that read only **Add**, and **Route**
one that read only **Gate**: a person could not find the card they had just picked. The card now
reads **Math · Add**, **Route · Gate** — the palette's name, then the operation — for as long as
the name is the automatic one. A name a person typed reads alone, as before. No word was added;
the two existing ones are both on the card. Code: `getNodeCardTitle` (`src/project/nodeRegistry.js`).

Still open for the owner (no word is settled here, so nothing changed): the family tag **the scene**
sits on Kiosk, Studio, In and Out as well as on the scene's own cards; and **kiosk** names both the
node and the projector appliance in the wiki. The questions are in PR "Nodes: names".

## Amended 2026-10-21 — QR Code

| Word | Its one job |
|---|---|
| **QR Code** | The node that draws an address as a QR code (ISO/IEC 18004) on a picture wire, for a plane, an Image panel or Picture Out. Text left empty encodes this tier's own address, so a project moved between tiers never shows a dead code. "QR" is the standard's own name, kept in capitals; not "barcode", which is the one-dimensional kind. |
| **Correction** (QR Code) | How much of the code may be worn or covered and still read: **L** about 7 %, **M** 15 % (default), **Q** 25 %, **H** 30 %. The standard calls it the error correction level; the port says the one word. |

## Amended 2026-10-14 — the laser nodes (Phase 1 of the laser workflow)

Design: the raw laser workflow decision of 2026-10-14 (lands in docs/ai/decisions with docs PR #933). The rows for **master clock**, **clock**, **cube group**,
**draw mode** and **point budget** live in the dictionary above (docs PR #933); these are the words Phase 1 adds.

| Word | Its one job |
|---|---|
| **Laser Trace** | The node that turns a shape (any geometry wire: a Cube, a Geo, a Merge, an Array) into laser paths, so the laser draws what the viewport shows. Its draw modes: **Outline** (default), **Edges**, **Wireframe**, **Points**. Its views: **Front** and **From a point**. Two words, no parenthesis; "trace" is `laserFrame.cjs`'s own word ("a list of points the scanner traces"). |
| **Laser Merge** | The node that joins two sets of laser paths into one, as Merge joins shapes. Chain it for more. Not "Merge": that card joins shapes. |
| **Laser** (port type) | The wire type laser nodes speak: a set of paths (below). Green on the canvas. Not to be confused with the **Laser** node (`laser.shape`), which keeps its name. |
| **path** (laser) | One unbroken stroke the beam draws, lit all along. A **path set** (frame v2 in code) is what flows between laser nodes; Laser Out turns it into the wire's points, putting the dark moves between paths. Developer word; the card says "Frame". |
| **Auto** (Laser Out's budget) | The point budget sized from the drawn length instead of a number. The checkbox beside Laser Out's Points slider; 0 on the Budget port means the same. |
| **Laser File** | The node (`laser.file`, Phase 9, 2026-10-20) that draws a file as laser paths: an ILDA file (formats 0, 1, 4, 5) or SVG path data, told apart by its bytes. Its File is a project asset. Not "ILDA node" or "SVG node": one node reads both. |
| **Laser Text** | The node (`laser.text`, Phase 9, 2026-10-20) that writes a string as single-stroke laser paths in Hershey Roman Simplex. Not "Text": that card shows text in the scene. |

## Amended 2026-10-21 — Beat and Oscillator v2 (Phase 2 of the laser workflow)

Decision 3 of `docs/ai/decisions/2026-10-14-raw-laser-workflow.md` (owner 2026-10-14): one **master clock** runs, LFOs follow it,
extra **clocks** can be added. The rows for **master clock** and **clock** are in the dictionary above; these are the words Phase 2 adds.

| Word | Its one job |
|---|---|
| **Beat** | The node that is a **clock** (TouchDesigner's Beat CHOP): a tempo in BPM and the moment of beat 0. Outputs Clock, Ramp, Pulse, Count, Beat, Bar, Ramp bar, BPM. Its **Clock** setting is **Master** (the first Beat set to Master is the project's master clock) or **Extra**. Not "Time": that card counts seconds. |
| **Beat Grid** | The node that reads music from a **baked analysis** (beat times and Low/Mid/High bands, `docs/ai/decisions/2026-10-21-beat-bake-method.md`) at a time in the track: Beat, Phase (0..1 to the next beat), Age (seconds since the last), Bar, Count, Pulse, Strong, Low/Mid/High, BPM and a Clock an Oscillator can follow. Never a live analyser, so it can be seeked. Not "Beat": that one is a clock with a typed tempo. |
| **Tempo from** | A Beat's choice of whose tempo it keeps: **This node** (its BPM and its own taps) or **Light desk** (the `/light` desk's clock and tap, an optional source; with no desk answering, the Beat keeps its own). |
| **Clock** (port type) | The wire a Beat's Clock output speaks; wired into an Oscillator's Clock, that Oscillator follows that clock instead of the master. |
| **Beats** (Oscillator) | How many beats of its clock one cycle lasts, ¼ … 64. 0 keeps the cycle in Hz (Frequency), which is what every Oscillator made before Phase 2 does. |
| **Bias** (Oscillator) | Leans the cycle: −1 … 1 moves the half-way point (a triangle's peak, a square's edge) from the middle toward an end; on a square it is the duty. TouchDesigner's word. |
| **Sample & hold** | The wave that holds one random value for a whole cycle and jumps at the next. The `/light` desk calls the same wave **random**. **Random glide** walks from one cycle's value to the next instead of jumping. |

## Amended 2026-10-21 — the Lamp node

| Type id | Label | Its one job |
|---|---|---|
| `light.lamp` (new, the scene) | **Lamp** | One stage lamp — **lamp** in the sense above (a stage fixture) — with its patch, its picture and its DMX in one card. Its **Type** and **Mode** come from the fixture library (`src/rigbuild/types/library/`); **Universe** and **Address** place it. Ports: Dimmer, Colour, Pan, Tilt, Strobe, Zoom; it answers **DMX** (the lamp's bytes, the same the lighting desk sends for it — `shared/lampDmx.cjs`) and **Patch** (where it sits, or why it sends nothing). It stands in the scene with a body and a beam that stops at the first surface. Not **Light**: that card is a 3D scene light joined to nothing on the rig. |

## Amended 2026-10-21 — Recorder and Still (keep what the show looked like)

The owner, 2026-10-21: "yes build all 12" — this is one of the twelve. The reserved word above was
**Record**; the brief named the card **Recorder**, the noun for the thing that records (a verb on a
card reads as a button). Type id unchanged: `stream.recorder`.

| Word | Its one job |
|---|---|
| **Recorder** (`stream.recorder`) | The node that records a picture wire (a Scene's Picture, a Picture Out), and a sound if one is wired, to a WebM file between **Start** and **Stop**. Its outputs: **Recording**, **Seconds**, **Status**, **File**. The file lands in the project's files. |
| **Still** (`stream.still`) | The node that saves one PNG of a picture wire on **Take** (its button, or a rising signal). Outputs **Status** and **File**. |
| **take** | One thing a Recorder or a Still kept: one recording, or one still. Its file is named `<kind>-<source>-<date>`, e.g. `still-scene-2026-10-21T14-03-07.png`, because a project file carries a name and a date and nothing else. |
| **seek** (the clock) | Holding the document clock at one moment so a test browser can cut a project frame-exact: `__seek(t)` (seconds), `__ready`, `__play`. Developer words; no card shows them. |

## Proposed 2026-10-13 — a lighting look, and the Dilijan words (owner's pick, nothing renamed)

The owner, 2026-10-13: the looks (*"the wall"*, *"peak"*) and the Dilijan things get Studio words; he did not pick
them. These are proposals. No string or identifier changes until he does. Plan:
`docs/ai/plans/2026-10-13-connected-workflow-words-versions.md` (b).

**A lighting look — proposed: look.** What the rig shows at one moment: each group's level, colour and aim
(`components.rigLooks.looks[]`). "The wall", "peak", "white cathedral" are looks. A **cue** plays a look, with a fade
and a hold; the **show** is the cues in order.

| Proposed word | Means, and only this | Why |
| --- | --- | --- |
| **look** | One state of the rig, named for what it does to the room. | Already the word on the Cards page, the room's SHOW chip and the Light desk, which has looks as its own content model. |
| **cue** | One step of the show: a look, its fade, its hold. | Already the word of the cue list and of the desk's runner. |
| **show** | The cues in order, played on a clock or a desk. | Already the show page `/{space}/show/…` and the SHOW chip. |

Measured against this (a rough grep count of quoted strings, may include a few identifiers): the Studio's scene
picker says *scene* in 9 strings and *look* in 0, the Scenes deck 21 to 1, the room's cue list 3 to 0, the show page
3 to 0; the Cards page says *look* in 13 and *scene* in 0, the room's look follower 7 and 0. So today the same thing
is a **scene** in the Studio and a **look** on the Cards page and in Light. *Scene* already has one job here — the 3D
place — and a second inside Light (one step of values, beside looks). If the owner keeps *scene* for a look, the
dictionary row for **scene** must change with it, and Light's own *scene* needs another word.

**The Dilijan things — which ones is not settled; two readings, a word for each.** UNVERIFIED which the owner meant.

| Reading | Today | Proposed |
| --- | --- | --- |
| The channel maps the studio's own desk ran on the UPlight rental units at the Sevan festival (Dilijan camp), now in `TESTED_CHANNEL_LISTS` (`src/rigbuild/fixtureTypes.js`, source `SEVAN`) | "TESTED", "the rental unit itself (Sevan festival rig, Dilijan camp, 2026)" | **tested on the unit** — a provenance label, beside *assumed* and *from the datasheet*; never the festival's or the camp's name in a label a visitor of another production reads. |
| The camp's rooms, `/dilijan/team-1` … | the room's own title "TEAM 1" — data in the space, not code (PROGRESS.md) | Not **team**: the dictionary gives *team* one job (a space's members, 2026-10-08). The children's groups want their own word — **crew** is taken by the rig tools (`/{space}/crew/…`); **group** is the plain candidate. |

## Amended 2026-10-13 — lamp and light, one word for each thing

The question (the "one place for a space" program, ledger N585, phase P1): what does a project's
holds line call the fixture placed in a scene, "lamp" or "light"? The owner's answer on
2026-10-13: both words stay, each for its own thing. *"light" = a 3D scene light (sun, point…),
"lamp" = a stage fixture.*

- **lamp**: a stage fixture. In a scene it is a light that carries a fixture: a typed one from
  the rig builder (`components.fixture.type`), or a join to a fixture of the lighting desk
  (`components.fixture.index`).
- **light**: a 3D scene light. In a scene it is a sun, a point, a spot or an ambient light that
  carries no fixture.
- **Light**, with a capital, stays the tool: the lighting desk at `/light/`.

The holds line follows it (`describeProjectLayers`, `src/project/layers.js`): a light that
carries a fixture counts as a lamp, any other light as a light, and an object is neither. Other strings that
name a placed light (Studio's Lights row, the `light.point` row of the node table above) were
not touched by this amendment; a later pass lines them up with these two rows.

## Amended 2026-10-22 — the rules the copy guard enforces

`src/copyVocabulary.test.js` calls these "the dictionary's other rules". Until today the
dictionary held none of them. Each row carries its source.

- **Case** (adopted 2026-10-21, part 2 of spec v2, `one-way-to-show-v2.md:293`; that file lives
  outside the repo, so the rule is copied here): *headlines are lowercase; labels and body text
  are in sentence case; eyebrows are uppercase, drawn by CSS (`text-transform`), never typed in
  capitals in the source.* Names keep their own case (di.iiii, Studio, Art-Net).
- **No exclamation marks** outside the jam (2026-10-21, same brand-words pass, PR #1104).
- **attributes** (2026-10-21): what a look records on the Light desk — everything, intensity,
  colour, position, beam. Not *lane* (banned above).

Not added: **conversation** for a space's chat thread. It needs the owner's yes and has not had
it, so the chat strings ("rooms") stay as they were in `dev` until it does.

## Amended 2026-10-21 — app, game, software

di.g_apptune (`dob-0/di.g_apptune`, the tuner for the apps and games on a machine) needed one word for "the things it
tunes". Owner's words: *"look what is the game, it soft or app, what the difference — lets make it professional that
in future people can use that."*

| Word | Means | Not |
|---|---|---|
| **app** | Any program a person installs and runs on a machine: a game, Blender, TouchDesigner, a browser. The overall word — Steam names every item an app (its *appid*), the Linux desktop names every launcher entry an application (freedesktop Desktop Entry, `Type=Application`, games under `Categories=Game`). | not a di.iiii **tool** (Studio · Nodes · Projection · Light are tools *inside* di.iiii) |
| **game** | An app made to be played. A *type* of app, never a separate thing. In di.iiii the same word names a **project you play**: a project that has rules (see "Amended 2026-10-29"). | not "software", not "title" in copy |
| **creative app** | An app made to create with: Blender, TouchDesigner, a DAW, an editor. | not "creative tool" — **tool** is taken by di.iiii's own tools |
| **software** | Not used in product copy. It means any code at all (drivers, libraries, firmware), wider than what a person runs. | — |
| **settings set** | The values di.g_apptune writes into an app's own settings for one goal (Recommended, Performance, Quality, Yours). | not "profile" (a person has a profile), not "preset" (a game's own word for its menu presets) |

Where it lives in code: di.g_apptune `apps/<source>-<id>.toml` with `type = "game" | "creative" | "app"`
(described in the di.g_apptune repo, dob-0/di.g_apptune, file APP_FILE.md).

## Amended 2026-10-29 — a game is a project you play

Studio games design (`di-studio-games-design.md`, section 7), slice A. Owner's words (ledger N1469): *"1 playlab 2. we need pro
level 3 and 4 your pick"*. Pick 3 was the word for a project you play: **game**, or "a project with rules" with "game" kept for
apps only. The owner left it to the lead; the lead picked **game**. Decision record:
`docs/ai/decisions/2026-10-29-game-is-a-project-you-play.md`.

**game** stays one meaning, the one of 2026-10-21: a *type* of something, never a separate thing. It is a type of app on a
machine, and a type of project in di.iiii: a project you play, because it has rules. A game is made in a space like any project
(the space `playlab` holds the first ones).

| Word | Means | Not |
|---|---|---|
| **Play** (the button) | Run this project as a visitor would, from the Studio or Make. **Stop** returns to editing. Nothing done while playing is saved. | not "Preview", not "Test" in copy |
| **Play panel** | Where a project turns on head light, solid walls, sounds, things you can use, rules, walker and friends. | not "game settings" |
| **play-test** | Playing your own project to try it, then stopping. | — |
| **thing you can use** | An object a visitor can take or open while walking. | not "item", "pickup" |
| **take / open / locked / Use** | The actions on a thing you can use: take it, open it, it is locked until its key is used; **Use** is the button (key E while walking). | — |
| **rules** · **round** · **counter** (on screen) | The rules are what makes a project a game; a round is one play from start to win or end; a counter is a number shown on screen. | not the `signal.counter` node in copy |
| **start point** | Where a visitor appears when play starts. | not "spawn" in copy |
| **walker** | An object that walks the scene by itself: patrol, follow, search. | not "NPC", "AI" |

## The rule for anything new

Before adding a word to the product, check it here. If it is not in the dictionary and not
obviously a term of art, either use an existing word or add a row — and say what job it does
that no existing word does. A word that cannot answer that question is the beginning of the
next audit.
