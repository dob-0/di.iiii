## 2026-11-12 — Auto fly is a per-project switch

- Owner (Platina, 11-12): Platina has no Auto fly; turn it off there, keep it for later projects ("in future we will use that").
- `projectMeta.autoFly`: absent = on (every existing project unchanged), `false` = no Auto fly button on the room page or the Studio bar, and `?fly=1` does not start a flight. Helper `autoFlyAllowed(document)` in `src/project/viewport/autoFly.js`.
- Control: Project panel → Identity → "Auto fly button" toggle (writes `setProjectMeta`).
- Both schemas (`src/shared/projectSchema.js`, `shared/projectSchema.cjs`) keep the field only when false, so documents that never touched it stay byte-identical.
- Tests: `src/project/viewport/autoFly.test.js` (switch + both schemas). Browser check on the platina-show copy (headless chromium): on → 1 `[data-autofly]` button, off → 0, off with `?fly=1` → 0 buttons, 0 flight hint.
- Exposure: already changeable per scene (View panel → Exposure slider); owner's yes on the current exposure needed no code.
