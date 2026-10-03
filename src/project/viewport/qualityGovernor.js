// HOLD THE FRAME RATE — a rig room drawn with haze, bloom and many real lamps runs at
// ~100 fps on PONYO's RTX 5060 and ~19 on its AMD 860M iGPU (MOXIR Known · full, 2026-10-01).
// One fixed quality cannot serve both: this steps the room's quality down, one notch at a
// time, while the measured frame rate stays under the target, and back up when there is
// room again. Pure: the steps and the decision; HdrBloom / RenderSettingsEffect apply them.
//
// The notches, cheapest loss first (what each buys, measured on the 860M, DJ view):
//   0  full               12 haze samples a beam, bloom, the room's own DPR
//   1  fewer samples      8 samples (the beam's grain shows a little more)
//   2  fewer samples      6 samples, DPR ≤ 1.25
//   3  no bloom           the glare veil comes back in its place (+4–5 fps)
//   4  low resolution     DPR ≤ 1, 5 samples
//   5  lowest             DPR ≤ 0.75 (the picture softens; still a show to read)
// Never touched here: the lamps, their light, shadows (changing those recompiles every
// lit material — a hitch worse than a low frame rate) and the haze's density.

export const QUALITY_STEPS = [
    { samples: 12, bloom: true, dprMax: Infinity },
    { samples: 8, bloom: true, dprMax: Infinity },
    { samples: 6, bloom: true, dprMax: 1.25 },
    { samples: 6, bloom: false, dprMax: 1.25 },
    { samples: 5, bloom: false, dprMax: 1 },
    { samples: 5, bloom: false, dprMax: 0.75 }
]

export const TARGET_FPS = 55 // a little under 60: vsync jitter alone must not step down
export const RAISE_FPS = 70 // only climb back with clear room to spare (no see-saw)
export const WINDOW_MS = 2000 // frame rate measured over this long
export const RAISE_AFTER_MS = 8000 // and held this long before a step up
// A room's first seconds are shader compiles and texture uploads, not its frame rate: no
// decision until this long after the governor starts, and a frame longer than HITCH_MS is
// a hitch (a compile, a tab switch) — it restarts the window instead of counting as slow.
// (Seen on PONYO: the governor stepped bloom off during the load and the lenses lost their glow.)
export const WARMUP_MS = 6000
export const HITCH_MS = 250

/**
 * The next notch, given the current one and a measurement.
 * `fps` over the last window; `goodForMs` how long the rate has stayed above RAISE_FPS.
 */
export const nextQuality = (level, fps, goodForMs = 0) => {
    const top = QUALITY_STEPS.length - 1
    if (!Number.isFinite(fps) || fps <= 0) return level
    if (fps < TARGET_FPS && level < top) return level + 1
    if (fps > RAISE_FPS && goodForMs >= RAISE_AFTER_MS && level > 0) return level - 1
    return level
}

/** The DPR to draw at for a notch, inside the room's own [dprMin, dprMax]. */
export const qualityDpr = (level, renderSettings, deviceDpr = 1) => {
    const step = QUALITY_STEPS[Math.max(0, Math.min(QUALITY_STEPS.length - 1, level))]
    const lo = Number(renderSettings?.dprMin) > 0 ? Number(renderSettings.dprMin) : 0.5
    const hi = Number(renderSettings?.dprMax) > 0 ? Number(renderSettings.dprMax) : 2
    return Math.max(Math.min(lo, step.dprMax), Math.min(deviceDpr, hi, step.dprMax))
}
