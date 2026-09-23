import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The engine needs a real WebGL context (topEngine.js: "8-bit textures and
// WebGL1 on purpose") and jsdom has none, so it is a stand-in here; so is the
// sender. What this file states is the WIRING between them — which operators
// are handed to the sender, under which names, from which frame loop, and
// that unmounting takes them off the network.
const engine = {
    width: 640,
    height: 360,
    gl: { canvas: { width: 640, height: 360 } },
    network: { nodes: [] },
    frame: vi.fn(),
    show: vi.fn(),
    has: vi.fn(() => true),
    thumbnails: vi.fn(),
    setNetwork: vi.fn(),
    setVideo: vi.fn(),
    setRemoteVideo: vi.fn(),
    errorFor: () => null,
    dispose: vi.fn()
}
vi.mock('./topEngine.js', () => ({ createTopEngine: vi.fn(() => engine) }))

const sender = { pump: vi.fn(), setOutputs: vi.fn(), stop: vi.fn(), outputs: () => [] }
const createPictureOut = vi.fn(() => sender)
vi.mock('./pictureOut.js', () => ({ createPictureOut: (...args) => createPictureOut(...args) }))

import { toTopNetwork, useTopNetwork } from './useTopNetwork.js'
import { readTopReport } from './topReports.js'

const document = {
    nodes: [
        { id: 'noise', typeId: 'top.noise', values: {} },
        { id: 'send', typeId: 'top.send', values: { name: '  di test  ' } },
        { id: 'quiet', typeId: 'top.send', values: {} },
        { id: 'out', typeId: 'top.out', values: {} }
    ],
    edges: [{ fromNodeId: 'noise', fromPort: 'out', toNodeId: 'send', toPort: 'a' }]
}

let frames = []
beforeEach(() => {
    frames = []
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback) => { frames.push(callback); return frames.length }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    createPictureOut.mockClear()
    for (const fn of Object.values(sender)) fn.mockClear?.()
    for (const fn of Object.values(engine)) fn.mockClear?.()
})
afterEach(() => { vi.unstubAllGlobals() })

describe('a Send Out on the page that runs it', () => {
    it('hands the sender every named Send Out that runs here, names trimmed, the unnamed one left out', () => {
        renderHook(() => useTopNetwork({ network: toTopNetwork(document) }))
        expect(createPictureOut).toHaveBeenCalledTimes(1)
        expect(sender.setOutputs).toHaveBeenLastCalledWith(new Map([['send', 'di test'], ['quiet', '']]))
    })

    it('pumps the sender from the same frame loop as the thumbnails, before the canvas is shown', () => {
        renderHook(() => useTopNetwork({ network: toTopNetwork(document), show: 'out' }))
        const order = []
        engine.frame.mockImplementation(() => order.push('frame'))
        sender.pump.mockImplementation(() => order.push('pump'))
        engine.show.mockImplementation(() => order.push('show'))
        act(() => { frames[0](16) })
        expect(order).toEqual(['frame', 'pump', 'show'])
    })

    it('reads the picture out of the engine at the engine\'s size', () => {
        renderHook(() => useTopNetwork({ network: toTopNetwork(document) }))
        const options = createPictureOut.mock.calls[0][0]
        expect(options.size()).toEqual({ width: 640, height: 360 })
        const context = {}
        expect(options.drawNode('send', context)).toBe(true)
        expect(engine.thumbnails).toHaveBeenCalledWith(new Map([['send', context]]))
        engine.has.mockReturnValueOnce(false)
        expect(options.drawNode('elsewhere', context)).toBe(false)
    })

    it('puts what the sender says on the operator\'s report, where a page looking inside reads it', () => {
        renderHook(() => useTopNetwork({ network: toTopNetwork(document) }))
        const { onState } = createPictureOut.mock.calls[0][0]
        act(() => onState('send', { state: 'unavailable', reason: 'not-installed', how: 'Install it.' }))
        expect(readTopReport('send').send).toMatchObject({ state: 'unavailable', how: 'Install it.' })
        act(() => onState('send', null))
        expect(readTopReport('send').send).toBeNull()
    })

    it('stops sending when the page goes, so the source leaves the network with it', () => {
        const { unmount } = renderHook(() => useTopNetwork({ network: toTopNetwork(document) }))
        expect(sender.stop).not.toHaveBeenCalled()
        unmount()
        expect(sender.stop).toHaveBeenCalledTimes(1)
    })
})
