import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Which camera a Camera In opens, and what it says when it cannot. The engine is
// a stand-in (no WebGL in jsdom); the camera API is a fake whose devices, labels
// and failures each test sets. Guards the 2026-11-10 owner test: a named camera
// never falls to the default one, and a failure is reported with its error name.
const engine = {
    width: 640, height: 360, gl: { canvas: { width: 640, height: 360 } }, network: { nodes: [] },
    frame: vi.fn(), show: vi.fn(), has: vi.fn(() => true), thumbnails: vi.fn(), setNetwork: vi.fn(),
    setVideo: vi.fn(), setRemoteVideo: vi.fn(), errorFor: () => null, dispose: vi.fn()
}
vi.mock('./topEngine.js', () => ({ createTopEngine: vi.fn(() => engine) }))
vi.mock('./pictureOut.js', () => ({ createPictureOut: vi.fn(() => ({ pump: vi.fn(), setOutputs: vi.fn(), stop: vi.fn(), outputs: () => [] })) }))

import { toTopNetwork, useTopNetwork } from './useTopNetwork.js'
import { readTopReport } from './topReports.js'

const track = () => ({ label: 'T', stop: vi.fn(), getCapabilities: () => ({}), getSettings: () => ({}) })
const fakeStream = () => { const t = track(); return { getTracks: () => [t], getVideoTracks: () => [t] } }
const failure = (name) => Object.assign(new Error(name), { name })

let devices
let opened
let getUserMedia
let listeners
const setup = (impl) => {
    opened = []
    listeners = {}
    getUserMedia = vi.fn(async (constraints) => {
        opened.push(constraints)
        const error = impl?.(constraints)
        if (error) throw error
        return fakeStream()
    })
    vi.stubGlobal('navigator', {
        mediaDevices: {
            enumerateDevices: async () => devices,
            getUserMedia,
            addEventListener: (name, fn) => { listeners[name] = fn },
            removeEventListener: vi.fn()
        }
    })
}
let nodeCount = 0
const cameraDoc = (values) => {
    const id = `cam-${++nodeCount}`
    return { id, doc: { nodes: [{ id, typeId: 'top.camera', values }], edges: [] } }
}
const flush = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(0) }) }

beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    engine.setVideo.mockClear()
    devices = []
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('a Camera In opening its device', () => {
    it('reports a busy camera with its error name and opens by itself when it is freed (2 s, 4 s, 8 s back-off)', async () => {
        devices = [{ kind: 'videoinput', deviceId: 'p1', label: 'Phone' }]
        let busy = true
        setup(() => (busy ? failure('NotReadableError') : null))
        const { id, doc } = cameraDoc({ device: 'p1', deviceLabel: 'Phone' })
        renderHook(() => useTopNetwork({ network: toTopNetwork(doc) }))
        await flush()
        expect(readTopReport(id).camera).toMatchObject({ error: 'The camera is busy in another program.', errorName: 'NotReadableError', blocked: true })
        expect(engine.setVideo).not.toHaveBeenCalledWith(id, expect.anything())
        await act(async () => { await vi.advanceTimersByTimeAsync(1999) })
        expect(getUserMedia).toHaveBeenCalledTimes(1)
        await act(async () => { await vi.advanceTimersByTimeAsync(1) })
        expect(getUserMedia).toHaveBeenCalledTimes(2)
        await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
        expect(getUserMedia).toHaveBeenCalledTimes(3)
        await act(async () => { await vi.advanceTimersByTimeAsync(8000) })
        expect(getUserMedia).toHaveBeenCalledTimes(4)
        busy = false
        await act(async () => { await vi.advanceTimersByTimeAsync(8000) })
        expect(getUserMedia).toHaveBeenCalledTimes(5)
        expect(engine.setVideo).toHaveBeenCalledWith(id, expect.anything())
        expect(readTopReport(id).camera).toMatchObject({ error: null, errorName: null, blocked: false })
        await act(async () => { await vi.advanceTimersByTimeAsync(30000) })
        expect(getUserMedia).toHaveBeenCalledTimes(5)
    })

    it('a named camera with hidden labels asks permission once, then opens the named device, never the default', async () => {
        let allowed = false
        devices = null
        const list = () => [
            { kind: 'videoinput', deviceId: 'w1', label: allowed ? 'Integrated Webcam' : '' },
            { kind: 'videoinput', deviceId: 'p9', label: allowed ? 'Phone' : '' }
        ]
        setup(() => { allowed = true; return null })
        navigator.mediaDevices.enumerateDevices = async () => list()
        const { id, doc } = cameraDoc({ device: 'other-profile-id', deviceLabel: 'Phone' })
        renderHook(() => useTopNetwork({ network: toTopNetwork(doc) }))
        await flush()
        expect(opened[0]).toEqual({ video: true, audio: false })
        expect(opened.at(-1)).toEqual({ video: { deviceId: { exact: 'p9' } }, audio: false })
        expect(opened).toHaveLength(2) // the one permission probe, then the named device: the default is never kept
        expect(engine.setVideo).toHaveBeenCalledWith(id, expect.anything())
    })

    it('a named camera that is really absent reports not found, never opens the default, and opens on devicechange', async () => {
        devices = [{ kind: 'videoinput', deviceId: 'w1', label: 'Integrated Webcam' }]
        setup()
        const { id, doc } = cameraDoc({ device: 'x', deviceLabel: 'Phone' })
        renderHook(() => useTopNetwork({ network: toTopNetwork(doc) }))
        await flush()
        expect(readTopReport(id).camera).toMatchObject({ error: 'Camera "Phone" not found.', errorName: 'CameraNotFound', blocked: true })
        expect(getUserMedia).not.toHaveBeenCalled()
        devices = [...devices, { kind: 'videoinput', deviceId: 'p2', label: 'Phone' }]
        await act(async () => { listeners.devicechange() })
        await flush()
        expect(opened).toEqual([{ video: { deviceId: { exact: 'p2' } }, audio: false }])
        expect(readTopReport(id).camera.blocked).toBe(false)
    })

    it('a camera with neither label nor id still opens the default one', async () => {
        devices = [{ kind: 'videoinput', deviceId: 'w1', label: 'Integrated Webcam' }]
        setup()
        const { id, doc } = cameraDoc({})
        renderHook(() => useTopNetwork({ network: toTopNetwork(doc) }))
        await flush()
        expect(opened).toEqual([{ video: true, audio: false }])
        expect(engine.setVideo).toHaveBeenCalledWith(id, expect.anything())
    })

    it('a refusal by the person is reported and not retried', async () => {
        devices = [{ kind: 'videoinput', deviceId: 'p1', label: 'Phone' }]
        setup(() => failure('NotAllowedError'))
        const { id, doc } = cameraDoc({ device: 'p1', deviceLabel: 'Phone' })
        renderHook(() => useTopNetwork({ network: toTopNetwork(doc) }))
        await flush()
        expect(readTopReport(id).camera.errorName).toBe('NotAllowedError')
        await act(async () => { await vi.advanceTimersByTimeAsync(60000) })
        expect(getUserMedia).toHaveBeenCalledTimes(1)
    })
})
