import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import RawGraphSurface from '../RawGraphSurface.jsx'
import { createEdge, createNode, NODE_TYPES } from '../../../project/nodeRegistry.js'
import { TOP_TYPE_IDS } from '../../../project/tops/topOperators.js'
import { isPictureType } from '../../../project/tops/vjDeck.js'
import {
    CARD_WIDTH,
    HEADER_HEIGHT,
    PORT_ROW_HEIGHT,
    TOP_PICTURE_HEIGHT,
    cardHeight
} from '../../utils/cardGeometry.js'
import { cardPreviewKind, hasCardPreview } from './previewTypes.js'
import { resolveCardPreview } from './resolvePreview.js'
import { createPreviewScheduler, PREVIEW_FPS } from './previewScheduler.js'

const makeNode = (typeId, overrides = {}) => ({
    ...createNode(typeId, { graphX: overrides.graphX ?? 0, graphY: overrides.graphY ?? 0 }),
    ...overrides
})

// What the card height was before previews existed: header, the port rows, a
// picture only for picture operators, the foot.
// A picture card (an operator, or a VJ deck showing its master) carries its picture.
const legacyHeight = (node) => {
    const type = NODE_TYPES[node.typeId]
    const rows = Math.max(type.inputs.length, type.outputs.length, 1)
    return HEADER_HEIGHT + rows * PORT_ROW_HEIGHT + (isPictureType(node.typeId) ? TOP_PICTURE_HEIGHT + 4 : 0) + 8
}

describe('which cards carry a preview', () => {
    it('is exactly the visible-making types — review this list when it changes', () => {
        const previewed = Object.keys(NODE_TYPES).filter(hasCardPreview).sort()
        expect(previewed).toEqual([
            'geom.circle', 'geom.cone', 'geom.constructor', 'geom.cube', 'geom.cylinder',
            'geom.array', 'geom.geo', 'geom.line', 'geom.plane', 'geom.sphere', 'geom.torus',
            'geom.transform', 'light.point', 'shape.merge', 'world.environment', 'world.light'
        ].sort())
    })

    it('sorts them into body, shape and light', () => {
        expect(cardPreviewKind('geom.cube')).toBe('body')
        expect(cardPreviewKind('geom.geo')).toBe('shape')
        expect(cardPreviewKind('shape.merge')).toBe('shape')
        expect(cardPreviewKind('light.point')).toBe('light')
        expect(cardPreviewKind('math.op')).toBe(null)
        expect(cardPreviewKind('media.audio')).toBe(null)
        expect(cardPreviewKind('nope.nothing')).toBe(null)
    })

    it('never overlaps the picture operators, which draw their own picture', () => {
        for (const typeId of TOP_TYPE_IDS) expect(hasCardPreview(typeId)).toBe(false)
    })
})

