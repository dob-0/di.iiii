import { describe, expect, it } from 'vitest'
import {
    METHODS,
    detectMethod,
    getMethod,
    layerNodesInScope,
    planMethod,
    resolveMethodFrames,
    resolveSlotFrame
} from './workspaceMethods.js'

const panel = (typeId, id, extra = {}) => ({
    id,
    typeId,
    parentId: null,
    label: id,
    values: { frame: { x: 10, y: 10, width: 300, height: 300, visible: true, ...(extra.frame || {}) } },
    ...extra
})

const viewport = { width: 1440, height: 900 }

describe('methods — the arrangement is what you change', () => {
    it('every built-in method names only registered types', () => {
        for (const method of METHODS) {
            for (const layer of method.layers) {
                expect(layer.typeId, `${method.id} → ${layer.typeId}`).toMatch(/^[a-z]+\.[a-z]+$/)
            }
        }
    })

    describe('rule 1 — a method hides, it never deletes', () => {
        it('puts an unwanted window out of the way instead of removing it', () => {
            const nodes = [panel('view.publish', 'pub')]
            const { ops } = planMethod(getMethod('arrange'), { nodes, viewport })
            const touchingPublish = ops.filter((op) => op.payload.nodeId === 'pub')
            expect(touchingPublish).toHaveLength(1)
            expect(touchingPublish[0].type).toBe('updateNode')
            expect(touchingPublish[0].payload.patch.values.frame.visible).toBe(false)
            expect(ops.some((op) => op.type === 'deleteNode')).toBe(false)
        })

        it('keeps the hidden window’s size and place, so flipping back costs nothing', () => {
            const nodes = [panel('view.publish', 'pub', { frame: { x: 640, y: 120, width: 420, height: 380 } })]
            const { ops } = planMethod(getMethod('arrange'), { nodes, viewport })
            const frame = ops.find((op) => op.payload.nodeId === 'pub').payload.patch.values.frame
            expect(frame).toMatchObject({ x: 640, y: 120, width: 420, height: 380, visible: false })
        })

        it('says nothing about a window that is already out of the way', () => {
            const nodes = [panel('view.publish', 'pub', { frame: { visible: false } })]
            const { ops } = planMethod(getMethod('arrange'), { nodes, viewport })
            expect(ops.some((op) => op.payload.nodeId === 'pub')).toBe(false)
        })
    })

    describe('rule 2 — a method summons a view, never content', () => {
        it('creates the panels it needs', () => {
            const { ops } = planMethod(getMethod('arrange'), { nodes: [], viewport })
            const created = ops.filter((op) => op.type === 'createNode').map((op) => op.payload.node.typeId)
            expect(created).toContain('view.outliner')
            expect(created).toContain('view.inspector')
            expect(created).toContain('view.library')
        })

        it('refuses to invent a Scene, and says so instead of quietly showing less', () => {
            const { ops, missing } = planMethod(getMethod('arrange'), { nodes: [], viewport })
            expect(ops.some((op) => op.type === 'createNode' && op.payload.node.typeId === 'universe.world')).toBe(false)
            expect(missing).toContain('universe.world')
        })

        it('reveals a Scene that already exists', () => {
            const nodes = [panel('universe.world', 'scene', { frame: { visible: false } })]
            const { ops, missing } = planMethod(getMethod('arrange'), { nodes, viewport })
            const scene = ops.find((op) => op.payload.nodeId === 'scene')
            expect(scene.payload.patch.values.frame.visible).toBe(true)
            expect(missing).not.toContain('universe.world')
        })

        it('un-minimizes what it reveals — a minimized window is still out of the way', () => {
            const nodes = [panel('view.inspector', 'insp', { frame: { visible: true, minimized: true } })]
            const { ops } = planMethod(getMethod('arrange'), { nodes, viewport })
            expect(ops.find((op) => op.payload.nodeId === 'insp').payload.patch.values.frame.minimized).toBe(false)
        })
    })

    describe('slots resolve against the live viewport', () => {
        it('lands inside a 390px phone as well as a 1440 desktop', () => {
            for (const size of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
                for (const slot of ['left', 'left-lower', 'right', 'centre', 'wide']) {
                    const frame = resolveSlotFrame(slot, { ...size, top: 64 })
                    expect(frame.x, `${slot} @ ${size.width}`).toBeGreaterThanOrEqual(0)
                    expect(frame.y).toBeGreaterThanOrEqual(64)
                    expect(frame.width).toBeGreaterThan(0)
                    expect(frame.height).toBeGreaterThan(0)
                }
            }
        })

        it('clears the topbar', () => {
            expect(resolveSlotFrame('left', { width: 1440, height: 900, top: 64 }).y).toBeGreaterThanOrEqual(64)
        })
    })

    // Seen at 390x844 DPR 3, and only seeable there: four windows planned
    // against a 1440 desktop were written into the shared document and arrived
    // on a phone as four full-bleed sheets stacked on each other, with the work
    // behind them. A layout resolved slot-by-slot cannot fix that; a layout
    // resolved as a SET can change shape for the screen it lands on.
    describe('a phone gets the phone’s own arrangement', () => {
        const phone = { width: 390, height: 844 }

        it('lands every window inside the screen', () => {
            const frames = resolveMethodFrames(getMethod('arrange'), { viewport: phone, workspaceTop: 64 })
            for (const [typeId, frame] of frames) {
                expect(frame.x, typeId).toBeGreaterThanOrEqual(0)
                expect(frame.x + frame.width, typeId).toBeLessThanOrEqual(390)
                expect(frame.y + frame.height, typeId).toBeLessThanOrEqual(844)
            }
        })

        it('keeps every layer — as a title bar, so nothing is dropped', () => {
            const frames = resolveMethodFrames(getMethod('arrange'), { viewport: phone, workspaceTop: 64 })
            expect(frames.size).toBe(4)
            const minimized = [...frames.values()].filter((frame) => frame.minimized)
            expect(minimized).toHaveLength(3)
        })

        it('opens exactly one, and never a layer that will not be there', () => {
            // An object-built project has no Scene node, and the room is
            // Arrange's declared primary — so the primary must fall through to
            // one that exists, or the phone shows bars over an empty band.
            const available = new Set(['view.outliner', 'view.library', 'view.inspector'])
            const frames = resolveMethodFrames(getMethod('arrange'), { viewport: phone, workspaceTop: 64, available })
            const open = [...frames.entries()].filter(([, frame]) => !frame.minimized)
            expect(open).toHaveLength(1)
            expect(available.has(open[0][0])).toBe(true)
        })

        it('leaves the bottom band clear for the thumb controls', () => {
            const frames = resolveMethodFrames(getMethod('arrange'), { viewport: phone, workspaceTop: 64 })
            const open = [...frames.values()].find((frame) => !frame.minimized)
            expect(844 - (open.y + open.height)).toBeGreaterThanOrEqual(96)
        })

        it('still spreads out on a desktop', () => {
            const frames = resolveMethodFrames(getMethod('arrange'), { viewport: { width: 1440, height: 900 }, workspaceTop: 64 })
            expect([...frames.values()].every((frame) => !frame.minimized)).toBe(true)
            const xs = new Set([...frames.values()].map((frame) => frame.x))
            expect(xs.size).toBeGreaterThan(1)
        })

        it('plans the phone layout end to end, not just in the resolver', () => {
            const { ops } = planMethod(getMethod('arrange'), { nodes: [], viewport: phone, workspaceTop: 64 })
            const created = ops.filter((op) => op.type === 'createNode')
            expect(created.length).toBeGreaterThan(0)
            for (const op of created) {
                const frame = op.payload.node.values.frame
                expect(frame.x + frame.width).toBeLessThanOrEqual(390)
            }
        })
    })

    describe('which method am I in — derived, never stored', () => {
        it('names the method when its layers are the ones showing', () => {
            const nodes = [
                panel('view.outliner', 'out'),
                panel('view.library', 'lib'),
                panel('view.inspector', 'insp'),
                panel('universe.world', 'scene')
            ]
            expect(detectMethod(nodes)).toBe('arrange')
        })

        it('answers null once you move past it — a starting point, not a mode', () => {
            const nodes = [
                panel('view.outliner', 'out'),
                panel('view.library', 'lib'),
                panel('view.inspector', 'insp'),
                panel('universe.world', 'scene'),
                panel('view.publish', 'pub')
            ]
            expect(detectMethod(nodes)).toBeNull()
        })

        it('still reads Arrange on a project that has no Scene to show', () => {
            const nodes = [
                panel('view.outliner', 'out'),
                panel('view.library', 'lib'),
                panel('view.inspector', 'insp')
            ]
            expect(detectMethod(nodes)).toBe('arrange')
        })

        it('reads Clear when everything is out of the way', () => {
            const nodes = [panel('view.inspector', 'insp', { frame: { visible: false } })]
            expect(detectMethod(nodes)).toBe('clear')
        })
    })

    it('only counts layers in the scope you are standing in', () => {
        const nodes = [panel('view.inspector', 'insp'), { ...panel('view.outliner', 'out'), parentId: 'elsewhere' }]
        expect(layerNodesInScope(nodes, null).map((node) => node.id)).toEqual(['insp'])
    })

    it('a round trip leaves nothing lost', () => {
        const start = [
            panel('view.publish', 'pub', { frame: { x: 640, y: 120, width: 420, height: 380 } }),
            panel('universe.world', 'scene')
        ]
        const away = planMethod(getMethod('clear'), { nodes: start, viewport })
        expect(away.ops.every((op) => op.type === 'updateNode')).toBe(true)
        // and the publish window's own geometry rode along untouched
        const hidden = away.ops.find((op) => op.payload.nodeId === 'pub').payload.patch.values.frame
        expect(hidden).toMatchObject({ x: 640, y: 120, width: 420, height: 380 })
    })
})
