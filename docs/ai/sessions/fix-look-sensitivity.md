# Mouse-look sensitivity −35% (2026-08-24)

Owner request after walking the hub on a desktop: at 0.018 a small mouse sweep
spun the room. POINTER_LOCK_SENSITIVITY 0.018 → 0.0117 (−35%). Drag-look and
the broken-lock fallback derive from it (×0.35), so they calm down with it —
that coupling is the point of the one-reference family in walkModeConfig.js.
Touch and trackpad sensitivities untouched: the phones at camp were tuned
separately and nobody complained about them.
