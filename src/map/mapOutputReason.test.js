import { describe, expect, it } from 'vitest'
import { mapOutputReason } from './mapOutputReason.js'

const surface = (patch = {}) => ({
    id: 'a',
    enabled: true,
    source: { kind: 'project', ref: 'scene-1' },
    ...patch
})

describe('mapOutputReason', () => {
    it('is empty when nothing is mapped', () => {
        expect(mapOutputReason({ mapping: { surfaces: [] } })).toBe('empty')
        expect(mapOutputReason({ mapping: {} })).toBe('empty')
        expect(mapOutputReason({})).toBe('empty')
        expect(mapOutputReason()).toBe('empty')
    })

    it('is ok when at least one surface is switched on', () => {
        expect(mapOutputReason({ mapping: { surfaces: [surface({ enabled: false }), surface()] } })).toBe('ok')
    })

    it('is all-off when every mapped surface is switched off', () => {
        expect(mapOutputReason({ mapping: { surfaces: [surface({ enabled: false }), surface({ id: 'b', enabled: false })] } })).toBe('all-off')
    })

    it('treats a missing enabled field as off, matching MapStage', () => {
        // MapStage.jsx hides a surface with `!surface.enabled` — this must
        // agree with that, not invent its own truthy/falsy rule.
        expect(mapOutputReason({ mapping: { surfaces: [{ id: 'a', source: { kind: 'project', ref: 'scene-1' } }] } })).toBe('all-off')
    })
})
