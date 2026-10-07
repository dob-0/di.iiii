# Nodes "look broken": measured audit and fixes (2026-10-02)

Owner, 2026-10-02: *"fix all bugs, do the deep audit, there are no wires and other stuff, nodes look so broken."*
Method: a throwaway local stack on this branch, a private test project per case, and a visible Chromium on the
RTX 3080 (ANGLE Vulkan, renderer string checked) at the owner's screen (2560×1340, DPR 1) and a phone (390×844,
DPR 3). Each page was read by script (wires stored vs drawn, card overlaps, windows covering cards, truncated
labels, errors) and the screenshots were opened. Earlier audits of the same day (nodecheck, node-audit; software
renderer, older code) were re-checked, not trusted.

## Measured before

| project | wires stored / drawn | card overlaps | cards under a window | card share of screen |
|---|---|---|---|---|
| All Nodes Example (113 cards) | 108 / 108 | 53 | 0 | 17 % at 42 % zoom |
| NOPA x MOCT (owner's, a copy) | 0 / 0 | 0 | 1 (Projector room) | 4 % |
| Scene test (8 cards) | 5 / 5 | 2 | 5 | 9 % |
| Scene test, phone | 5 / 5 | — | every card (2 full-width windows) | — |

## What was wrong, and what changed

1. **No wires were possible in NOPA.** Text and List had no output and a Scene took nothing in. Fixed in PR #730.
2. **Cards hid under the next card.** Tall cards outgrew their grid row, so the lower ports and their wires
   vanished. `settleCardStacks` pushes each column down by real card height. Measured after: 0 overlaps.
3. **Number → Cube Size was refused.** One number now fills x, y and z, converted at the link (Blender's float →
   vector).
4. **One click on a wire deleted it** (no hover on a phone). Now a click marks the wire and Remove wire (44 px)
   or Delete removes it (Blender and Unreal: select, then delete).
5. **Empty black preview boxes** on 16 types. They now say what they wait for ("Wire a picture into In", "Wire
   a shape into Geometry", "Place shapes inside ›"), and say nothing when the input is already wired.
6. **Phone: open windows covered the whole canvas.** Only the front window mounts on a narrow screen. Nothing
   is written, and the Windows menu brings the others to the front. The menu hint now names the type, not its id.
7. **Phone: the 44 px Enter door covered the previous column's outputs at low zoom.** It now shows only on the
   selected card.
8. **Image said "No image selected yet." while wired.** It now says "Wired to Source — no picture is arriving
   yet."

## Checked and left as they are (with the reason)

- Wires that go back to the left make an S-loop. That's the bezier every node editor draws (Blender,
  Unreal).
- Port labels are 10 px at 50 % white on black, about 5.3:1 contrast, which passes WCAG AA. They read as small
  because of the fit zoom, which is dob-39's plan A (#729).
- Windows opening over cards on CREATE: placement already avoids every card. NOPA's case was cards added later
  under an open window. Text and List docking on reopen is in #729.
- Phone: one window still takes the lower half. The fit stops at its minimum useful zoom, so the person pans.

## Seen after

All Nodes Example: 0 overlaps on desktop and phone, all 108 wires drawn, every port visible at 100 %. Phone Scene
test: graph visible above the window, no door over any card, the Image's message honest. Tests: `npm run test:raw`
2289/2289 (2 workers).
