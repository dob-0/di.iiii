## 2026-10-13 — The standard move's review fixes: no jump mid-glide, whole notches, touch, a fixed automatic speed

An Opus review of the standard move (review-move agent, ~/work/agent-reports-2026-10-13/studio-nav/free-move/review-move.md)
found 10 verified defects, 3 high, the worst being the owner's own words: a jump and "not the same speed".

- **A gesture that starts during a glide** no longer jumps: `settleForGesture` froze camera-controls at its GOAL (`stop()`), so
  the rest of the glide happened in one frame (9.0-9.7 m on the 3080). It now freezes where the camera IS; slides and zoom drags
  build on the goal pose and do not settle at all. A turn that starts mid-glide places its point from the goal pose and lets the
  glide finish: the notch is whole (a 13.62 m Shift notch was cut to 3.9 m).
- **Touch** is the standard move too: spreading two fingers 100 px goes one step (the zoom drag's rule), moving them together
  slides at the standard metres per pixel; one finger turns around the placed point. camera-controls' own pinch slowed toward
  the turning point and stopped there (0.74x per pinch; 0.5 mm with "turn where you stand").
- **The automatic speed** is taken per space (kept across tool switches) and fixed once three's loaders are idle (drei's progress
  store); a reading taken while loading is provisional and is taken again at the next gesture start.
- **Flight**: Shift and Alt come from each event's own flags (Walk had swallowed the Shift release: the next flight was 5x);
  the frame time is capped at 0.25 s (below 15 fps the flight was slower); one start and one end per flight (the end was lost
  when W came up before the right button, so the Studio never kept the flown view).
- **Smaller**: a slide clears a double-click focus; a slide whose button release was lost stops at the next move without the
  button, and on blur; Orbit Around Selection's focal offset is cleared at the next turn start (it shifted every later start by
  8.1 m); a second button pressed mid-drag cannot run camera-controls' own slide or zoom (their resting bindings are NONE);
  the slide is a plain translation (camera-controls' truck snapped a turning point the wheel had carried past Inside's boundary:
  a 1 px slide jumped 18 m); the public viewer's Free never sets a radius of Number.EPSILON.
- Tests: src/studio/navigation/standardMove.camera.test.js runs the real camera-controls 2.10.1 through the real hooks (12
  cases, built from the reviewer's harness with the assertions turned to the fixes); the old stop()-based settle test now
  checks a real glide. vitest src/studio + src/project/viewport: 862 passed.
