# GateGlow: alarm-red ring → the gate's own colour (2026-08-24)

Walk mode floats a pulsing ring over the gate entity. It was hardcoded
0xd90000 at y+1.2 — head height, alarm-red, sitting visually AMONG the hub's
colour-coded doors. In a room where hue IS the wayfinding, red means nothing
good. Now: the gate entity's authored appearance colour (fallback warm),
floor-level (y+0.06), calmer pulse (0.2–0.5 opacity). It reads as "you
arrived here", not "something is wrong here".
