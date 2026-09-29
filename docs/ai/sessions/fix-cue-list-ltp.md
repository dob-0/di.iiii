# fix/cue-list-ltp — a cue that puts a lamp out puts it out (2026-09-30)

Reported by the cut's session (`feat-moxir-the-cut.md`): MOXIR Minimal's 6 X PARs (UP-PL5403,
8ch-assumed) drawn lit in "Red room" and "One shaft" though the desk's looks give them dimmer 0.
Suspect named then: the room ignores their dimmer channel.

## Cause (measured, not guessed)

- The room was right. `dmxDecode` with dimmer 0 gives level 0 (its own tests).
- The wire was wrong. On the owner's install (0.4.16-rigbuilder.9), `/light/api/dmx` sampled every
  5 s over one loop: U1.101 (X 1) carried the same dimmer as U1.201 (a bridge PAR) in every cue,
  whatever the look said (for example, one shaft, look dimmer 0 → wire 73/48/14).
- Why: every patched fixture stores `dimmer 255, r/g/b 255` (`ROLE_DEFAULTS`: a new patch lights),
  and the cue layer was created HTP (`sanitizeLayer`'s default), so intensity was
  `max(stored 255, look 0)`. Every PL5403 sat at one level per cue, as the visualiser report said.
- Separately (data, not changed here): that desk has `fx` pulse enabled (120 bpm, depth 255), which
  scales every lamp. It is the moxir space's desk state, left for the owner's call.

## Fix

`fireLook` sets `merge: 'ltp'` on the cue layer on every fire. That is a console's cue-list rule:
ETC Eos Family help, "Cue List Properties", says cue lists are LTP for intensity by default and
submasters are HTP. Layers raised by hand keep their own merge. Doc: LIGHTING_DESK.md "The cue runner".
Guard: `test-cues.js` (seen red without the fix: `255 !== 0`). Lighting + mirror suites 58/58.
