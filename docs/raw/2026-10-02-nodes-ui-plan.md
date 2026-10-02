# Nodes UI: fill the screen, cards that show their content, joints (2026-10-02)

Owner, 2026-10-02, on the NOPA x MOCT project in Nodes: *"optimize the UI of Raw, also UX — it's too bad
use of the space and hard to work with"*. After the sketches (local `lab/p/nodes-ui-sketch-2026-10-02`,
source di-atlas `decisions/sketches/2026-10-02-nodes-ui.html`): *"all 5 plus the node thing"*. The node
thing, after a first wrong reading (joint visuals), is: *"a scene can have the inputs … connected things there, objects for example, or some other info, and things which can be in the scene in future"*.

Measured on his screen (2560 × 1440, scale 1, Zen), project `hayfilm-nopa-2026-10-03`, six nodes:

| # | Now (measured) | Change |
|---|---|---|
| A | cards cover 860 × 340 px of a 2560 × 1250 canvas (~9 %) | on open, fit the view to the scope's cards (reuse the existing fit; it just doesn't run on open). Once per project open, never after the person has panned or zoomed. |
| B | List card reads "7 rows · 3 groups", Text card reads "Content" | a List card shows its first rows under their group headings; a Text card shows its first lines. Then "+ N more". Built on the existing card summary (`nodeCardSummary`), not on `cardPreview` (that is the 3D picture). |
| C | an opened List is a 662 × 563 floating window over the cards; its last group is cut off | List (and Text) open docked on the right at full canvas height. The cards stay visible. Same window system, docked frame. |
| D | each row has ↑ ↓ group-select × (~230 px), the text gets ~280 px and is clipped | the text gets the full row and wraps. One ⋯ button per row opens Move up / Move down / Move to group / Delete. Keyboard: Alt+↑/↓ moves. Existing behaviour and tests are kept, only the controls move. |
| E | the inspector shows `universe.world` under the name | show the type's label ("Scene"), never the id. Lexicon: no identifiers on screen. |
| F | a stage Scene takes nothing in. Gear and people are rows in two lists | **owner's "node thing" (10-02): a Scene takes INPUTS**. Things are connected into the stage it belongs to. The mechanism exists: In doors (`port.in` with `parentId` = the Scene) become inputs on the Scene card (`getNodeInputs` → `doorwaysInside`). **New:** a **Gear** node (name, already there / we bring, stage) and a **Person** node (name, role, contact), each with one output a stage door can take. Owner 10-02: *"we need A–E mixed with F"*, so F is in the same build. Fields as sketched (Gear: name · already there / we bring · stage; Person: name · role · contact), stored so more can be added later. B shows a Gear/Person card's fields. C docks their editor. A Scene card lists its inputs (E: by name, never a code). |

**Not changing:** the top bars, the palette, the colours of the joint types, the node model, ops, routes,
`arePortsCompatible`, the In/Out doors. The visual language stays as it is (square, mono labels, the same colours). Only
size, placement and what the card shows change.

**Proof required before the PR leaves draft:**
1. Unit tests per change (fit on open runs once; list card preview rows; docked frame; row menu actions
   keep their order semantics; inspector label; Gear/Person nodes and their doors). Gate on
   `Tests N passed`, N > 0.
2. The same six-node project seen at 2560 × 1340 DPR 1 (his screen), and at 390 × 844 DPR 3 (phone).
   Before and after screenshots with the measured coverage of A and the row text width of D.
3. Browser runs under the shared lock, only below 85 °C, never with SwiftShader.

Order: E → A → F (Gear + Person nodes, doors on the stage Scenes) → B (cards show content, Gear/Person included) → D → C. Then the NOPA project is rebuilt with it: each gear item and person wired into its stage.
