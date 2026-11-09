## 2026-11-09 — multi-cursor and controllers spec (draft, nothing built)

- Added `docs/design/multi-cursor-and-controllers.md`: goal, measured facts from one session on the desktop `aylmo`, a seat/slot/level model, three routes to a second cursor, a test plan with pass numbers, and open questions.
- Measured: Hyprland 0.57 on Wayland has one cursor shared by mouse and touchpad. X11 `xinput create-master` exited 0 but made no second pointer in Xvfb or Xephyr; the cause is open. A DualSense shows as 4 input devices.
- Still undone: the real Xorg test on a free VT, the controller-list script, the agent seat, and the level service. No code was written, no live config touched.