describe('card geometry with previews', () => {
    it('grows a previewed card by exactly one picture, and no other card at all', () => {
        for (const typeId of Object.keys(NODE_TYPES)) {
            const node = makeNode(typeId, { id: `n-${typeId}` })
            const grown = hasCardPreview(typeId) ? TOP_PICTURE_HEIGHT + 4 : 0
            expect(cardHeight(node), typeId).toBe(legacyHeight(node) + grown)
        }
    })

    it('keeps every port anchor where it was: the wire into a Cube lands on the same row', () => {
        const color = makeNode('value.color', { id: 'c', graphX: 0, graphY: 0 })
        const cube = makeNode('geom.cube', { id: 'k', graphX: 320, graphY: 40 })
        const sphere = makeNode('geom.sphere', { id: 's', graphX: 640, graphY: 300 })
        const edges = [
            createEdge('c', 'out', 'k', 'roughness', { id: 'e1' }),
            createEdge('k', 'geometry', 's', 'color', { id: 'e2' })
        ]
        const { container } = render(<RawGraphSurface nodes={[color, cube, sphere]} edges={edges} initialZoom={1} />)
        const paths = [...container.querySelectorAll('svg path')].map((path) => path.getAttribute('d'))
        const inputIndex = NODE_TYPES['geom.cube'].inputs.findIndex((port) => port.id === 'roughness')
        const outputIndex = NODE_TYPES['geom.cube'].outputs.findIndex((port) => port.id === 'geometry')
        const intoCube = `${cube.graphX} ${cube.graphY + HEADER_HEIGHT + inputIndex * PORT_ROW_HEIGHT + PORT_ROW_HEIGHT / 2}`
        const outOfCube = `M ${cube.graphX + CARD_WIDTH} ${cube.graphY + HEADER_HEIGHT + outputIndex * PORT_ROW_HEIGHT + PORT_ROW_HEIGHT / 2}`
        expect(paths.some((d) => d?.endsWith(intoCube))).toBe(true)
        expect(paths.some((d) => d?.startsWith(outOfCube))).toBe(true)
    })

    it('puts the preview below the last port row, only on previewed cards, only at port tiers', () => {
        const cube = makeNode('geom.cube', { id: 'k' })
        const op = makeNode('math.op', { id: 'm', graphX: 400 })
        const full = render(<RawGraphSurface nodes={[cube, op]} edges={[]} initialZoom={1} />)
        const previews = full.container.querySelectorAll('.raw-card-preview')
        expect(previews.length).toBe(1)
        const rows = Math.max(NODE_TYPES['geom.cube'].inputs.length, NODE_TYPES['geom.cube'].outputs.length)
        expect(previews[0].style.top).toBe(`${rows * PORT_ROW_HEIGHT + 4}px`)
        expect(previews[0].getAttribute('data-preview-kind')).toBe('body')
        full.unmount()

        const far = render(<RawGraphSurface nodes={[cube, op]} edges={[]} initialZoom={0.25} />)
        expect(far.container.querySelectorAll('.raw-card-preview').length).toBe(0)
        far.unmount()
    })
})

describe('resolveCardPreview', () => {
    it('carries the RESOLVED values — a wired colour, not the stale local one', () => {
        const color = makeNode('value.color', { id: 'c', values: { value: '#ff0000' } })
        const cube = makeNode('geom.cube', { id: 'k', values: { ...createNode('geom.cube').values, color: '#00ff00' } })
        const edges = [createEdge('c', 'out', 'k', 'color', { id: 'e' })]
        const resolved = resolveCardPreview(cube, { nodes: [color, cube], edges })
        expect(resolved.payload.kind).toBe('body')
        expect(resolved.payload.values.color).toBe('#ff0000')
        expect(resolved.spin).toBe(true)
    })

    it('gives the same fingerprint for the same document and a new one when a value changes', () => {
        const cube = makeNode('geom.cube', { id: 'k' })
        const a = resolveCardPreview(cube, { nodes: [cube], edges: [] })
        const b = resolveCardPreview({ ...cube }, { nodes: [{ ...cube }], edges: [] })
        expect(b.fingerprint).toBe(a.fingerprint)
        const bigger = { ...cube, values: { ...cube.values, size: [2, 2, 2] } }
        expect(resolveCardPreview(bigger, { nodes: [bigger], edges: [] }).fingerprint).not.toBe(a.fingerprint)
    })

    it('draws a Geo as the shapes standing inside it, and an empty one as nothing', () => {
        const geo = makeNode('geom.geo', { id: 'g' })
        const empty = resolveCardPreview(geo, { nodes: [geo], edges: [] })
        expect(empty.payload.descriptor).toBe(null)
        const inside = makeNode('geom.sphere', { id: 's', parentId: 'g' })
        const full = resolveCardPreview(geo, { nodes: [geo, inside], edges: [] })
        expect(full.payload.descriptor?.kind).toBe('group')
        expect(full.payload.descriptor.children[0].kind).toBe('sphere')
    })

    it('does not spin a light, and returns null for a type with no preview', () => {
        const lamp = makeNode('light.point', { id: 'l' })
        expect(resolveCardPreview(lamp, { nodes: [lamp] }).spin).toBe(false)
        expect(resolveCardPreview(makeNode('math.op', { id: 'm' }), { nodes: [] })).toBe(null)
    })
})

