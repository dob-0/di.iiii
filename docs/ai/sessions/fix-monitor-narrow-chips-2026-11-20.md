# 2026-11-20 — Monitor chips stay whole on narrow screens

Another session found words broken mid-word ("refere / nce", "commi / t unkno / wn") in the DEV / PROD / LOCAL strips at 768 px and 390 px after the Monitor look (#1325).

- Cause: #1325 hid the tier meta and sparkline only above 900 px, so narrower screens squeezed the full meta into a 36 px chip.
- Fix: the tier meta and sparkline stay in the hover tip at every width; chip text never breaks inside a chip; on a phone the issue chips and the filter row stay inside the screen.
- Checked: pictures at 1536x864, 768x864, 390x844 (Board and Map), right-edge offenders 0 at each; vitest src/styles + src/components/preferences green (flake in one repo-connect test, passes twice on rerun).
- Not done: real phone, real GPU.
- Lesson: after a CSS change run the whole `src/styles` folder and picture the narrow sizes too, not only the desktop sizes.
