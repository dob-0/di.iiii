## 2026-10-13 — Multi-touch edge cases of the standard move's two-finger gesture

Branch `test/standard-move-touch-2026-10-13`, from `fix/standard-move-review-2026-10-13`. Seven tests added to
`src/studio/navigation/standardMove.camera.test.js` (real camera-controls 2.10.1, real hooks); the touch code in
`useCameraNavigation.js` fixed where they went red.

- **Defects found (red first, 3 of 7 tests, confirmed by stashing the fix):**
  1. A third finger landing, then lifting, left the pinch baseline from before the third finger. The next move of the pair was
     measured against that stale baseline: a 1-step (2.72 m) jump with the fingers still.
  2. The pair's first finger lifting under a third finger left the pair as the *other* two fingers measured against the old
     pair: a 9.3 m jump with nobody moving.
  3. Any touch `pointermove` ended a right-button flight (`onPointerMoveFly` read `buttons & 2 === 0` on a touch event).
  Fix: the baseline is re-taken whenever the touch set changes and it is a pair (down and up); touch moves no longer reach the
  flight check.
- **Passed without a fix:** one finger lifting mid-pinch then landing again; `pointercancel` (same path as up); a pinch while a
  mouse slide is held; a one-finger turn then a second finger (turn stops, pinch is only a pinch).
- **Note on `controlstart`/`controlend`:** camera-controls itself fires `controlstart` per finger down but `controlend` once at
  the last lift, so with two fingers its own events are unbalanced by design. The tests count only the hook's own events (those
  carrying `originalEvent`). Consumers in the repo only listen to `controlstart`.
- **Validation:** `npx vitest run src/studio/navigation` — see the run recorded at push. UNVERIFIED: real touch hardware / a
  phone browser; this is jsdom with synthetic pointer events (pointer `buttons` set to 1 on touch moves as browsers do).
