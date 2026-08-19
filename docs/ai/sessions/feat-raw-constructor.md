## 2026-08-19 — the Constructor: a node made of nodes

Depth 3 of the owner's "we all have as a constructor", and the last of the three
he asked for. A new container, `geom.constructor` (label **Constructor** — his
word), that WEARS whatever shape the nodes inside it build: enter it, place
shapes, wire them (through Merge if several) into an Out door, walk out — it
stands in the room being that shape. Its inside is its definition; its outside
is the result.

- **Geometry is a value now.** Plain descriptors (`geometryDescriptor.js`:
  box/sphere/plane/group, position/rotation/colour carried along) — not THREE
  objects, so evaluation stays pure and a descriptor asserts in a unit test with
  no WebGL in sight. The `geometry` port type, declared in PORT_TYPES since the
  beginning and carried by nothing, finally carries something.
- Cube, Sphere and Plane gained a `Geometry` output, computed through
  `evaluateNodeInput` so a wired colour colours the descriptor too — the cube
  standing in the room and the cube travelling down a wire cannot be two
  different cubes wearing one name.
- `shape.merge` (two geometry wires in, one out, chained for more). An unwired
  Merge carries NOTHING, deliberately distinct from an empty group that would
  draw as an invisible something — which forced a third category into the
  all-nodes example's liveness model: `PASS_THROUGH_PORTS`, held in both
  directions (dead bare AND provably alive once fed, one proving fixture per
  entry, an entry without a proof fails).
- **The inside is a workshop, not a room**: a constructor's parts are not drawn
  as standing objects in the outer room — only what reaches a door is drawn
  (childMap suppression in RawViewport, same split TouchDesigner draws between
  a COMP's network and its output). Watched red without the rule: four sphere
  renders for a two-sphere snowman, worn AND standing. Standing INSIDE it, the
  parts render as objects again — that is what you are there to arrange.
- No door wired → a violet wireframe placeholder in the geometry port's own
  hue: "shape goes here". No schema change anywhere — doorways, edges and
  containers already carried everything this needed.
- Caps: 256 pieces, 16 levels (`MAX_GEOMETRY_*`), one shared budget across the
  renderer walk so branch-by-branch caps cannot multiply past the total.
- The anatomy manifest resynced through its own day-old gate
  (`docs:anatomy:sync`), all ten semantic assertions holding over the new cases
  — the first proof the gate does what it was built for. `formatPortValue`
  learned to describe a descriptor ("a shape — 3 pieces") after the sheet was
  SEEN calling a snowman "something this sheet cannot read".

### Verified

Seen at 1440×900: a three-part snowman (two spheres + an orange nose cube, two
chained Merges, one door) standing in the room next to the violet placeholder of
an empty Constructor, with the loose parts correctly absent from the room;
inside it, the definition reading as a graph; the sheet answering "It holds 6
nodes. You are standing in them." No console errors. An adversarial review
workflow (four lenses, refute-by-default verification) ran over the full diff
before push; its confirmed findings were fixed in this same change.

### The review's confirmed findings, and what happened to each

Eleven confirmed (four lenses, refute-by-default verification, most proved by
EXECUTION against the real runtime). Fixed in this change: the merge-chain
depth-cap defect (17 hand-placed parts silently dropped the first two — bare
groups now splice instead of nest, guarded by a 20-part chain test); feedback
loops now poisoned whole so every surface answers "wears nothing"
deterministically in every ask order (was: first evaluator won, viewport and
sheet contradicted each other on screen); the wiki's impossible wire (clock →
Size is number → vec3; now clock's Sin → Sphere's Radius); the nesting sentence
(requires standing inside, now says so); the sheet's slot-3 sentence
contradicting slot 2 on a Constructor; the legacy unscoped viewport drawing
parts AND result; the stale "used by nothing" registry comment; and both
PASS_THROUGH gate holes (existence check now covers the list; proofs return the
setup and the test evaluates the claimed port itself).

DEFERRED, deliberately: a part selected inside a container stays selected after
walking out — the Delete FAB stays armed for a node no longer on screen. Real,
but a pre-existing behaviour of every container (a World's children do the
same), not introduced here; fixing it belongs to selection/scope plumbing, not
to this change. REFUTED and left: the StrictMode double-render halving the
piece budget — R3F v8 hardcodes strictness off inside its own reconciler root,
so the mutation cannot double-fire today; a comment at the budget records that
an R3F v9 upgrade flips exactly that switch.

### Still true, and said out loud

- A worn shape carries colour but not textures or files; Model/Video/Sound give
  no Geometry out. Stated in the wiki article's limits paragraph.
- Depth 3 does not retire depth 2: a Cube is still made of code, and its sheet
  still shows that code. The set of code-made things shrinking further —
  built-ins REDEFINED as constructor graphs — is the long-term direction
  `CONTAINER_TYPE_IDS`' comment records, not this change.
