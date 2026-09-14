import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEdge, createNode } from '../nodeRegistry.js'
import { createNodeGraphContext, evaluateNodeInput } from '../graph/nodeGraphRuntime.js'

// No WebGL in jsdom: the engine is replaced by a recorder at its module
// boundary, so what is tested is the runner's wiring — which slots it fills
// from the rest of the graph, and which pictures it hands back out.
const engines = []
vi.mock('./topEngine.js', () => ({
    createTopEngine: () => {
        const engine = {
            network: { nodes: [] },
            slots: new Set(),
            remoteVideos: new Map(),
            thumbnailCalls: [],
            setNetwork: vi.fn((next) => {
                engine.network = next
                engine.slots = new Set([...(next.nodes || []).map((node) => node.id), ...(next.remote || [])])
            }),
            setVideo: vi.fn(),
            setRemoteVideo: vi.fn((id, media) => { engine.remoteVideos.set(id, media) }),
            frame: vi.fn(),
            show: vi.fn(),
            thumbnails: vi.fn((targets) => { engine.thumbnailCalls.push([...targets.keys()]) }),
            errorFor: () => null,
            has: (id) => engine.slots.has(id),
            dispose: vi.fn()
        }
        engines.push(engine)
        return engine
    }
}))

const { splitNetwork, toTopNetwork, useTopNetwork } = await import('./useTopNetwork.js')
const { computeTopOutput } = await import('./topRuntime.js')

// Webcam -> Blur -> Monitor: the owner's first patch across the wall.
const doc = () => ({
    nodes: [
        createNode('source.webcam', { id: 'cam' }),
        createNode('top.blur', { id: 'blur' }),
        createNode('stream.monitor', { id: 'monitor' })
    ],
    edges: [
        createEdge('cam', 'frame', 'blur', 'a'),
        createEdge('blur', 'out', 'monitor', 'src')
    ]
})

describe('toTopNetwork — pictures across the wall', () => {
    it('reads a Webcam frame into an operator as a feed, and a Monitor wire as an export', () => {
        const network = toTopNetwork(doc())
        expect(network.nodes.map((node) => node.id)).toEqual(['blur'])
        expect(network.wires).toEqual([{ from: 'cam', to: 'blur', port: 'a' }])
        expect(network.feeds).toEqual([{ id: 'cam', port: 'frame' }])
        expect(network.exports).toEqual(['blur'])
    })

    it('an exported operator computed on another machine arrives as video; a feed is never asked of a machine', () => {
        const network = toTopNetwork({
            ...doc(),
            nodes: doc().nodes.map((node) => (node.id === 'blur' ? { ...node, values: { ...node.values, machine: 'pc' } } : node))
        })
        const split = splitNetwork(network, 'asuz')
        expect(split.remote).toEqual(['blur'])
        expect(split.remote).not.toContain('cam')
    })
})

describe('computeTopOutput', () => {
    it('hands on the published picture texture, and null where no runner is live', () => {
        const texture = { isTexture: true, image: {} }
        const node = { id: 'blur', typeId: 'top.blur' }
        expect(computeTopOutput(node, 'out', { context: { liveOutputs: new Map([['blur:out', texture]]) } })).toBe(texture)
        expect(computeTopOutput(node, 'out', { context: { liveOutputs: null } })).toBeNull()
    })

    it('a Monitor wired to a picture operator reads that texture through the graph', () => {
        const texture = { isTexture: true, image: {} }
        const document = doc()
        const monitor = document.nodes.find((node) => node.id === 'monitor')
        const context = createNodeGraphContext(document, { liveOutputs: new Map([['blur:out', texture]]) })
        expect(evaluateNodeInput(monitor, 'src', context)).toBe(texture)
    })
})

describe('useTopNetwork — the runner', () => {
    let frames = []
    beforeEach(() => {
        engines.length = 0
        frames = []
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { frames.push(cb); return frames.length })
        vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
        const create = document.createElement.bind(document)
        vi.spyOn(document, 'createElement').mockImplementation((tag, options) => {
            const element = create(tag, options)
            if (tag === 'canvas') element.getContext = () => ({ canvas: element, drawImage: () => {} })
            return element
        })
    })
    afterEach(() => vi.restoreAllMocks())

    const step = (count = 1) => {
        for (let i = 0; i < count; i += 1) {
            const next = frames.shift()
            act(() => { next?.(i * 16) })
        }
    }

    it('fills the Webcam slot from the feed media, and publishes then redraws the Blur picture', () => {
        const video = { tagName: 'VIDEO' }
        const network = toTopNetwork(doc())
        const onPicture = vi.fn()
        const onPicturesDrawn = vi.fn()
        const { unmount } = renderHook(() => useTopNetwork({
            network,
            feedMedia: (id, port) => (id === 'cam' && port === 'frame' ? video : null),
            onPicture,
            onPicturesDrawn
        }))
        const engine = engines[0]
        expect(engine.network.remote).toContain('cam')

        step(3)
        expect(engine.remoteVideos.get('cam')).toBe(video)
        expect(onPicture).toHaveBeenCalledWith('blur', expect.objectContaining({ width: 320, height: 180 }))
        expect(engine.thumbnailCalls.some((ids) => ids.includes('blur'))).toBe(true)
        expect(onPicturesDrawn).toHaveBeenCalledWith(['blur'])

        unmount()
        expect(onPicture).toHaveBeenLastCalledWith('blur', null)
    })

    it('pays nothing for pictures nobody outside the operators is looking at', () => {
        const network = toTopNetwork({ nodes: [createNode('top.blur', { id: 'blur' })], edges: [] })
        const onPicture = vi.fn()
        renderHook(() => useTopNetwork({ network, onPicture }))
        step(6)
        expect(onPicture).not.toHaveBeenCalled()
        expect(engines[0].thumbnails).not.toHaveBeenCalled()
    })

    it('never opens a camera on a page that may not ask (a public visitor)', async () => {
        const getUserMedia = vi.fn(() => new Promise(() => {}))
        navigator.mediaDevices = { getUserMedia, enumerateDevices: async () => [] }
        const network = toTopNetwork({ nodes: [createNode('top.camera', { id: 'camIn' })], edges: [] })
        const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })

        const visitor = renderHook(() => useTopNetwork({ network, cameras: false }))
        await flush()
        expect(getUserMedia).not.toHaveBeenCalled()
        visitor.unmount()

        // The same patch in the editor does open it — the flag is what differs.
        renderHook(() => useTopNetwork({ network, cameras: true }))
        await flush()
        expect(getUserMedia).toHaveBeenCalled()
        delete navigator.mediaDevices
    })
})
