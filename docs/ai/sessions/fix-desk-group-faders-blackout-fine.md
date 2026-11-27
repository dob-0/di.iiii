## 2026-11-27 — desk group faders dim over a running look; 16-bit fine dimmer follows blackout

- Group faders wrote the lamp's stored dimmer, which a running look overrides, so they did nothing (owner N7670). They now set a per-lamp sub level multiplied after the look, like the master.
- A 16-bit dimmer's fine byte passed through unscaled, so a blackout left coarse 0 + fine N lit (119 channels on the back bars, N7671). The fine byte now rides blackout and master.
- Tests: serverXR/src/lighting/tests/test-group-sub.js (new); vitest on src/lighting passed.
- Not done: no live check on the real desk yet.
