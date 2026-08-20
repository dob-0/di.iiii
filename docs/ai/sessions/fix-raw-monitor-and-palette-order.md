# Monitor untagged; the palette leads with make (plan PRs 1.3 + 1.8)

## What changed

- stream.monitor loses its stale `authoringOnly: true` — the palette called
  the working Monitor "computes nothing yet" (implemented 2026-08-20, tag
  never removed). The widened guard from PR #202's sibling scans RawEditor's
  window branches, so this class of lie now fails tests.
- NODE_FAMILIES declaration order (which IS browse order): make, numbers,
  the scene, watch, bring in, send out, agents — scene atoms first, hardware
  demoted.
- Browse mode leads with NODES: the toolbar-recovery command stays pinned
  first (in zen it is the only way back — the old test's reason stands),
  every other command follows the families. Typing keeps exact/prefix rank.

## Verified

By eye (screenshot read): fresh zen desk palette opens Show the toolbar →
make: Cube, Sphere, Plane, Merge, Constructor, Text…; Monitor row carries no
shell tag. Full suite 2474/2474, lint clean, build/anatomy/wiki green.
