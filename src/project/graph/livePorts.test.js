import { describe, it, expect } from 'vitest'
import {
    LivePortRegistry,
    PORT_STATUS,
    createLivePortRegistry,
    livePortKey,
    readLivePort,
    readLivePortStatus
} from './livePorts.js'

describe('livePortKey', () => {
    it('spells the key the same way the evaluator used to inline it', () => {
        expect(livePortKey('node_1', 'frame')).toBe('node_1:frame')
    })
})

describe('LivePortRegistry values', () => {
    it('stores and reads a value by node and port', () => {
        const texture = { isTexture: true }
        const registry = createLivePortRegistry().set('cam', 'frame', texture)
        expect(registry.get('cam', 'frame')).toBe(texture)
        expect(registry.has('cam', 'frame')).toBe(true)
    })

    it('keeps falsy readings — a silent mic is a reading, not an absence', () => {
        const registry = createLivePortRegistry().set('mic', 'volume', 0)
        expect(registry.get('mic', 'volume')).toBe(0)
        expect(registry.has('mic', 'volume')).toBe(true)
        expect(registry.status('mic', 'volume').status).toBe(PORT_STATUS.LIVE)
    })

    it('clears the port on null and on undefined', () => {
        const base = createLivePortRegistry().set('cam', 'frame', { isTexture: true })
        expect(base.set('cam', 'frame', null).has('cam', 'frame')).toBe(false)
        expect(base.set('cam', 'frame', undefined).has('cam', 'frame')).toBe(false)
    })

    it('never mutates in place — a stale registry keeps its old reading', () => {
        const first = createLivePortRegistry().set('mic', 'volume', 0.2)
        const second = first.set('mic', 'volume', 0.9)
        expect(first.get('mic', 'volume')).toBe(0.2)
        expect(second.get('mic', 'volume')).toBe(0.9)
        expect(second).not.toBe(first)
    })
})

// This is the guard for the 2026-08-08 infinite-update-loop class: a capture
// panel reports on every frame, and a fresh registry per report re-renders the
// editor 60 times a second. Identity has to survive an unchanged report.
describe('LivePortRegistry identity', () => {
    it('returns the same instance when the value and status are unchanged', () => {
        const texture = { isTexture: true }
        const first = createLivePortRegistry().set('cam', 'frame', texture)
        expect(first.set('cam', 'frame', texture)).toBe(first)
    })

    it('returns the same instance when clearing an already-absent port', () => {
        const registry = createLivePortRegistry()
        expect(registry.set('cam', 'frame', null)).toBe(registry)
    })

    it('returns a new instance when only the status changed', () => {
        const first = createLivePortRegistry().report('cam', 'frame', PORT_STATUS.STARTING)
        const second = first.report('cam', 'frame', PORT_STATUS.DENIED)
        expect(second).not.toBe(first)
        expect(second.status('cam', 'frame').status).toBe(PORT_STATUS.DENIED)
    })

    it('returns the same instance when the same status is reported twice', () => {
        const first = createLivePortRegistry().report('cam', 'frame', PORT_STATUS.DENIED)
        expect(first.report('cam', 'frame', PORT_STATUS.DENIED)).toBe(first)
    })
})

