# Nodes UI: fill the screen, cards that show their content, joints (2026-10-02)

Owner, 2026-10-02, on the NOPA x MOCT project in Nodes: *"optimize the UI of Raw, also UX — it's too bad
use of the space and hard to work with"*. After the sketches (local `lab/p/nodes-ui-sketch-2026-10-02`,
source di-atlas `decisions/sketches/2026-10-02-nodes-ui.html`): *"all 5 plus the node thing"*. The node
thing is the joints: *"where are the joint places"*.

Measured on his screen (2560 × 1440, scale 1, Zen), project `hayfilm-nopa-2026-10-03`, six nodes:

| # | Now (measured) | Change |
|---|---|---|
| A | cards cover 860 × 340 px of a 2560 × 1250 canvas (~9 %) | on open, fit the view to the scope's cards (reuse the existing fit; it just doesn't run on open). Once per project open, never after the person has panned or zoomed. |
| B | List card reads "7 rows · 3 groups", Text card reads "Content" | a List card shows its first rows under their group headings; a Text card shows its first lines. Then "+ N more". Built on the existing card summary (`nodeCardSummary`), not on `cardPreview` (that is the 3D picture). |
| C | an opened List is a 662 × 563 floating window over the cards; its last group is cut off | List (and Text) open docked on the right at full canvas height. The cards stay visible. Same window system, docked frame. |
| D | each row has ↑ ↓ group-select × (~230 px), the text gets ~280 px and is clipped | the text gets the full row and wraps. One ⋯ button per row opens Move up / Move down / Move to group / Delete. Keyboard: Alt+↑/↓ moves. Existing behaviour and tests are kept, only the controls move. |
| E | the inspector shows `universe.world` under the name | show the type's label ("Scene"), never the id. Lexicon: no identifiers on screen. |
| F | joints are 6 px marks inside "■ Title … Title ■" text rows, so the name shows twice and in/out can't be told apart | joints are 12 px squares on the card edge (inputs left, outputs right), each name labelled once under an IN / OUT heading, in the type colour. While dragging a wire, the joints that `arePortsCompatible` accepts light up and the rest dim. No round shapes (`feedback_no_round_ui`). |

**Not changing:** the top bars, the palette, the colours of the joint types, the node model, ops, routes,
`arePortsCompatible`. The visual language stays as it is (square, mono labels, the same colours). Only
size, placement and what the card shows change.

**Proof required before the PR leaves draft:**
1. Unit tests per change (fit on open runs once; list card preview rows; docked frame; row menu actions
   keep their order semantics; inspector label; joint layout and compatible highlight). Gate on
   `Tests N passed`, N > 0.
2. The same six-node project seen at 2560 × 1340 DPR 1 (his screen), and at 390 × 844 DPR 3 (phone).
   Before and after screenshots with the measured coverage of A and the row text width of D.
3. Browser runs under the shared lock, only below 85 °C, never with SwiftShader.

Order: E (smallest) → A → B → D → C → F (largest, touches the card and the wire drag).
