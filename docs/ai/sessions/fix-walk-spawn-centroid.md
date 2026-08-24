# "Look around" walked you into an empty corner (2026-08-25)

The landing page's second CTA drops the visitor into the `main` space in walk
mode. It looked broken — an empty blue grid, one clipped plane at the edge,
none of the gallery you were admiring one click earlier. Screenshot-confirmed
on staging.

Cause, measured against the live document: `main` has **no gate entity and no
`worldState.spawn`**, so the walker started at the world origin. Its 83
entities span x −6..57 / z −38..54 with a centroid at **(20.6, 24.4)** — the
visitor arrived roughly 32m away in a corner. The idle orbit frames the
centroid, which is exactly why the same scene looks full until you click.

Fix: when a space authored neither form of arrival, stand at the content
centroid, backed off along +z by 22% of the scene depth (clamped 6–14m) and
facing into it. Authored gates and spawns are untouched and still win. Pure
helper `centroidSpawn()` exported and unit-tested with the real `main`
numbers.

This is general: every space that never authored an arrival gets it.
