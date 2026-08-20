# The numbers wave (TD audit, wave 1 of 5)

## Why

The owner asked for the full TouchDesigner-and-similar audit and to add
what it finds. A six-agent research pass over TD CHOPs/TOPs/SOPs/DATs and
the cross-tool common set produced 105 gaps; re-tiered honestly against
our engine (the descriptor lane is not a mesh engine; Sound already covers
Envelope/Spectrum), the buildable-now set is ~26 nodes over five waves.
This is wave 1: the pure number operators.

## What changed

Seven wire-first nodes, all colocated, all pure:
- **Range** — the remap every show patch needs (From span → To span; no
  clamping — Clamp chains; zero-width span answers To Low).
- **Oscillator** — Sine/Square/Triangle/Saw of one document-clock phase
  (clock-driven, so every window oscillates together); Phase in cycles.
- **Logic** — Both/Either/One/Neither of two booleans, in plain words.
- **Extremes** — Least/Greatest of A and B.
- **Absolute**, **Round** (Nearest/Floor/Ceiling).
- **Ease** — Smooth/Ease In/Ease Out/Bounce of a clamped 0..1 progress.

## Verified

Behaviour unit-proven (remap maths incl. inverted and zero-width spans,
all four waveforms at known phases, the four logic verdicts, ease clamps
and exact bounce landing); example graph wires every one; family count
20→27; full suite 2536/2536; lint at baseline; LOOKED at (screenshot
read): all four new cards with their wire-first ports, triangle→Range→
Sphere radius wired.
