## 2026-10-22 — Light v3 step 1.6: Touch colours — a strip on look tiles and the live stage

- Owner asked for one combined Light ("v3"); plan `agent-reports-2026-10-22/light-one/PLAN.md` step 1.6. Written fresh in di.iiii (no code taken from the studio-desk bundle, which has no licence).
- `ui/colour.js` (plain script, no DOM): one colour rule for a lamp, a colour strip per look tile (the look's stored colours; the playing look reads the output frame), and the dots of a live stage on Touch fitted to the box. View only: nothing is sent to the desk. `liveColor` on the Control stage now uses the same rule.
- Seen on the agent screen (phone 390 and wide 1440), scratch desk with six RGB lamps and four looks: `agent-reports-2026-10-22/light-v3/a/shots/`. The "before" pictures hide the new parts by CSS; they are not a second build.
- Owed: the look beside the real lamps (phone on `/light` Touch at the Studio rig); the Control stage's own colours were not re-compared pixel by pixel; the dots are fitted to their bounding box, not the Control stage's absolute view.
