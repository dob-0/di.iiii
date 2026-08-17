## 2026-08-18 — the owed source.mic look: the probe was reading the meter's track, not its fill

- `npm run verify:capture` on Linux (aylmo), the one real-browser look CURRENT.md still
  owed. First run: webcam OK, mic FAIL (flat) — same signature as the suspended-AudioContext
  class the script hunts. A raw getUserMedia+analyser probe against the same page showed the
  fake device delivering varying signal, so the app was suspect — until an A/B isolated it:
  the meter moves fine with the app untouched.
- The actual bug was in the probe: `[class*="mic"][class*="meter"]` also matches
  `.raw-mic-panel-meter` — the TRACK, which precedes the fill in DOM order — so `.first()`
  sampled an element whose transform is `none` forever. The selector now targets the fill.
  source.mic verified moving: 25/25 distinct scaleX samples, screenshots looked at.
- Kept a hardening in `useMicCapture` anyway: the AudioContext is created in getUserMedia's
  continuation — outside any gesture call stack — so on a gestureless mount (a restored
  workspace, an embed) Chrome starts it suspended and the meter reads silence while status
  says active. The hook now resumes immediately and, failing that, on the next
  pointerdown/keydown, detaching once running. Palette-placed nodes were never affected
  (sticky activation from the double-click), which is why verify:capture couldn't see it.
- Not done: nothing pushed to staging; this branch waits behind the #151 merge freeze.
