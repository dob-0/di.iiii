## 2026-09-30 — the version switch, the view bar and the viewer buttons lose their pill shape

- Owner, looking at the MOXIR room: "in design we not use the round things". Four files changed radius `999px` to `2px`: `RigVersionSwitch.jsx`, `SmartViewBar.jsx`, `overlayButtonStyle` in `publicViewerStyles.js`, `ProjectSwitcher.jsx` (its button).
- The rule is now in `docs/ai/golden_rules.md` ("Controls are rectangles") with the list of what is still round: the pill token and its users, the `50%` buttons, the 8-18 px panels. Those are owed, one surface at a time.
- Not seen on a real screen yet: this needs a build and an install before the owner can look.
