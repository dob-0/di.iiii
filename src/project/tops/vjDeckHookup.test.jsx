import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The hookup of the VJ deck into the picture-operator runner (2026-09-24,
// feat/vj-land): a deck on the patch becomes Clip In → Blend → Level operators
// in the engine, its clips get real videos, and its master is drawn on its card
// and in its window at once. vjDeck.test.js covers expandDeck on its own; this
// file covers the three seams that were missing on dev, where the deck drew
// nothing: toTopNetwork, useTopNetwork's clip videos, and the thumbnails.

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
vi.mock('./pictureOut.js', () => ({ createPictureOut: () => ({ pump() {}, setOutputs() {}, stop() {}, outputs: () => [] }) }))

// A clip video stands in for the <video>: jsdom does not play media. The URL a
// clip resolves to is the part under test, so it is recorded.
const created = []
vi.mock('./clipVideos.js', async (importOriginal) => {
    const actual = await importOriginal()
    return {
        ...actual,
        createClipVideo: (values, { resolveAssetUrl }) => {
            const clip = { values, url: resolveAssetUrl(values.asset), video: { tag: 'video' }, update: vi.fn(), dispose: vi.fn() }
            created.push(clip)
            return clip
        }
    }
})

import { toTopNetwork, useTopNetwork } from './useTopNetwork.js'
import { registerTopThumbnail, topThumbnailGroups, topThumbnailsFor } from './topThumbnails.js'
import { clipNodeId, blendNodeId, masterNodeId, pictureIdOf, isPictureType } from './vjDeck.js'
import { hasCardPicture } from '../../raw/utils/cardGeometry.js'

const deckWith = (layers) => ({
    bpm: 120,
    master: 1,
    columns: 2,
    layers: layers.map((layer, index) => ({ id: `layer-${index + 1}`, name: `Layer ${index + 1}`, opacity: 1, blend: '0', trigger: 0, ...layer }))
})

const playingAsset = { active: 0, clips: [{ id: 'c1', kind: 'asset', asset: 'asset-mp4' }, null] }
const playingInput = { active: 0, clips: [{ id: 'c2', kind: 'input', input: 'in1' }, null] }

describe('toTopNetwork with a VJ deck on the patch', () => {
    it('expands the deck into its clip, blend and master, and a wire out of the deck reads the master', () => {
        const network = toTopNetwork({
            nodes: [
                { id: 'deck', typeId: 'vj.deck', values: { machine: '', deck: deckWith([playingAsset]) } },
                { id: 'out', typeId: 'top.out', values: {} }
            ],
            edges: [{ fromNodeId: 'deck', fromPort: 'out', toNodeId: 'out', toPort: 'a' }]
        })
        const ids = network.nodes.map((node) => node.id)
        expect(ids).not.toContain('deck')
        expect(ids).toEqual(expect.arrayContaining([clipNodeId('deck', 0), blendNodeId('deck', 0), masterNodeId('deck'), 'out']))
        expect(network.nodes.find((node) => node.id === clipNodeId('deck', 0))).toMatchObject({ type: 'top.clip', values: { asset: 'asset-mp4' } })
        expect(network.wires).toContainEqual({ from: masterNodeId('deck'), to: 'out', port: 'a' })
        expect(network.alias).toEqual({ deck: masterNodeId('deck') })
    })

    it('takes a picture wired into in1 as an input clip — the deck plays another operator', () => {
        const network = toTopNetwork({
            nodes: [
                { id: 'noise', typeId: 'top.noise', values: {} },
                { id: 'deck', typeId: 'vj.deck', values: { deck: deckWith([playingInput]) } }
            ],
            edges: [{ fromNodeId: 'noise', fromPort: 'out', toNodeId: 'deck', toPort: 'in1' }]
        })
        expect(network.wires).toContainEqual({ from: 'noise', to: blendNodeId('deck', 0), port: 'b' })
        // in1 is a deck port only: into an ordinary operator it is no picture input.
        const stray = toTopNetwork({
            nodes: [{ id: 'noise', typeId: 'top.noise', values: {} }, { id: 'blur', typeId: 'top.blur', values: {} }],
            edges: [{ fromNodeId: 'noise', fromPort: 'out', toNodeId: 'blur', toPort: 'in1' }]
        })
        expect(stray.wires).toEqual([])
    })

    it('a deck into a deck reads the upstream master', () => {
        const network = toTopNetwork({
            nodes: [
                { id: 'a', typeId: 'vj.deck', values: { deck: deckWith([playingAsset]) } },
                { id: 'b', typeId: 'vj.deck', values: { deck: deckWith([playingInput]) } }
            ],
            edges: [{ fromNodeId: 'a', fromPort: 'out', toNodeId: 'b', toPort: 'in1' }]
        })
        expect(network.wires).toContainEqual({ from: masterNodeId('a'), to: blendNodeId('b', 0), port: 'b' })
    })

    it('leaves a network with no deck exactly as before', () => {
        const network = toTopNetwork({
            nodes: [{ id: 'noise', typeId: 'top.noise', values: {} }, { id: 'out', typeId: 'top.out', values: {} }],
            edges: [{ fromNodeId: 'noise', fromPort: 'out', toNodeId: 'out', toPort: 'a' }]
        })
        expect(network.nodes.map((node) => node.id)).toEqual(['noise', 'out'])
        expect(network.wires).toEqual([{ from: 'noise', to: 'out', port: 'a' }])
    })
})

describe('useTopNetwork plays a deck\'s clips', () => {
    let frames
    beforeEach(() => {
        frames = []
        created.length = 0
        vi.stubGlobal('requestAnimationFrame', vi.fn((callback) => { frames.push(callback); return frames.length }))
        vi.stubGlobal('cancelAnimationFrame', vi.fn())
        for (const fn of Object.values(engine)) fn.mockClear?.()
    })
    afterEach(() => { vi.unstubAllGlobals() })

    it('hands the engine a video for the deck\'s clip, resolved against the PROJECT\'s files', () => {
        const document = {
            nodes: [{ id: 'deck', typeId: 'vj.deck', values: { deck: deckWith([playingAsset]) } }],
            edges: [],
            assets: [{ id: 'asset-mp4', name: 'loop.mp4', mimeType: 'video/mp4' }]
        }
        renderHook(() => useTopNetwork({ network: toTopNetwork(document), assets: document.assets, projectId: 'p1' }))
        expect(created).toHaveLength(1)
        expect(created[0].url).toContain('p1')
        expect(created[0].url).toContain('asset-mp4')
        expect(engine.setVideo).toHaveBeenCalledWith(clipNodeId('deck', 0), created[0].video)
    })

    it('draws a deck\'s master into every canvas registered for it — its card and its window', () => {
        const card = { canvas: { width: 1, height: 1 } }
        const window = { canvas: { width: 1, height: 1 } }
        const offCard = registerTopThumbnail(masterNodeId('deck'), card)
        const offWindow = registerTopThumbnail(masterNodeId('deck'), window)
        const document = { nodes: [{ id: 'deck', typeId: 'vj.deck', values: { deck: deckWith([playingAsset]) } }], edges: [] }
        renderHook(() => useTopNetwork({ network: toTopNetwork(document), thumbnails: true }))
        for (let i = 0; i < 3; i += 1) frames.shift()?.(i * 16)
        const drawnInto = engine.thumbnails.mock.calls.flatMap(([targets]) => [...targets.values()])
        expect(drawnInto).toContain(card)
        expect(drawnInto).toContain(window)
        offCard()
        expect(topThumbnailsFor(masterNodeId('deck'))).toEqual([window])
        offWindow()
        expect(topThumbnailGroups()).toEqual([])
    })
})

describe('the deck\'s card', () => {
    it('carries a picture, and the picture it shows is the master', () => {
        expect(isPictureType('vj.deck')).toBe(true)
        expect(hasCardPicture('vj.deck')).toBe(true)
        expect(pictureIdOf({ id: 'deck', typeId: 'vj.deck' })).toBe(masterNodeId('deck'))
        expect(pictureIdOf({ id: 'blur', typeId: 'top.blur' })).toBe('blur')
    })
})
