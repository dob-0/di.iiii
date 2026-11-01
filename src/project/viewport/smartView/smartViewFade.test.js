import { describe, expect, it } from 'vitest'

import * as THREE from 'three'

import { makeGhostMaterial, SV_FRAGMENT_BODY, SV_GHOST_BODY, SV_VERTEX_BODY } from './SmartView.jsx'
import { occlusionFadeEnabled } from './smartViewGeometry.js'

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

describe('occlusionFadeEnabled (the per-scene off switch, owner 2026-10-12)', () => {
    it('is on unless the author turns it off', () => {
        expect(occlusionFadeEnabled(undefined)).toBe(true)
        expect(occlusionFadeEnabled({})).toBe(true)
        expect(occlusionFadeEnabled({ smartView: {} })).toBe(true)
        expect(occlusionFadeEnabled({ smartView: { occlusionFade: true } })).toBe(true)
    })
    it('is off only on an explicit false', () => {
        expect(occlusionFadeEnabled({ smartView: { occlusionFade: false } })).toBe(false)
        expect(occlusionFadeEnabled({ smartView: { occlusionFade: 0 } })).toBe(true)
    })
})

// 2026-11-01 (cinema-house hall, the modelled place): large lighter rectangles with sharp edges on walls and roof that the
// Cycles renders did not have. Cause: the near fade took the distance to the lens as a per-vertex scalar, and a wall that is
// one quad of four far-apart vertices interpolates the far corners' distances across its whole face. It is now
// length() of the interpolated view-space position, per fragment.
describe('the near fade distance is per fragment', () => {
    it('is the length of the interpolated view-space position, in the cut and in the ghost', () => {
        expect(SV_VERTEX_BODY).not.toMatch(/vSvDist/)
        expect(SV_FRAGMENT_BODY).toMatch(/length\(vSvView\) < uSvNear/)
        expect(SV_GHOST_BODY).toMatch(/float svDist = length\(vSvView\);/)
        expect(SV_GHOST_BODY).not.toMatch(/vSvDist/)
    })
    it('why: a per-vertex scalar is wrong on a big quad, the interpolated vector is exact', () => {
        // lens in the middle of a 30 m wall quad, 1 m from it: the wall's four vertices are all 15 m away.
        const lens = [0, 0, 15]
        const dist = (p) => Math.hypot(p[0] - lens[0], p[1] - lens[1], p[2] - lens[2])
        const a = [1, 0, 0]
        const b = [1, 0, 30]
        const mid = [1, 0, 15]
        const scalarInterp = (dist(a) + dist(b)) / 2                          // what a varying float gave: ~15 m
        const vectorInterp = dist([(a[0] + b[0]) / 2, 0, (a[2] + b[2]) / 2])  // what length(varying vec3) gives
        expect(dist(mid)).toBeCloseTo(1, 9)
        expect(vectorInterp).toBeCloseTo(1, 9)          // inside the 2.5 m near cut: correct
        expect(scalarInterp).toBeGreaterThan(14)        // outside it: the wall right at the lens was never faded
    })
})

describe('the near-fade ghost twin', () => {
    it('draws front faces only, even when the building material is double-sided', () => {
        const wall = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide })
        const ghost = makeGhostMaterial(wall, {}, [])
        expect(wall.side).toBe(THREE.DoubleSide)
        expect(ghost.side).toBe(THREE.FrontSide)
        expect(ghost.transparent).toBe(true)
        expect(ghost.depthWrite).toBe(false)
    })
})
