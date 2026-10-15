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
// WHO GETS WHICH: `?quality=high|low` in the address wins (`full|lite`, the old words, still open), then the viewer's own choice
// (the High/Low button, remembered for this tab), else: a desktop with a real GPU (a fine
// pointer, a hardware WebGL renderer) starts in High; a phone or tablet (coarse pointer) and
// a software renderer (SwiftShader, llvmpipe) start in Low. Owner 2026-10-15, looking at the
// dev room in Low ("why this much ugly" → "so fix"); before that, 2026-10-08, Low was the
// default everywhere ("full HQ only when needed") — that rule stays for every device that
// cannot carry High. The setting is called Quality, its values Low and High (owner 2026-10-15; the keys 'lite'/'full' of before are read as aliases).

// The Low rule itself (what the output keeps and drops) lives in src/shared/renderPlan.js since 2026-10-15, so the render
// plan (Studio / Tech / Show × Low / High) and this file share one copy.
export { OUTPUT_POOL_SLOTS, outputRenderSettings, outputDocument } from '../../shared/renderPlan.js'
export const OUTPUT_STORAGE_KEY = 'di.view.quality'

const QUALITY_RE = /(?:^|[?&])quality=(high|low|full|lite)(?:&|$)/i

/** One quality word, old or new, as 'low' | 'high' (null for anything else). 'lite' and 'full' are the retired words. */
export const normalizeQuality = (value) => {
    const v = String(value ?? '').toLowerCase()
    if (v === 'low' || v === 'lite') return 'low'
    if (v === 'high' || v === 'full') return 'high'
    return null
}

/** Is the room drawn as the output (true) or at full work quality (false)? */
export const outputModeWanted = ({ search = '', stored = null, coarse = false, workMachine = false, softwareGl = false } = {}) => {
    const pick = normalizeQuality(QUALITY_RE.exec(String(search || ''))?.[1]) || normalizeQuality(stored)
    if (pick) return pick === 'low'
    // High on a desktop with a real GPU, Low on a phone (coarse pointer) or a software renderer (owner 2026-10-15).
    // `workMachine` is kept in the signature for the callers and the record of the 2026-10-04 rule (local = full).
    void workMachine
    return Boolean(coarse || softwareGl)
}

/** Is this WebGL renderer string a software one (no GPU: SwiftShader, llvmpipe, Mesa's software rasterizer)? */
export const isSoftwareRenderer = (renderer = '') => /swiftshader|llvmpipe|softpipe|software|mesa offscreen|basic render/i.test(String(renderer || ''))
