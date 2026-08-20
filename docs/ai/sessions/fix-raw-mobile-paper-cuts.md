# Mobile paper cuts (real-S24 audit, second pass)

## What changed

1. **Palette results scroll under the phone keyboard** — the graph surface
   behind the palette claims touch-action none, and the list (its own
   scroller) never said otherwise, so a fingertip could not scroll the
   results. The list now declares pan-y.
2. **The number edit buffer** — bare live-commit number inputs corrupted
   mid-edit values: Number('') is 0, so clearing a field to retype
   committed 0 under your thumbs. NumberField keeps a draft while focused,
   commits only valid parses, snaps back on blur, selects everything on
   focus (a fresh number replaces, not appends) and Enter closes the
   keyboard. Scalar and vec3 fields both ride it.
3. **Delete above the sheet, not under the banners** — the phone rule used
   to move Delete to the top-right, where Android notification banners
   drop over it and steal the tap (the audit's "dead Delete button"). It
   now rides just above the docked inspector sheet, whose measured height
   the editor already publishes; thumb-reachable, banner-safe.
4. **The Colour swatch tells the truth** — an unset Colour showed a white
   swatch while the cube stood there blue; it now falls back to the
   port's real default.

Room tap-empty deselect (audit paper cut 5) is expected fixed by #210's
gesture work (onPointerMissed now receives the tap) — queued for the
consolidated real-device pass rather than re-coded blind.

## Verified

Buffer contract unit-proven (empty never commits; blur restores); FAB
geometry probed on the phone layout (fabBottom 510 < sheetTop 522) and
LOOKED at — Delete sits above the sheet, material ports visible in card
and inspector. Real-device confirmation of scroll/keyboard behaviour rides
the next staging pass with the S24.
