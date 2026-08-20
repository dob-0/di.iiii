# Array (plan 3.5)

## What changed

`geom.array` — **Array**, make family, the reserved name claimed. A pure
descriptor transform: repeats what arrives as Count copies, each wrapped in
a transform group offset by i × Offset, so the copy's internal frames stay
intact. Copies ALIAS the source descriptor (the tree is walked pure, never
mutated). Count clamps to MAX_GEOMETRY_PIECES; the renderer's prune still
holds the real budget across the whole tree. Bare — or fed a non-geometry —
it honestly carries nothing: `geom.array.out` joins PASS_THROUGH_PORTS with
a proving fixture. Colocated runtime; helpers gained asVec3.

## Verified

Copy placement maths, aliasing, count clamp (0→1, 99999→256), junk-fed
dead; example graph gains Array fed by the cube's geometry; full suite
2515/2515; lint at baseline; canvas LOOKED at (screenshot read: the wired
pair, typed ports, inspector fields).