describe('preview scheduler', () => {
    const setup = ({ hidden = false } = {}) => {
        let t = 1000
        const frames = []
        const state = { hidden }
        const draw = vi.fn(() => true)
        const scheduler = createPreviewScheduler({
            draw,
            now: () => t,
            requestFrame: (callback) => { frames.push(callback); return frames.length },
            cancelFrame: () => {},
            isHidden: () => state.hidden
        })
        const runFrame = (advanceMs = 16) => {
            t += advanceMs
            const pending = frames.splice(0)
            pending.forEach((callback) => callback())
            return pending.length
        }
        return { scheduler, draw, runFrame, frames, state, advance: (ms) => { t += ms } }
    }
    const resolved = (fingerprint, spin = true) => ({ fingerprint, spin, payload: { kind: spin ? 'body' : 'light' } })

    it('draws only registered cards, and only once they have something to draw', () => {
        const { scheduler, draw, runFrame } = setup()
        const handle = scheduler.register({ canvas: {} })
        runFrame()
        expect(draw).not.toHaveBeenCalled()
        handle.update(resolved('a', false))
        runFrame()
        expect(draw).toHaveBeenCalledTimes(1)
        handle.unregister()
        expect(scheduler.entries()).toHaveLength(0)
        expect(scheduler.register(null)).toBe(null)
    })

    it('redraws a still card only when its fingerprint changes', () => {
        const { scheduler, draw, runFrame, frames } = setup()
        const handle = scheduler.register({})
        handle.update(resolved('a', false))
        runFrame()
        expect(draw).toHaveBeenCalledTimes(1)
        // Nothing changed: no redraw, and no frame is even requested.
        expect(handle.update(resolved('a', false))).toBe(false)
        expect(frames).toHaveLength(0)
        runFrame(1000)
        expect(draw).toHaveBeenCalledTimes(1)
        expect(handle.update(resolved('b', false))).toBe(true)
        runFrame()
        expect(draw).toHaveBeenCalledTimes(2)
    })

    it('keeps a card dirty until the renderer can actually draw it', () => {
        const { scheduler, draw, runFrame } = setup()
        draw.mockReturnValueOnce(false)
        const handle = scheduler.register({})
        handle.update(resolved('a', false))
        runFrame()
        runFrame()
        expect(draw).toHaveBeenCalledTimes(2)
        runFrame()
        expect(draw).toHaveBeenCalledTimes(2)
    })

    it('turns objects at the preview frame rate, not every animation frame', () => {
        const { scheduler, draw, runFrame } = setup()
        scheduler.register({}).update(resolved('a'))
        runFrame() // the change
        draw.mockClear()
        // One second of 60 Hz frames.
        for (let i = 0; i < 60; i += 1) runFrame(1000 / 60)
        expect(draw.mock.calls.length).toBeGreaterThanOrEqual(PREVIEW_FPS - 1)
        expect(draw.mock.calls.length).toBeLessThanOrEqual(PREVIEW_FPS + 1)
        const angles = draw.mock.calls.map(([, frame]) => frame.angle)
        expect(new Set(angles).size).toBe(angles.length)
    })

    it('shares a time budget round-robin, so many cards never cost many renders per frame', () => {
        let t = 0
        const draw = vi.fn(() => { t += 4; return true })
        const scheduler = createPreviewScheduler({
            draw, now: () => t, requestFrame: () => 1, cancelFrame: () => {}, isHidden: () => false, budgetMs: 6
        })
        const handles = Array.from({ length: 10 }, (_, index) => {
            const handle = scheduler.register({ index })
            handle.update(resolved(`f${index}`))
            return handle
        })
        expect(handles).toHaveLength(10)
        const first = scheduler.tick(t)
        expect(first.length).toBeLessThan(10)
        const seen = new Set(first)
        for (let i = 0; i < 20 && seen.size < 10; i += 1) {
            t += 1000
            scheduler.tick(t).forEach((key) => seen.add(key))
        }
        expect(seen.size).toBe(10)
    })

    it('stops requesting frames while the tab is hidden and resumes on wake', () => {
        const { scheduler, draw, runFrame, frames, state } = setup({ hidden: true })
        scheduler.register({}).update(resolved('a'))
        expect(frames).toHaveLength(0)
        expect(runFrame()).toBe(0)
        expect(draw).not.toHaveBeenCalled()
        state.hidden = false
        scheduler.wake()
        expect(frames).toHaveLength(1)
        runFrame()
        expect(draw).toHaveBeenCalled()
        state.hidden = true
        draw.mockClear()
        runFrame(1000)
        expect(draw).not.toHaveBeenCalled()
        expect(scheduler.isRunning()).toBe(false)
    })
})
