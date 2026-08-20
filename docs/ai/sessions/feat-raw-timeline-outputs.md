# The Timeline learns to run (plan 3.9, minimal cues)

## What changed

- `view.timeline` gains its first REAL outputs — **Playhead** (frames — clips
  are integer frames throughout) and **Playing** (boolean). The dead-port
  rule that stripped its ports holds: these ship together with the runtime
  that computes them.
- **The transport lives in node.values** (playing / playheadFrame /
  playFromFrame / playStartClockMs) and derives from the DOCUMENT clock:
  playing, the head is `playFromFrame + (clockNow − playStartClockMs) × fps`
  — every window and /out compute the same frame from the same press.
  Pressing Play stamps the show clock if nothing had yet.
- Panel: a Play/Pause button in the bar; the readout and marker follow the
  derived head; a finished scrub WRITES where the show stands (paused → the
  standing frame; playing → re-anchors the run from the scrubbed frame).
  Clip-add and razor act at the visible head.
- The rAF gate arms per-NODE for the timeline: a PLAYING timeline is
  clock-driven, a paused one costs nothing.
- Full keyframe engine stays out, per the plan.

## Verified

Runtime paused/playing/skew-guard unit-proven; gate arms only for playing;
panel transport tests (Play anchors through values, Pause writes the frame
back, no writer → no button); full suite 2529/2529; lint at baseline. SEEN
(screenshots read): Play pressed on the local build — the readout runs, the
marker crosses the clip, the card carries Playhead + Playing, and the
document stamped its show clock.
