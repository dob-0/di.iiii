import { createRequire } from 'node:module'
import { describe, it, expect } from 'vitest'
import { normalizeProjectDocument } from './projectSchema.js'

const require = createRequire(import.meta.url)
const serverSchema = require('../../shared/projectSchema.cjs')

// 2026-10-09, the light physics of the kit (src/objectComponents/laserLine.js, hazeZones.js): a lamp's beam has
// its own length (its light has no cutoff), a laser is a line source with its diodes, and the haze may be the
// two-zone estimate with its basis written beside it. The browser and the server keep the same fields.
const lamp = {
    id: 'rig-lasercube-cut-01',
    type: 'spotLight',
    components: {
        transform: { position: [0, 4, 5], rotation: [0, 0, 0], scale: [1, 1, 1] },
        light: { color: '#27ff4a', intensity: 20, distance: 0, angle: 0.01, penumbra: 0, decay: 2 },
        beam: {
            visible: true, haze: 1, only: true, length: 48.8,
            laser: { mW: [2700, 1500, 1800], nm: [455, 525, 638], diameter_mm: 4, divergence_mrad: 1, sceneScale: 0.02, source: 'Guide v1.2', frame: [[0, 0.5, 0, 1, 0], [9, 'x', 0, 0, 0]] }
        }
    }
}
const atmosphere = { scattering: 0.03, anisotropy: 0.74, haze: { model: 'nf-ff', volume_m3: 186890, calibrate: false, dries: false, nearField: { radius_m: 3, airSpeed_m_s: 0.1 }, source: 'UNVALIDATED estimate' } }

describe('the kit\'s light fields survive the schema, in the browser and on the server', () => {
    for (const [name, normalize] of [['browser', normalizeProjectDocument], ['server', serverSchema.normalizeProjectDocument]]) {
        it(`${name}: keeps beam.length and beam.laser, and the haze model, near field and source`, () => {
            const doc = normalize({ entities: [lamp], renderSettings: { atmosphere } })
            const beam = doc.entities[0].components.beam
            expect(beam.length).toBe(48.8)
            expect(beam.laser).toMatchObject({ mW: [2700, 1500, 1800], nm: [455, 525, 638], diameter_mm: 4, divergence_mrad: 1, sceneScale: 0.02, source: 'Guide v1.2' })
            // a bad frame point is dropped, never guessed
            expect(beam.laser.frame).toEqual([[0, 0.5, 0, 1, 0]])
            expect(doc.renderSettings.atmosphere.haze).toMatchObject({ model: 'nf-ff', volume_m3: 186890, calibrate: false, dries: false, nearField: { radius_m: 3, airSpeed_m_s: 0.1 }, source: 'UNVALIDATED estimate' })
            // a laser at a wavelength the cube does not have is not a laser
            const odd = normalize({ entities: [{ ...lamp, components: { ...lamp.components, beam: { visible: true, laser: { mW: [1], nm: [532] } } } }] })
            expect(odd.entities[0].components.beam.laser).toBeUndefined()
        })
    }
})
