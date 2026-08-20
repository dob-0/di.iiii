# The state wave (TD audit, wave 2 of 5)

## What changed

Seven remembering operators, all on frameMemory, all edge-driven:
**Counter** (rising edges only — a held button is ONE event), **Hold**
(passes through until sampled, then freezes), **Delay** (answers the past
from a time ring), **Timer** (cued stopwatch: Elapsed/Progress/Done),
**Trigger** (one attack-hold-release envelope per firing, re-fire
restarts), **Speed** (integrates a rate into travel), **Toggle** (the
latch — a held button versus a light switch).

Shared `edge.js`: rising-edge detection over frameMemory whose transition
fires on the FIRST evaluation after the flip — which also makes
multi-output nodes safe: the first port's compute consumes the edge, the
same pass's other ports read the settled state. The temporal four (Delay,
Timer, Trigger, Speed) joined CLOCK_DRIVEN_TYPE_IDS; the edge three cost
nothing at rest.

## Verified

Edge-only counting, hold-then-freeze, timer restart + progress + done,
the exact envelope shape at five moments, dt integration with a same-now
no-op, latch flips, and the delay ring answering the past — all
unit-proven. Family count 27→34; full suite 2542/2542; lint at baseline.
