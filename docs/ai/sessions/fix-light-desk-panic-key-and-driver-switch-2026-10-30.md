## Light desk: panic key, go-live arm, driver switch, MIDI pad (audit rows 14–17, 2026-10-30)
- B and the MIDI blackout pad send blackout:true only; B ignores auto-repeat (`ui/panicKeys.js`).
- The go-live arm survives the poll, ignores a press within 400 ms and names driver and port.
- Driver radios set a pending choice; a "Switch to <driver>" button posts it, confirmed while output is on.
- Tests: `panicKeys.test.js`; not tested: the live Mac, a real MIDI pad, no browser run.