describe('LivePortRegistry status', () => {
    it('reports IDLE for a port nobody has touched', () => {
        expect(createLivePortRegistry().status('cam', 'frame')).toEqual({ status: PORT_STATUS.IDLE })
    })

    it('infers LIVE from a value with no stated status', () => {
        const registry = createLivePortRegistry().set('cam', 'frame', { isTexture: true })
        expect(registry.status('cam', 'frame').status).toBe(PORT_STATUS.LIVE)
    })

    // The reason the module exists: five different empties, told apart.
    it('distinguishes denied from unavailable from error from idle', () => {
        const registry = createLivePortRegistry()
            .report('a', 'frame', PORT_STATUS.DENIED)
            .report('b', 'note', PORT_STATUS.UNAVAILABLE, 'No MIDI in this browser')
            .report('c', 'reply', PORT_STATUS.ERROR, 'fetch failed')
            .report('d', 'frame', PORT_STATUS.STARTING)

        expect(registry.status('a', 'frame')).toEqual({ status: PORT_STATUS.DENIED })
        expect(registry.status('b', 'note')).toEqual({
            status: PORT_STATUS.UNAVAILABLE, message: 'No MIDI in this browser'
        })
        expect(registry.status('c', 'reply')).toEqual({ status: PORT_STATUS.ERROR, message: 'fetch failed' })
        expect(registry.status('d', 'frame')).toEqual({ status: PORT_STATUS.STARTING })
        expect(registry.status('e', 'frame')).toEqual({ status: PORT_STATUS.IDLE })
    })

    // A stale frame that looks fine is worse than a blank one that says why.
    it.each([PORT_STATUS.DENIED, PORT_STATUS.UNAVAILABLE, PORT_STATUS.ERROR])(
        'drops the value when a port reports %s',
        (status) => {
            const registry = createLivePortRegistry()
                .set('cam', 'frame', { isTexture: true })
                .report('cam', 'frame', status, 'device lost')
            expect(registry.has('cam', 'frame')).toBe(false)
            expect(registry.status('cam', 'frame').status).toBe(status)
        }
    )

    // The bug the first version of report() had: a MIDI device reporting LIVE
    // wiped the last note it had sent, because every report cleared the value.
    it.each([PORT_STATUS.LIVE, PORT_STATUS.STARTING, PORT_STATUS.IDLE])(
        'keeps the value when a port reports %s',
        (status) => {
            const registry = createLivePortRegistry()
                .set('midi', 'note', 60)
                .report('midi', 'note', status)
            expect(registry.get('midi', 'note')).toBe(60)
            expect(registry.status('midi', 'note').status).toBe(status)
        }
    )

    it('ignores a report with a status outside the vocabulary', () => {
        const registry = createLivePortRegistry().set('midi', 'note', 60)
        expect(registry.report('midi', 'note', 'sideways')).toBe(registry)
        expect(registry.get('midi', 'note')).toBe(60)
    })

    it('ignores a status that is not in the vocabulary', () => {
        const registry = createLivePortRegistry().set('cam', 'frame', 1, 'nonsense')
        expect(registry.status('cam', 'frame').status).toBe(PORT_STATUS.LIVE)
    })

    it('accepts a bare status string as well as an object', () => {
        const registry = createLivePortRegistry().set('cam', 'frame', null, PORT_STATUS.STARTING)
        expect(registry.status('cam', 'frame').status).toBe(PORT_STATUS.STARTING)
    })

    it('does not store IDLE, so ports that ran and stopped leave no tombstone', () => {
        const registry = createLivePortRegistry()
            .set('cam', 'frame', { isTexture: true })
            .set('cam', 'frame', null)
        expect(registry.statuses.size).toBe(0)
        expect(registry.size).toBe(0)
    })
})

describe('LivePortRegistry.clearNode', () => {
    it('drops every port of one node and leaves its neighbours alone', () => {
        const registry = createLivePortRegistry()
            .set('mic', 'volume', 0.4)
            .set('mic', 'frequency', new Uint8Array(2))
            .report('mic', 'frequency', PORT_STATUS.ERROR, 'analyser gone')
            .set('cam', 'frame', { isTexture: true })

        const cleared = registry.clearNode('mic')
        expect(cleared.has('mic', 'volume')).toBe(false)
        expect(cleared.status('mic', 'frequency').status).toBe(PORT_STATUS.IDLE)
        expect(cleared.get('cam', 'frame')).toEqual({ isTexture: true })
    })

    it('returns the same instance when the node held nothing', () => {
        const registry = createLivePortRegistry().set('cam', 'frame', 1)
        expect(registry.clearNode('mic')).toBe(registry)
    })

    // 'mic' must not take 'mic2' with it.
    it('does not clear a node whose id merely starts with the same characters', () => {
        const registry = createLivePortRegistry()
            .set('mic', 'volume', 1)
            .set('mic2', 'volume', 2)
        const cleared = registry.clearNode('mic')
        expect(cleared.get('mic2', 'volume')).toBe(2)
    })
})

// Every existing caller still hands the evaluator a bare Map. If these break,
// the migration is a breaking change and every test in nodeGraphRuntime fails.
describe('bare-Map compatibility', () => {
    it('reads a value out of a plain Map keyed the old way', () => {
        const map = new Map([['cam:frame', { isTexture: true }]])
        expect(readLivePort(map, 'cam', 'frame')).toEqual({ isTexture: true })
    })

    it('reads a value out of a registry', () => {
        const registry = createLivePortRegistry().set('cam', 'frame', 7)
        expect(readLivePort(registry, 'cam', 'frame')).toBe(7)
    })

    it('returns undefined for a missing source rather than throwing', () => {
        expect(readLivePort(null, 'cam', 'frame')).toBeUndefined()
        expect(readLivePortStatus(null, 'cam', 'frame').status).toBe(PORT_STATUS.IDLE)
    })

    it('infers a status from a bare Map, since a Map cannot say why', () => {
        const map = new Map([['cam:frame', 1]])
        expect(readLivePortStatus(map, 'cam', 'frame').status).toBe(PORT_STATUS.LIVE)
        expect(readLivePortStatus(map, 'cam', 'missing').status).toBe(PORT_STATUS.IDLE)
    })

    it('carries the real status through when the source is a registry', () => {
        const registry = createLivePortRegistry().report('cam', 'frame', PORT_STATUS.DENIED)
        expect(readLivePortStatus(registry, 'cam', 'frame').status).toBe(PORT_STATUS.DENIED)
    })
})

describe('LivePortRegistry construction', () => {
    it('starts empty', () => {
        const registry = createLivePortRegistry()
        expect(registry.size).toBe(0)
        expect(registry).toBeInstanceOf(LivePortRegistry)
    })
})
