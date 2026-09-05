## 2026-09-01 — thirteen math nodes become one, with a menu

- **The palette's math section went from 13 entries to 6, and logic from 5 to 4, by merging
  the families for real rather than folding them.** `math.op` (label **Math**) carries eight
  operations — Add, Subtract, Multiply, Divide, Modulo, Power, Sin, Absolute — and
  `logic.route` (label **Route**) carries two, Gate and Switch. The operation is a parameter
  on the node (`values.operation`), chosen from a select at the top of the inspector sheet,
  above the ports it decides the meaning of. Ten type ids are gone from the registry:
  `math.add/subtract/multiply/divide/mod/pow/sin/abs`, `logic.gate/switch`.
- **The face is the operation, not the family.** `createNode('math.op')` is born labelled
  "Add"; changing the menu renames the card, so a canvas still reads at a glance instead of
  filling up with cards that all say "Math". A name a person typed themselves is never
  overwritten — `operationLabelPatch` in `nodeRegistry.js` only renames a label that is still
  one of the type's own auto labels, and `RawEditor`'s inspector handler is its one caller.
- **Ports are static; labels and defaults are not.** `getNodeInputs(node)` answers the chosen
  operation's port array — same ids always, so a wire lands in the same place whatever the
  menu says, but Power reads Base/Exponent, Sin's second port reads Unused, and a bare
  Multiply still answers 1 while a bare Add still answers 0. That last part is the whole
  reason the defaults are per-operation: the eight retired types did not share one set, and a
  single static default would have silently changed the answer of every unwired Multiply,
  Divide, Modulo and Power in every saved project.
- Dynamic port SETS were considered and rejected. `RawGraphSurface.jsx`'s `inputPortCenter`
  parks a wire whose port it cannot find on the card's top-left corner (`idx < 0`), so hiding
  B on a unary operation would have made exactly the invisible wire a merge must not create.
  Two ports is few enough to keep and label honestly.

### What stayed out, and why — the two rules

1. **A type with more than one output is already a family.** Extremes answers Least and
   Greatest at once, Round answers three, Compare three, Logic four. One operation can only
   answer one question, so folding them in would have silently dropped a wire the day someone
   had two outputs of one node fed. This codebase chose wire-first families where TD chose a
   menu (the 2026-08-20 "wire the question you mean" comments) — those are not
   one-operation nodes and the owner's complaint does not describe them.
2. **A type whose inputs differ in shape stays out.** Mix takes three ports of type `any`,
   Clamp three, Range five. Forcing them in puts ports on the card that most operations
   ignore. Toggle is out for a third reason: it is a latch with memory between passes, not an
   operation on the values in front of it.

### The migration — real, not a shim

`src/shared/projectSchema.js` and its hand-mirror `shared/projectSchema.cjs` normalize the
old type ids FORWARD at `normalizeProjectNode`, the one funnel every load, every op and the
server's replay pass through. Three moving parts: the type id, the `values` rename (`in`→`a`
for Sin/Absolute, `value`→`a` and `open`→`pick` for Gate), and the wire re-aimed onto the
port that now carries the same value (`migrateEdgeToPort`, applied in `normalizeEdgesList`
and in the `createEdge`/`updateEdge` ops so a stored op log replayed from the beginning
migrates too). Nothing outside those two files knows a retired id.

Proof: `src/project/graph/operatorFamilyMigration.test.js` — 10 cases that load documents
full of old types and assert the graph computes the same values (13, 5, 2.25, 1, 6561; a bare
Multiply of 1; a closed Gate of nothing rather than zero), that every wire keeps its id and
endpoints, that a typed name survives, that an op log replay migrates, and that normalizing
twice is a fixed point. **Watched failing** — 6 of the 10 go red with the type migration
disabled, and the per-operation-defaults cases go red with `getNodeInputs` returning the
static array. `serverXR/src/schemaSync.test.js` gained a legacy fixture plus a direct
assertion on the CJS side; **watched failing** with the mirror's migration disabled (3 red).

### The silent steps, worked by hand

Of the five the workshop map names, three did not apply (these types are `render: 'hidden'`:
no viewport case, no window routing, not active markers, not the room-summon exception). The
ones that did, none of which fail loudly on their own:

- the compute case — ten colocated runtime folders deleted, two written, and
  `src/project/nodes/index.js`'s imports and `NODE_RUNTIMES` map edited by hand.
- `FAMILY_BY_TYPE` — enforced in both directions by `nodeRegistry.test.js`, so this one is
  loud; noted because it is the one that catches you.
- `allNodesExample.js` — 10 `add(...)` lines and 4 `wire(...)` port ids, plus the
  `PASS_THROUGH_PORTS` entry that moved from `logic.gate.out` to `logic.route.out`.
- `src/project/nodes/math.op/runtime.js` uses a lookup, not a `switch`: the node-anatomy
  extractor reads a switch label in a runtime file as a TYPE id, so eight operation labels
  made the anatomy sheet claim this file held eight other types' code. Caught by
  `scripts/nodeAnatomy.test.js`, which is worth knowing before the next merge.

### Left for vector and colour — the recipe, not the work

Not started, deliberately, and the recipe is shorter than it looks — I ran the two rules over
all eleven types (8 `vector.*`, 3 `colour.*`) rather than assuming they would behave like
math.

Rule 1 (more than one output = already a family) removes five outright: `vector.split`
(x/y/z), `colour.split` (five channels), `vector.distance` (Distance **and** Length) and
`vector.dot` (Dot **and** Angle). Rule 2 (different input shape) removes `vector.combine`
(three numbers → vec3), `colour.combine` (three numbers → colour), `colour.ramp` (a position
and three colours) and `vector.rotation` (vector, axis, angle).

What is left is exactly three, and they do fit one card:

| type | inputs | output |
| --- | --- | --- |
| `vector.cross` | `a`, `b` (vec3) | `out` (vec3) |
| `vector.aim` | `from`, `to` (vec3) | `out` (vec3) |
| `vector.direction` | `vector` (vec3) | `out` (vec3) |

So the recipe is a `vector.op` — **Vector** — with three operations, Cross / Aim / Direction,
ports `a` and `b`, Direction leaving `b` Unused exactly as Sin does. The port renames the
migration needs are `from`→`a`, `to`→`b` on Aim and `vector`→`a` on Direction — the same
shape of rename Gate needed, and the same `LEGACY_OPERATOR_PORTS` mechanism handles it
unchanged. Every default is `[0,0,0]`, so unlike math there is no per-operation default to
preserve.

The one thing to settle before building it is whether Cross and Aim belong on one card at
all: both answer a `vec3`, but Aim's is a *rotation* and Cross's is a *direction*, and this
codebase has been careful that a port's meaning is readable from the card. My judgement is
that they do (the family is "two vectors in, one vector out"), but it is a product call, not
an engineering one, and it is worth one sentence from the owner. **Colour has no merge at
all** — its three types share nothing.

Net: 11 types → 9, against math's 18 → 10. That is why this branch spent its time on math
and logic properly instead of taking four families half-way.

Also left open: whether Clamp and Range should later become a `math.fit` with Limit/Remap
operations. They are the same idea (fit a number to a span) with incompatible port names, so
it needs a port design, not just a menu.
