import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { clipNodesOf, useClipVideos } from './useClipVideos.js'

// A fake engine and a fake clip player: the hook's whole job is the
// bookkeeping between them.
const made = []
const create = (values, { resolveAssetUrl }) => {
    const clip = {
        video: { id: `video-${made.length}` },
        values,
        url: resolveAssetUrl(values.asset),
        update: vi.fn((next) => { clip.values = next; clip.url = resolveAssetUrl(next.asset) }),
        dispose: vi.fn()
    }
    made.push(clip)
    return clip
}
const fakeEngine = () => {
    const videos = new Map()
    return { videos, setVideo: vi.fn((id, video) => { if (video) videos.set(id, video); else videos.delete(id) }) }
}
const network = (...nodes) => ({ nodes, wires: [] })
const clipNode = (id, values = {}) => ({ id, type: 'top.clip', values })

describe('useClipVideos', () => {
    it('finds only Clip In nodes, from a network or a node list', () => {
        const nodes = [clipNode('c1', { asset: 'x' }), { id: 'l', type: 'top.level', values: {} }]
        expect(clipNodesOf({ nodes })).toEqual([['c1', { asset: 'x' }]])
        expect(clipNodesOf(nodes)).toEqual([['c1', { asset: 'x' }]])
    })

    it('creates, updates and disposes a video per clip and hands it to the engine', () => {
        made.length = 0
        const engine = fakeEngine()
        const ref = { current: engine }
        const { rerender, unmount } = renderHook(
            ({ net }) => useClipVideos(net, { spaceId: 'space', engine: ref, assets: [{ id: 'a1', url: 'https://cdn.test/a1.mp4' }], create }),
            { initialProps: { net: network(clipNode('c1', { asset: 'a1' }), { id: 'lvl', type: 'top.level', values: {} }) } }
        )
        expect(made).toHaveLength(1)
        expect(made[0].url).toBe('https://cdn.test/a1.mp4')
        expect(engine.videos.get('c1')).toBe(made[0].video)

        // Same values, new object: nothing happens.
        rerender({ net: network(clipNode('c1', { asset: 'a1' })) })
        expect(made[0].update).not.toHaveBeenCalled()

        rerender({ net: network(clipNode('c1', { asset: 'a1', speed: 2 }), clipNode('c2', { asset: 'https://x.test/b.mp4' })) })
        expect(made[0].update).toHaveBeenCalledWith({ asset: 'a1', speed: 2 })
        expect(made).toHaveLength(2)
        expect(engine.videos.get('c2')).toBe(made[1].video)

        rerender({ net: network(clipNode('c2', { asset: 'https://x.test/b.mp4' })) })
        expect(made[0].dispose).toHaveBeenCalled()
        expect(engine.videos.has('c1')).toBe(false)

        unmount()
        expect(made[1].dispose).toHaveBeenCalled()
        expect(engine.videos.size).toBe(0)
    })

    it('gives the videos to a replacement engine', () => {
        made.length = 0
        const first = fakeEngine()
        const ref = { current: first }
        const { rerender } = renderHook(({ net }) => useClipVideos(net, { engine: ref, create }), {
            initialProps: { net: network(clipNode('c1', { asset: '/a.mp4' })) }
        })
        expect(first.videos.get('c1')).toBe(made[0].video)
        const second = fakeEngine()
        ref.current = second
        rerender({ net: network(clipNode('c1', { asset: '/a.mp4' })) })
        expect(second.videos.get('c1')).toBe(made[0].video)
        expect(made).toHaveLength(1)
    })
})
