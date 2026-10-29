## 2026-10-29 — Studio readable and easy to hit (UX audit S09: F021 F023 F036 F087)

- Replaces: Studio literal sizes under 12 px; 11 px close/fold buttons side by side; 0.22-0.38 white greys. Nothing else: windows, Move 1 (golden test untouched), type families and square corners stay. The old values live in git (tag the parent `caa47f3ed`); no behaviour is removed.
- Files: `studio.css`, `studio-space-hub.css`, `StudioFloatingPanel.jsx` (close title), new `studioReadable.test.js`.
- Tests: studio styles/components, styles, a11y lint, move1 golden pass; the new guard failed 7 cases on the old CSS.
- Not done: before/after pictures and `verify:surfaces:mobile` (no browser run in this builder); the 63/71 and 96/99 capture counts are not re-measured; literal sizes in other `src/studio` JSX inline styles untouched.
