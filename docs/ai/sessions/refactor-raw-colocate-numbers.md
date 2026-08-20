# Colocation, group one: time and the maths (plan phase 4)

## What changed

The first migration group leaves the legacy switch: `time` and the nine
`math.*` types now live in `src/project/nodes/<typeId>/runtime.js`, behind
the NODE_RUNTIMES map the dispatcher consults first. Behaviour is verbatim
— Divide and Modulo keep their zero guards, Mix rides the shared
shape-aware helper (now handed to colocated runtimes as `mix`), the Time
comments travelled with the code. The switch shrank by ten cases; TAU
left with its only user.

The registry's authoringOnly guard learned that evaluated types live in
TWO homes — it unions the switch scan with the map keys, so the day the
last case leaves the switch it keeps holding.

Remaining groups, deliberately later: value.* constants (a fall-through
group), geom bodies, panels, room types.

## Verified

Full suite 2531/2531 (every existing runtime test now exercises the
colocated paths — the example graph resolves every wire exactly as
before); anatomy manifest points the ten computes at their folders and
fingerprints them; lint at baseline; no type lives in both homes
(nodeRuntimes.test.js holds it).
