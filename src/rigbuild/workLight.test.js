import { describe, expect, it } from 'vitest'
import { WORK_LIGHT_COLOUR, workLightEntities } from './workLight.js'

const lamp = (id, color, intensity = 610) => ({ id, components: { fixture: { type: 'up-pl5403' }, light: { color, intensity }, transform: { position: [0, 0, 0] } } })

describe('work light: every lamp white at its own strength, nothing else touched', () => {
    it('turns a red-rested lamp white and keeps its strength', () => {
        const [out] = workLightEntities([lamp('a', '#ff3a12', 610)])
        expect(out.components.light).toEqual({ color: WORK_LIGHT_COLOUR, intensity: 610 })
    })
    it('lights all of them: 28 red + 12 white washes all come out white', () => {
        const rig = [...Array.from({ length: 28 }, (_, i) => lamp(`r${i}`, '#ff3a12')), ...Array.from({ length: 12 }, (_, i) => lamp(`w${i}`, '#e8e4dc'))]
        expect(workLightEntities(rig).every((e) => e.components.light.color === WORK_LIGHT_COLOUR)).toBe(true)
    })
    it('leaves what is not a lamp, and never changes the input', () => {
        const hall = { id: 'hall', components: { media: { assetId: 'x' } } }
        const red = lamp('a', '#ff3a12')
        const out = workLightEntities([hall, red])
        expect(out[0]).toBe(hall)
        expect(red.components.light.color).toBe('#ff3a12')
    })
    it('hides every scene\'s baked floor glow (the single wash and the per-look ones)', () => {
        const out = workLightEntities([{ id: 'rig-wash', components: { appearance: { opacity: 1 } } }, { id: 'rig-wash:rig-the-road-in', components: { appearance: { opacity: 0.8 } } }])
        expect(out.map((e) => e.components.appearance.opacity)).toEqual([0, 0])
    })
    it('a LaserCube line stops playing its frames and shines steady; its diodes stay', () => {
        const line = { id: 'rig-laser-1a', components: { fixture: { type: 'ext-lc-ultra-mk2' }, light: { color: '#e8e4dc', intensity: 334252 }, beam: { visible: true, laser: { mW: [4000, 2000, 1500], frames: { period: 1116, list: [] } } } } }
        const [out] = workLightEntities([line])
        expect(out.components.beam.laser.frames).toBeNull()
        expect(out.components.beam.laser.mW).toEqual([4000, 2000, 1500])
        expect(line.components.beam.laser.frames).not.toBeNull()
    })
})
