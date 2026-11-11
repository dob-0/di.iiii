# feat/deck-lists-drag - the VJ deck: drag a clip, lists for Sources / Clip / Effects

Owner (VJ, 2026-11-10): "make the drag move that we can drag them"; "make sources like list also the other things too".

## Spec built against
- A. `moveClip(deck, from, to)` (tops/vjDeck.js), `{layer, column}` each. Empty target = move, filled = swap. Playing follows the clip: same layer, `active` follows; other layer, old layer stops (or plays the swapped-in clip if that one played), new layer plays only if the clip played, trigger +1 so the engine starts it. Same slot / empty source / out of range returns the SAME deck object.
- B. Grid tiles (VjDeckView): filled tile `draggable`, dataTransfer `application/x-di-deck-clip` = `{layer, column}`. Every slot accepts a drop (clip or source), `.is-drop-target` while hovered, drop calls `write(moveClip(latestDeck.current, from, to))`. Foreign drags (files) are not accepted. Click unchanged.
- C. Sources = always-visible list, one row per source: 4 wired inputs, cameras (useCameras, as before), every video asset (`videoAssets`, as before). Row = kind label + name, one line, scrolls in the panel; draggable with `application/x-di-deck-source` = the clip to make; click puts it in the picked or selected slot (button disabled with no target). Upload row at the top. Region is still named "Add a clip" while an empty slot is picked.
- D. Clip panel: Source / Speed / In / Out / Mode rows. Effects: one row per effect, name button expands its sliders (`hidden` when closed, so labels and `data-midi-target` stay in the DOM); a new effect opens. "+ Add effect" stays a native select fed by `EFFECT_TYPE_IDS` (an existing test reads its options).
- Look: di-brand SYSTEM.md: square corners (`--di-radius`), existing deck tokens only, no new colours; rows `--vj-list-row = max(--vj-control, 28px)`; no new fixed widths, rows ellipsize.

## Not verified
Nothing was looked at in a browser (desktop or phone); 760 px width is by CSS reading only. Real drag with a mouse and touch (HTML5 DnD does not fire on touch) is unchecked.
