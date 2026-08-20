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
| **di.iiii** | The platform. The whole thing. |

Two words that are already right and must not drift: **port** (where a wire attaches to a node)
and **wire** (what runs between two ports). They are the node model's own vocabulary, they are
used consistently, and every node tool a visitor might arrive from uses one or the other.

## Banned in user-visible strings

| Banned | Because | Use instead |
| --- | --- | --- |
| `Raw` (the lane) | A branch name. Never explained. Already absent from the page it names. | *the node editor*, or nothing at all |
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
| `di.i` | The retired name. | **di.iiii** |

`raw` in its ordinary English sense (*unparsed, unformatted*) is fine in code, but never in a
user-visible string where it can be mistaken for the lane — rewrite those.

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

## One open product call

**The creator host must not be named `studio.`** The URL spec (DRAFT, unsigned) proposes
`studio.di-studio.xyz` for the authoring host. That would make Studio the name of the entire
authoring side of the platform — which is the exact one-word-two-sizes disease this file exists
to cure, and a hostname in every creator's URL bar teaches it harder than any copy can undo.

The ratified direction is the opposite: MANIFESTO §6 states that "Studio's own role is being
drawn into Raw's node model as a container node — one palette entry you enter to find its
subgraph." Ratified beats unsigned, so **Studio is one place inside the product, not the product**. If Stage 0 of the URL spec ever
ships, give the host a name that is not a product noun — `edit.di-studio.xyz` — or reopen this.

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
| `node.null` | `Node` | **Null** | TD's exact term for the blank pass-through primitive; "Node" named it after its whole category. (Still a shell, hidden from the palette.) |

Confirmed as they stand (the census found no better professional word):
- **make**: Cube · Sphere · Plane · Merge · Array *(shipped 2026-08-20 — repeats what arrives, Count × Offset)* · Constructor · Text · Browser · Image · Create *(paletteHidden in the node editor — objects belong to Studio)*
- **numbers**: Number · Colour · Vector · Boolean · String · Time · Add · Subtract · Multiply · Divide · Modulo · Power · Sin · Mix · Clamp · Compare · Gate · Switch *(the logic trio, shipped 2026-08-20 — Compare is wire-first: three boolean outputs, no operation menu)* · Lag · Noise *(shipped 2026-08-20; Noise's variation input is Variant — "seed" is banned copy)* · Range · Oscillator · Logic · Extremes · Absolute · Round · Ease *(the TD-audit numbers wave, 2026-08-20 — wire-first: Oscillator speaks Sine/Square/Triangle/Saw, Logic answers Both/Either/One/Neither, Ease shapes Smooth/Ease In/Ease Out/Bounce)*
- **the scene**: Scene · Kiosk · Geo · Constructor's siblings 3D Desk / 2D Desk *(deliberate survivors — see the 2026-08-19 note; 3D Desk retires from the palette with the container pass)* · Light *(splits into Light + Environment in the Light pass — reserved below)* · Camera · Background · Grid · In · Out · Studio · Node 0 / Activate Node / Universe Link *(shells, hidden)*
- **watch**: Monitor · Inspector · Outliner · Timeline · Director
- **bring in**: Model · Video · Sound *(kept over "Audio": a Sound is a thing standing in the scene, matching Blender's Speaker idea; "audio" is reserved for the analysis outputs coming with the show operators)* · Webcam · Microphone · MIDI In · the capture shells (AR Camera, Insta360 Camera, Stereo Camera, RealSense D405, OSC In, PTZ Camera)
- **send out** *(all shells today)*: MIDI Out · OSC Out — and the streaming four keep their labels until built
- **agents**: Agent · Keeper · Agent Run · Work Status *(dev-local, low-stakes; renamed only if they ever ship)*

Reserved names — settle NOW so the build waves don't invent their own:
| For | Reserved label | Source |
| --- | --- | --- |
| `world.environment` (Light split) | **Environment** | TD Environment Light; the scene's ambient/directional settings |
| `light.point` (Light split) | **Light** | the lamp you place; the legacy dual-identity `world.light` goes paletteHidden with a non-colliding label decided in that pass |
| streaming four, when built | **Composite · Switch (texture) · Output · Record** | TD TOP names; if number-Switch and texture-Switch would meet in one palette, the texture one ships as **Composite**'s sibling and the collision is resolved in that PR, not silently |

Guard: `src/nodeLabelVocabulary.test.js` — labels must carry no banned word, no
parenthetical, no leading article, and stay within two words. The prose guard
(`src/copyVocabulary.test.js`) already covers every string a person reads.

## The rule for anything new

Before adding a word to the product, check it here. If it is not in the dictionary and not
obviously a term of art, either use an existing word or add a row — and say what job it does
that no existing word does. A word that cannot answer that question is the beginning of the
next audit.
