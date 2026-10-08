// OUTPUT MODE — the room as everyone sees it, light enough for a phone. Pure.
//
// TWO SIDES. The work machine (a local install, a mouse) builds and simulates the show:
// every lamp a real light, shadows, bloom, the floor's reflection — the full renderer,
// heavy on purpose. Everything else (a phone, a tablet, any visitor of a hosted or LAN
// room) gets the output: the same room following the same desk, drawn so a phone holds it.
//
// WHAT THE OUTPUT KEEPS AND DROPS (measured 2026-10-04, known-full, 68 lamps, the AMD
// 860M with the frame cap off): full 57 fps and the hall still unlit after 18 s of shader
// compiles; output 264–355 fps, hall and beams up in the same 18 s.
//   kept    every lamp's beam cone and lens (the light an eye reads in haze), the haze
//   pooled  the light ON the room: OUTPUT_POOL_SLOTS real lights carried by the lamps that
//           matter most in the look that plays (lightPool.js) — the shader is compiled for
//           4 lights, not 70
//   dropped shadows, bloom, the floor's surface model (reflections), antialias; DPR 1
// The document is never written: the room draws a copy.
//
// WHO GETS WHICH: `?quality=full|lite` in the address wins, then the viewer's own choice
// (the Full/Lite button, remembered for this tab), else Lite (owner 2026-10-08: Lite is the
// default; full HQ only when asked).

export const OUTPUT_POOL_SLOTS = 4
export const OUTPUT_STORAGE_KEY = 'di.view.quality'

const QUALITY_RE = /(?:^|[?&])quality=(full|lite)(?:&|$)/i

/** Is the room drawn as the output (true) or at full work quality (false)? */
export const outputModeWanted = ({ search = '', stored = null, coarse = false, workMachine = false } = {}) => {
    const asked = QUALITY_RE.exec(String(search || ''))?.[1]?.toLowerCase()
    const pick = asked || (stored === 'full' || stored === 'lite' ? stored : null)
    if (pick) return pick === 'lite'
    // LITE BY DEFAULT, EVERYWHERE (owner, 2026-10-08: "make the Lite version the default; full HQ only when needed"): the
    // work machine with a mouse starts in Lite too, and Full is the button (remembered for this tab only, useOutputMode.js).
    // `coarse` and `workMachine` are kept in the signature for the callers and the record of the old rule.
    void coarse
    void workMachine
    return true
}

/** The room's render settings as the output draws them. */
export const outputRenderSettings = (renderSettings = {}) => {
    const rs = renderSettings && typeof renderSettings === 'object' ? renderSettings : {}
    const { bloom: _bloom, surfaces: _surfaces, ...rest } = rs
    return {
        ...rest,
        shadows: false,
        shadowCasting: { ...(rs.shadowCasting || {}), enabled: false },
        antialias: false,
        dprMin: 1,
        dprMax: 1
    }
}

/** A copy of the document drawn as the output: its render settings, and the light pool on. */
export const outputDocument = (document) => {
    if (!document) return document
    const pool = document.mappingState?.lightPool || {}
    const slots = Math.min(OUTPUT_POOL_SLOTS, Number.isFinite(Number(pool.slots)) ? Number(pool.slots) : OUTPUT_POOL_SLOTS)
    return {
        ...document,
        renderSettings: outputRenderSettings(document.renderSettings),
        mappingState: { ...(document.mappingState || {}), lightPool: { ...pool, enabled: true, slots } }
    }
}
