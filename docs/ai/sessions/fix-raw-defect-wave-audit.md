## The defect wave from the 08-21 deep audit — nine verified fixes plus the rename verb

Source: a ten-agent audit (six tool-research scouts, four UI walkers at phone
and desktop size) whose ledger lives outside the repo; every finding below was
re-verified live before and after the fix.

- Placement anti-stack: double-tap placement on a phone clamped every card
  into a ~108px band, stacking new cards on the last one. The clamp stays;
  an occupied spot now walks down (then wraps) until free.
- Node drags clamp like placement — a card could carry its door fully
  off-screen with no way back.
- Tap on empty canvas clears the selection — the phone's only deselect
  (registered synchronously at pointerdown; a quick tap's pointerup beats
  the React effect that attaches the pan listeners).
- Entering the fullscreen room clears the selection: the inspector sheet
  covered 38% of "fullscreen" with an armed Delete floating over the stage.
- .raw-room-exit had NO base style — a 21px default-HTML button as the only
  way out. Styled like its topbar siblings, 44px.
- The all-nodes example now force-fits after insert (new fitSignal prop on
  RawGraphSurface) — 93 of 93 cards in view where before most sat off-screen.
- The palette measures its real box and lifts itself back inside the
  viewport (the JS assumed the list's 280px; the input row made it ~336px).
- Palette rows get the 44px touch minimum the rest of the file enforces.
- A redirected wire drop says so: "Size can't take Number — wired to
  Roughness instead" — the snap-to-nearest-compatible stays, the silence goes.
- RENAME exists: the inspector title is click-to-edit (the schema always
  supported label patches; no surface offered the verb). Help's controls
  list teaches it.
- Zen: a DERIVED empty-canvas default is stored as 'auto-on' and lifts
  itself when the first node lands — the topbar (and its Scene button)
  appear the moment there is a scene to look at. An explicit zen choice is
  never touched. zenMode tests updated to the revised contract.
- Auto-opened windows spread over a 16-slot 2D cascade instead of the 8-slot
  32px staircase that piled three windows into one stack.

## Also in this branch

docs/ai/RESEARCH_METHOD.md — the standing credit-managed research method
(questions first, cheap schema'd scouts, synthesis in the main session,
ledger files, spend stated). The sessions README now warns that land quotes
the note's first heading into CURRENT.md.
