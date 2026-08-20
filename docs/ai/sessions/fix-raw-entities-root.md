# Objects stand at root only; Create leaves the palette (plan PR 1.7)

## What was wrong

document.entities rendered UNSCOPED in every room at every depth — every
object haunted every container's inside. And the Create window (view.library,
family make) sat in the node palette making OBJECTS: things with no card, no
ports, no outliner row, which the node vocabulary cannot describe.

## What changed

- RawViewport renders entities only when scopeId is root (null/undefined) —
  objects have no parent concept; the top room is where they stand.
- view.library gains `paletteHidden: true` (a new class: implemented but not
  offered — distinct from the shells) honoured by listNodeTypes. Existing
  documents with a Create window still render it; the Studio container node
  keeps its interior Create (that is the sanctioned home for objects; its
  guard test now says exactly that).
- all-nodes example drops the Create panel; manual + wiki state the rule.

## Safety check against real data

Scanned today's di-spaces snapshot (git ~/di-spaces, PARTIAL 2026-08-20):
zero projects mix entities and nodes, so no real document relied on the leak.
(VPS DB query was blocked by permissions; the snapshot stands in for it.)

## Verified

By eye (screenshots read): root room shows a legacy box object; inside a Geo
the room is clean of it; palette query "create" returns nothing; an existing
Create window still renders. Full suite 2461/2461, build/anatomy/wiki green.
