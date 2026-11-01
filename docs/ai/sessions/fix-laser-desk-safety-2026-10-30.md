## 2026-10-30 — laser desk safety fixes stacked on #1218 (review M1, S1-S3)

- Desk Blackout never toggles: `on` must be a boolean (else 400); lifting it is same-machine only, going dark is a stop; key B only goes dark, Shift+B or the button lifts. Wiki, key list and catalogue follow.
- The engine counts its blackouts and the desk latches when the count rises, also while released and before a Go.
- A live edit with nothing live answers 409; a cube's size has a floor of 0.3.
- Six new tests, each failing on #1218's head. Still owed: review M2 (20 Hz frames against the engine's pacing, measure on the Mac) and S4 (no dead-man).
