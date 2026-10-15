## 2026-10-15 — land the MOXIR show branch (second landing) on dev

- What landed: `feat/moxir-v2-10-forty-2026-10-15` (head 15884865) merged `--no-ff` onto `origin/dev`: #972 room page draws through the Studio viewport, #978 U-Plus device charts, #979 room page starts whole (Cut off by default), the buildLook parity fixture.
- Conflict: only `docs/ai/known-fixes.md` (both sides appended table rows); all rows kept.
- Left out on purpose: the generated `scripts/place/rigs/*.laser-frames.json` (3.8 MB; regenerate with `laser_frames.py`).
- First landing: PR #971, session note `land-moxir-v2-11-to-dev-2026-10-15.md`.
- Fix: `scripts/place/fixtures.test.js` still expected the B380F `dmx_order` basis TESTED; the show branch's data marks the 10-09 walk map ARCHIVED (owner 10-15), so the test now accepts ARCHIVED and expects it there. It failed on the show branch itself too.
- Checks: vitest 11095 passed / 4 failed on the first full run (2 fixtures = fixed above; `followIntegration` and `lighting` "a cue whose look is not on the desk…" passed alone, load flakes); lint ok; build ok; docs:ai:check ok. Stale node_modules (missing `uqr`) caused a first 203 false failures; fixed with `npm ci` in root and serverXR.
