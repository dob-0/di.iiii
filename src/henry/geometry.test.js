import { describe, expect, it } from 'vitest'
import { makeBlobGeometry, makeLeafGeometry, makePetalGeometry, makeTaperGeometry } from './geometry.js'

// These builders are sampled parametric surfaces, which fail in exactly one
// way: a division or a pow that produces NaN for some corner of the u,v grid
// and silently removes the object from the scene with no error anywhere. The
// mesh just is not there. So every test below is really the same test — the
// numbers came out finite — checked at the edges of the domain.

const builders = [
    ['petal', makePetalGeometry],
    ['leaf', makeLeafGeometry],
    ['blob', makeBlobGeometry],
    ['taper', makeTaperGeometry]
]

const positionsOf = (geometry) => geometry.attributes.position.array

describe.each(builders)('%s geometry', (name, build) => {
    it('produces only finite positions', () => {
        const geometry = build()
        const positions = positionsOf(geometry)
        expect(positions.length).toBeGreaterThan(0)
        for (let i = 0; i < positions.length; i++) {
            expect(Number.isFinite(positions[i]), `${name} vertex component ${i}`).toBe(true)
        }
    })

    it('produces normals, so the toon ramp has something to shade', () => {
        const geometry = build()
        expect(geometry.attributes.normal).toBeTruthy()
        const normals = geometry.attributes.normal.array
        for (let i = 0; i < normals.length; i++) {
            expect(Number.isFinite(normals[i])).toBe(true)
        }
    })

    it('is deterministic — the same arguments give the same mesh', () => {
        // The composition is framed against these shapes. A builder that
        // wandered between reloads would move the piece out from under its own
        // camera moves.
        const a = positionsOf(build())
        const b = positionsOf(build())
        expect(Array.from(a)).toEqual(Array.from(b))
    })
})

describe('petal proportions', () => {
    it('comes to a point rather than ending in a flat edge', () => {
        const geometry = makePetalGeometry({ length: 1, width: 0.3 })
        const positions = positionsOf(geometry)
        // The last row of the u grid is the tip; every vertex in it should sit
        // on the centre line.
        const stride = 3
        const last = positions.length - stride
        expect(Math.abs(positions[last])).toBeLessThan(1e-6)
    })

    it('bends back rather than standing straight up', () => {
        const straight = makePetalGeometry({ length: 1, bend: 0 })
        const bent = makePetalGeometry({ length: 1, bend: 1.35 })
        const tipZ = (geometry) => positionsOf(geometry)[positionsOf(geometry).length - 1]
        expect(tipZ(bent)).toBeGreaterThan(tipZ(straight))
    })
})

describe('blob', () => {
    it('stays near its nominal radius rather than exploding', () => {
        const geometry = makeBlobGeometry({ radius: 1, wobble: 0.12 })
        const positions = positionsOf(geometry)
        for (let i = 0; i < positions.length; i += 3) {
            const radius = Math.hypot(positions[i], positions[i + 1], positions[i + 2])
            expect(radius).toBeGreaterThan(0.7)
            expect(radius).toBeLessThan(1.3)
        }
    })
})
