# Light and Environment — the split (plan PR 2.4)

## What was wrong

world.light was two things wearing one name: per-scope ambient/directional
settings AND a placeable lamp, deciding which by whether it had a parent —
and BOTH at once inside a container. Unparented at root it drew nothing.

## What changed

- New `world.environment` "Environment" (TD Environment Light): the scene's
  settings only — ambient wash + one sun (British labels: Ambient Colour,
  Sun Colour/Intensity/Position). Hidden render, ●-scoped.
- New `light.point` "Light": the lamp only — a real point light standing
  wherever it is placed, ROOT INCLUDED (the disappearing act is over).
- `world.light` goes paletteHidden with both behaviours untouched — every
  existing document renders exactly as it did (fixture + screenshot proven);
  its port labels go British on the way.
- Read side: `resolveSceneLighting(document, graphContext, {scopeId})` in
  viewportWorldState.js — active Environment wins, legacy light drives when
  no Environment exists, null keeps callers' worldState fallbacks.
- ACTIVE_MARKER_TYPE_IDS gains world.environment; all-nodes example places
  Environment + a lamp and wires the breathing-intensity chain into
  Environment; wiki + manual teach the split.

## Verified

By eye (screenshots read): a lamp at root washes a cube's face warm against
a near-black Environment (theatre practical, three nodes); a legacy dual
Light document renders pixel-identical to before. Unit: env beats legacy
beats null; lamp renders at root; legacy unparented still draws nothing.
Full suite 2486/2486, lint clean, build/anatomy/wiki/docs green.
