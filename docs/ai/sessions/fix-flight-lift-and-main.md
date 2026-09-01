## 2026-09-01 — what the flight lifts, and where /main lands

Both found by a signed-out walk of the whole journey on prod and local, then
reproduced and fixed here. Both are faults in the entry that landed earlier today.

- **The flight smeared when pressed from the footer on a phone.** "Whatever is on
  screen flies" is right, but a closing section is 1918px tall on a 390px phone: pushed
  toward the eye it does not come apart, it draws a wall of clipped display type past
  both edges. `visibleLayers` now skips anything larger than the viewport it is leaving —
  too big to be seen leaving means it stays with the page and fades.
- **The same sentence flew twice.** `.lp-section-inner` contains a `.lp-cta-sub` and both
  are in the lift list, so one sentence was lifted as its own layer and again inside its
  ancestor, then slid apart at two depths. Layers contained by another layer are dropped:
  an ancestor carries its children rather than racing them.
- **`/main` stopped opening the room.** The heal was written when `/` WAS the room, and
  kept working — into a landing page — once `/` became the front door again. A public
  address kept resolving but stopped showing what it had shown for months. It now heals
  to `/?room=1`: the name is still gone from the bar, and the link still arrives in the
  room.

Guards: three cases in `enterFlight.test.js` (oversize, nesting, and the existing
on-screen rule), all watched failing; `RootApp.test.jsx` now asserts the room renders on
`/main` AND that `room=1` is on the healed URL. Verified by pressing the footer door at
390x844 DPR3 before and after — 3 layers with the sentence doubled, then 2 with the
section moving as one block.

### Reported and NOT true

The same walk reported that after the flight the four doors are inert — "cursor default,
click does nothing". They are not. Hovering a ring gives `cursor: pointer` and clicking
navigates; I landed on `/br_id_ge` from the arrival state. The sweep missed the rings,
which is itself the real finding: **the doors are small, unnamed targets**, and a stranger
sweeping that row mostly hits nothing. That is a room defect, not a flight defect, and it
is tracked with the portal-label bug rather than fixed here.
