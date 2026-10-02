import { describe, expect, it } from 'vitest'

import { SV_FRAGMENT_BODY, SV_VERTEX_BODY } from './SmartView.jsx'

// 2026-10-02 (the "dotted dome" on the crane bridge): the occlusion fade was a 4x4 Bayer screen-door
// over most of the circle, which reads as dots once the renderer has no MSAA. It is a clean cut-out now.
describe('the occlusion fade shader', () => {
    it('cuts fully past a threshold and dithers only in a narrow band below it', () => {
        expect(SV_FRAGMENT_BODY).toMatch(/if \(svK > 0\.55\) discard;/)
        const band = /if \(svK > 0\.45 && svBayer4\(gl_FragCoord\.xy\) < \(svK - 0\.45\) \/ 0\.10\) discard;/
        expect(SV_FRAGMENT_BODY).toMatch(band)
    })
    it('no longer screen-doors the whole circle', () => {
        expect(SV_FRAGMENT_BODY).not.toMatch(/svBayer4\(gl_FragCoord\.xy\) < uSvStrength/)
    })
    // 2026-10-02 (/moxir, Free view): the cut took the roof over the stage with it, a black disc of night sky.
    it('never cuts above the roof underside', () => {
        expect(SV_FRAGMENT_BODY).toMatch(/if \(uSvStrength > 0\.001 && vSvWorldY < uSvCeiling\)/)
        expect(SV_VERTEX_BODY).toMatch(/vSvWorldY = \(modelMatrix \* svWorld\)\.y;/)
        expect(SV_VERTEX_BODY).toMatch(/instanceMatrix \* svWorld/)
    })
})
