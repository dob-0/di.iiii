import { describe, expect, it } from 'vitest'
import { createNode } from '../../../project/nodeRegistry.js'
import { cardViewerKind, cardViewerPort, hasCardViewer, isDeviceType } from './viewerKind.js'

const node = (typeId, overrides = {}) => ({ ...createNode(typeId), ...overrides })

describe('isDeviceType', () => {
    it('is true for device./source. prefixes and the one bare exception', () => {
        expect(isDeviceType('device.midi.in')).toBe(true)
        expect(isDeviceType('device.dmx.out')).toBe(true)
        expect(isDeviceType('source.webcam')).toBe(true)
        expect(isDeviceType('source.mic')).toBe(true)
        expect(isDeviceType('agent.keeper')).toBe(true)
    })

    it('is false for everything else, including a look-alike prefix', () => {
        expect(isDeviceType('math.op')).toBe(false)
        expect(isDeviceType('geom.cube')).toBe(false)
        expect(isDeviceType('agent')).toBe(false)
        expect(isDeviceType(null)).toBe(false)
        expect(isDeviceType(undefined)).toBe(false)
    })
})

describe('cardViewerKind', () => {
    it('picks the viewer from the numbers-family primary output type', () => {
        expect(cardViewerKind(node('math.op'))).toBe('number')
        expect(cardViewerKind(node('value.color'))).toBe('color')
        expect(cardViewerKind(node('value.vec3'))).toBe('vec3')
        expect(cardViewerKind(node('value.boolean'))).toBe('boolean')
        expect(cardViewerKind(node('value.string'))).toBe('string')
    })

    it('is "device" for every device/source type regardless of family or output shape', () => {
        expect(cardViewerKind(node('device.midi.in'))).toBe('device')
        expect(cardViewerKind(node('device.dmx.out'))).toBe('device')
        expect(cardViewerKind(node('source.webcam'))).toBe('device')
        expect(cardViewerKind(node('agent.keeper'))).toBe('device')
    })

    it('is null for a container/room-family card — settings, not a value to watch', () => {
        expect(cardViewerKind(node('universe.world'))).toBe(null)
        expect(cardViewerKind(node('studio'))).toBe(null)
    })

    it('never doubles up with a picture: top types and cardPreview types get nothing here', () => {
        expect(cardViewerKind(node('top.blur'))).toBe(null)
        expect(cardViewerKind(node('geom.cube'))).toBe(null)
        expect(cardViewerKind(node('light.point'))).toBe(null)
    })

    it('is null for a type with no output at all', () => {
        expect(cardViewerKind(node('universe.space'))).toBe(null)
    })

    it('hasCardViewer mirrors a non-null kind', () => {
        expect(hasCardViewer(node('math.op'))).toBe(true)
        expect(hasCardViewer(node('geom.cube'))).toBe(false)
    })
})

describe('cardViewerPort', () => {
    it('is the primary (first) output for a numbers-family card', () => {
        expect(cardViewerPort(node('math.op'))?.id).toBe('out')
        expect(cardViewerPort(node('device.midi.in'))?.id).toBe('note')
    })

    it('prefers a string `status`-shaped output for a device, over an earlier numeric one', () => {
        // DMX/MIDI/OSC Out all declare their only output as `status` (string) —
        // the case this exists for: a device viewer must never show nothing
        // when a real status is being published.
        expect(cardViewerPort(node('device.dmx.out'))?.id).toBe('status')
        expect(cardViewerPort(node('device.midi.out'))?.id).toBe('status')
    })

    it('falls back to the first output when a device has no string output', () => {
        // device.midi.in: note, velocity, cc, value (all number), trigger (signal) — no string.
        expect(cardViewerPort(node('device.midi.in'))?.id).toBe('note')
    })
})
