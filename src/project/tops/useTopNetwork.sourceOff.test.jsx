import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The source switch seen from the picture network: a camera that is OFF is released, never opened
// and never reported as missing; the same camera that is really missing still is (the pin).
const engine = {
    width: 640, height: 360, gl: { canvas: { width: 640, height: 360 } }, network: { nodes: [] },
    frame: vi.fn(), show: vi.fn(), has: vi.fn(() => true), thumbnails: vi.fn(), setNetwork: vi.fn(),
    setVideo: vi.fn(), setRemoteVideo: vi.fn(), errorFor: () => null, dispose: vi.fn()
}
vi.mock('./topEngine.js', () => ({ createTopEngine: vi.fn(() => engine) }))
vi.mock('./pictureOut.js', () => ({ createPictureOut: vi.fn(() => ({ pump: vi.fn(), setOutputs: vi.fn(), stop: vi.fn(), outputs: () => [] })) }))

import { toTopNetwork, useTopNetwork } from './useTopNetwork.js'
import { readTopReport } from './topReports.js'
import { cameraSourceKey, inputSourceKey, resetSourcesOffForTest, setSourceOff } from './sourceSwitch.js'
import { createDeck, setClip } from './vjDeck.js'

let devices
let getUserMedia
let streams
const stubMedia = () => {
    streams = []
    getUserMedia = vi.fn(async () => {
        const t = { label: 'Front', stopped: false, stop() { this.stopped = true }, getCapabilities: () => ({}), getSettings: () => ({}) }
        const stream = { getTracks: () => [t], getVideoTracks: () => [t], clone: () => stream, track: t }
        streams.push(stream)
        return stream
    })
    vi.stubGlobal('navigator', {
        mediaDevices: { enumerateDevices: async () => devices, getUserMedia, addEventListener: vi.fn(), removeEventListener: vi.fn() }
    })
}
let count = 0
const cameraDoc = () => {
    const id = `cam-off-${++count}`
    return { id, doc: { nodes: [{ id, typeId: 'top.camera', values: { device: `dev-${count}`, deviceLabel: `Front${count}` } }], edges: [] }, label: `Front${count}`, device: `dev-${count}` }
}
const flush = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(0) }) }

beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    localStorage.clear(); resetSourcesOffForTest()
    engine.setVideo.mockClear()
    devices = []
    stubMedia()
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); localStorage.clear(); resetSourcesOffForTest() })

describe('a camera node and the source switch', () => {
    it('PIN: a really missing camera is reported missing, the same camera switched off is not', async () => {
        const missing = cameraDoc()
        renderHook(() => useTopNetwork({ network: toTopNetwork(missing.doc) }))
        await flush()
        expect(readTopReport(missing.id).camera).toMatchObject({ error: `Camera "${missing.label}" not found.`, blocked: true })

        const off = cameraDoc()
        setSourceOff(cameraSourceKey(off.label), true)
        renderHook(() => useTopNetwork({ network: toTopNetwork(off.doc) }))
        await flush()
        expect(readTopReport(off.id).camera?.error ?? null).toBeNull()
        expect(readTopReport(off.id).camera?.blocked ?? false).toBe(false)
    })
    it('off opens nothing; on opens it through the pool without a remount', async () => {
        const cam = cameraDoc()
        devices = [{ kind: 'videoinput', deviceId: cam.device, label: cam.label }]
        setSourceOff(cameraSourceKey(cam.label), true)
        const network = toTopNetwork(cam.doc)
        const { result, rerender } = renderHook(() => useTopNetwork({ network }))
        await flush()
        expect(getUserMedia).not.toHaveBeenCalled()
        expect(result.current.cameraError).toBe('')
        act(() => setSourceOff(cameraSourceKey(cam.label), false))
        await flush()
        expect(getUserMedia).toHaveBeenCalledTimes(1)
        expect(engine.setVideo).toHaveBeenCalledWith(cam.id, expect.anything())
        rerender()
    })
    it('off while open releases the stream at once and the engine drops the video', async () => {
        const cam = cameraDoc()
        devices = [{ kind: 'videoinput', deviceId: cam.device, label: cam.label }]
        const network = toTopNetwork(cam.doc)
        renderHook(() => useTopNetwork({ network }))
        await flush()
        expect(getUserMedia).toHaveBeenCalledTimes(1)
        act(() => setSourceOff(cameraSourceKey(cam.label), true))
        await flush()
        expect(streams[0].track.stopped).toBe(true)
        expect(engine.setVideo).toHaveBeenLastCalledWith(cam.id, null)
        expect(readTopReport(cam.id).camera?.error ?? null).toBeNull()
    })
})

describe('a deck input and the source switch', () => {
    const deckNetwork = () => {
        const deck = setClip(createDeck(), 0, 0, { id: 'c1', kind: 'input', input: 'in1', label: 'In 1' })
        deck.layers[0].active = 0
        const doc = {
            nodes: [
                { id: 'src', typeId: 'top.camera', values: { deviceLabel: '' } },
                { id: 'deck', typeId: 'vj.deck', values: { machine: '', deck } }
            ],
            edges: [{ fromNodeId: 'src', fromPort: 'out', toNodeId: 'deck', toPort: 'in1' }]
        }
        return toTopNetwork(doc)
    }
    it('off silences the input clip by its blend amount; nothing off is the same network object', async () => {
        const network = deckNetwork()
        const blend = () => engine.setNetwork.mock.calls.at(-1)[0].nodes.find((node) => node.id.endsWith('::L0::blend'))
        const { rerender } = renderHook(() => useTopNetwork({ network }))
        await flush()
        const before = blend().values.mix
        expect(before).toBeGreaterThan(0)
        act(() => setSourceOff(inputSourceKey('in1'), true))
        rerender()
        await flush()
        expect(blend().values.mix).toBe(0)
        act(() => setSourceOff(inputSourceKey('in1'), false))
        await flush()
        expect(blend().values.mix).toBe(before)
    })
})
