# GeometryPieces: pure walk, no shared budget (plan PR 1.4)

## What was wrong

GeometryPieces carried one shared mutable countdown through recursion —
self-documented as safe only while R3F v8 keeps StrictMode out of the
Canvas. The R3F v9 upgrade would silently halve the piece cap in dev via
double-invoked renders.

## What changed

New pure `pruneGeometryDescriptor(descriptor, {maxPieces, maxDepth})` in
geometryDescriptor.js — returns a tree already inside the caps (leaves
counted across sibling branches, exactly the old walk's accounting).
GeometryPieces renders the pruned tree with no budget of its own; a
double-invoked render prunes twice to the same tree (idempotence tested).

## Verified

Unit tests: cross-branch cap, depth cap, idempotence, transform-preserving
prune, non-geometry → null. By eye on the local build: a Constructor wearing
cube+sphere through a Merge renders exactly as before (screenshot read).
Full suite 2441/2441, lint clean, build, anatomy current.
