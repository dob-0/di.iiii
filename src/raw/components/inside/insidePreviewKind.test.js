import { describe, expect, it } from 'vitest'
import { NODE_TYPES } from '../../../project/nodeRegistry.js'
import { insidePreviewKind } from './insidePreviewKind.js'

const KINDS = new Set(['picture', 'window', 'object3d', 'texture', 'number', 'signal', 'colour', 'vec3', 'text', 'device', 'holds', 'none', 'unbuilt'])
const kindOf = (typeId) => insidePreviewKind({ id: 'n', typeId, values: {} })

describe('insidePreviewKind — what SEE shows, by what a node makes', () => {
    it('maps every registered type to exactly one known kind', () => {
        for (const typeId of Object.keys(NODE_TYPES)) {
            expect(KINDS.has(kindOf(typeId)), typeId).toBe(true)
        }
    })

    it('shows a picture operator its picture, a panel its window, a cube its body', () => {
        expect(kindOf('top.level')).toBe('picture')
        expect(kindOf('top.camera')).toBe('picture')
        expect(kindOf('source.webcam')).toBe('window')
        expect(kindOf('view.text')).toBe('window')
        expect(kindOf('device.dmx.out')).toBe('window')
        expect(kindOf('geom.cube')).toBe('object3d')
        expect(kindOf('world.light')).toBe('object3d')
        expect(kindOf('geom.geo')).toBe('object3d')
    })

    it('scopes numbers, signals, colours and vectors, and reads text as text', () => {
        expect(kindOf('signal.lfo')).toBe('number')
        expect(kindOf('value.boolean')).toBe('signal')
        expect(kindOf('logic.compare')).toBe('signal')
        expect(kindOf('value.color')).toBe('colour')
        expect(kindOf('value.vec3')).toBe('vec3')
        expect(kindOf('value.string')).toBe('text')
    })

    it('says what is sent out, what is held, and when there is nothing, or nothing built', () => {
        expect(kindOf('device.midi.out')).toBe('device')
        expect(kindOf('universe.space')).toBe('holds')
        expect(kindOf('universe.world')).toBe('holds')
        expect(kindOf('world.grid')).toBe('none')
        expect(kindOf('stream.recorder')).toBe('unbuilt')
        expect(insidePreviewKind({ typeId: 'not.a.type' })).toBe('none')
    })
})
