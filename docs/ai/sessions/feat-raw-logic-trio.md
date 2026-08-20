# The logic trio + the first colocated runtimes (plan 3.3)

## What changed

- `logic.compare` / `logic.gate` / `logic.switch` — the show operators'
  decision nodes, in the numbers family, TD-informed names from the
  vocabulary's reserved table (now claimed there).
- **Compare is wire-first**: no operation menu machinery exists in the
  registry, so instead of inventing an enum it answers with three boolean
  outputs — Less · Equal · Greater. Equal tolerates float dust (1e-9): two
  live numbers are never bit-identical.
- **Gate** passes Value through while Open (default true); closed or bare
  it carries NOTHING — a dead wire, not a zero, so downstream defaults take
  over exactly as if unplugged. `logic.gate.out` joins PASS_THROUGH_PORTS
  with a proving fixture.
- **Switch**: Pick off speaks A, on speaks B; any type passes through.

## The Phase-4 seed

These are the first COLOCATED runtimes: `src/project/nodes/<typeId>/runtime.js`
with `src/project/nodes/index.js` exporting NODE_RUNTIMES. The graph runtime
consults the map BEFORE its legacy type switch; runtimes receive only
`(node, portId, { input, asNumber, context })` and import nothing back, so
the dependency stays one-way. `nodeRuntimes.test.js` holds the law both
ways: no type in both map and switch, every map key implemented and not
authoringOnly (the registry's own switch-scanning guard is blind to the map).

## Verified

Trio behaviour 10/10, allNodesExample gates the three (Compare watches the
sawtooth midpoint, its verdict opens the Gate and flips the Switch), family
count 15→18, full suite green, palette + cards LOOKED at (screenshots read:
search resolves, ports typed and labelled).
