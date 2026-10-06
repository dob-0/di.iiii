import { describe, expect, it } from 'vitest'
import {
    SHEETS, boxesOf, freeEnds, roomCameraFor, chooseScale, dimension, fitView, hitTest, inMarquee, lampTransform, layRun, layoutLabels,
    nextUnit, pieceFootprint, piecesOf, placeNotes, ridersOf, rigExtent, scaleBar, sheetLayout, trussRuns, trussSegments, zoomView
} from './plotGeometry.js'
import { mountFromLens } from './lampGeometry.js'
import { typeById } from './fixtureTypes.js'
import { TYPE_LIBRARY } from './types/index.js'

const truss = (id, kind, x, y, z, yaw = 0, name = '') => ({ id, name, type: 'model', components: { transform: { position: [x, y, z], rotation: [0, yaw, 0], scale: [1, 1, 1] }, piece: { kind } } })

describe('scale and sheet', () => {
    it('picks the largest standard scale that fits', () => {
        const { drawing } = sheetLayout(SHEETS.A3)
        // A 24 x 60 m rig on A3's drawing area (~306 x 269 mm) needs 1:250 (60 m -> 240 mm).
        expect(chooseScale([24, 60], [drawing.w, drawing.h])).toBe(250)
        expect(chooseScale([8, 5], [drawing.w, drawing.h])).toBe(50)
        expect(chooseScale([5000, 5000], [100, 100])).toBe(2000)
    })

    it('lays A3 and A4 out landscape inside a 10 mm border', () => {
        const a3 = sheetLayout(SHEETS.A3)
        expect(a3.frame).toEqual({ x: 10, y: 10, w: 400, h: 277 })
        expect(a3.drawing.x + a3.drawing.w).toBeLessThanOrEqual(a3.side.x)
        const a4 = sheetLayout(SHEETS.A4)
        expect(a4.frame.w).toBe(277)
    })

    it('makes a scale bar of a round length whose paper length is right', () => {
        const bar = scaleBar(200, 60)
        expect(bar.metres).toBe(10)
        expect(bar.mm).toBe(50) // 10 m at 1:200 = 50 mm
        expect(bar.ticks.at(-1)).toEqual({ at: 50, label: '10' })
        expect(scaleBar(50, 60).metres).toBe(2)
    })
})

describe('footprints and hit-testing', () => {
    it('turns a truss with its yaw (three.js: +X turns toward -Z)', () => {
        const f = pieceFootprint({ kind: 'truss-3m', position: [0, 6, 0], yaw: Math.PI / 2 })
        const xs = f.outline.map((p) => p[0])
        const zs = f.outline.map((p) => p[1])
        expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(3)
        expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(0.29)
    })

    it('reads a tower\'s height from its scale', () => {
        const [p] = piecesOf([{ id: 't', type: 'model', components: { transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 7 / 6, 1] }, piece: { kind: 'tower' } } }])
        expect(p.height).toBeCloseTo(7)
        expect(p.w).toBe(0.8)
    })

    it('hits a lamp before the truss it hangs on, and nothing far away', () => {
        const pieces = piecesOf([truss('t1', 'truss-3m', 0, 6, 0)])
        const lamps = [{ id: 'l1', at: [0.25, 0], r: 0.25 }]
        expect(hitTest({ lamps, pieces }, [0.3, 0.05])).toBe('l1')
        expect(hitTest({ lamps, pieces }, [-1.2, 0.1])).toBe('t1')
        expect(hitTest({ lamps, pieces }, [5, 5])).toBeNull()
    })

    it('takes into a marquee what lies wholly inside it', () => {
        const pieces = piecesOf([truss('t1', 'truss-1m', 0, 6, 0), truss('t2', 'truss-3m', 5, 6, 0)])
        const lamps = [{ id: 'l1', at: [0, 0], r: 0.2 }]
        expect(inMarquee({ lamps, pieces }, [1, 1, -1, -1]).sort()).toEqual(['l1', 't1'])
    })

    it('draws a riser made of boxes by its footprint and skips the giant ones', () => {
        const boxes = boxesOf([
            { id: 'riser', type: 'box', components: { transform: { position: [1.65, 0, 5.2], rotation: [0, 0, 0], scale: [3, 1.2, 2] }, primitive: { size: [1, 1, 1] } } },
            { id: 'floor', type: 'box', components: { transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [200, 1, 200] }, primitive: { size: [1, 1, 1] } } }
        ])
        expect(boxes.map((b) => b.id)).toEqual(['riser'])
        expect(boxes[0].top).toBe(1.2)
    })
})

describe('truss runs', () => {
    it('stocks a run from 3, 2 and 1 m segments in whole metres', () => {
        expect(trussSegments(7)).toEqual([3, 3, 1])
        expect(trussSegments(18)).toEqual([3, 3, 3, 3, 3, 3])
        expect(trussSegments(4.4)).toEqual([3, 1])
        expect(trussSegments(0.2)).toEqual([1])
    })

    it('lays a run end to end along a snapped heading', () => {
        const run = layRun({ from: [-1.85, 5.1], to: [5.2, 5.05], y: 7 })
        expect(run.map((s) => s.kind)).toEqual(['truss-3m', 'truss-3m', 'truss-1m'])
        expect(run[0].position).toEqual([-0.35, 7, 5.1])
        expect(run[2].position).toEqual([4.65, 7, 5.1])
        expect(run.every((s) => s.yaw === 0)).toBe(true)
        const down = layRun({ from: [0, 0], to: [0, 3], y: 6 })
        // Pointing +z on the plan = local +X turned toward +Z = yaw -90°.
        expect(down[0].yaw).toBeCloseTo(-Math.PI / 2)
        expect(down[0].position[2]).toBeCloseTo(1.5)
    })

    it('finds a run from its joined pieces and measures it', () => {
        const entities = layRun({ from: [0, 0], to: [7, 0], y: 7 }).map((s, i) => truss(`s${i}`, s.kind, ...s.position, s.yaw, i === 1 ? 'header' : ''))
        entities.push(truss('lone', 'truss-2m', 0, 7, 10))
        const runs = trussRuns(piecesOf(entities))
        expect(runs).toHaveLength(2)
        expect(runs[0]).toMatchObject({ ids: ['s0', 's1', 's2'], name: 'header', from: [0, 0], to: [7, 0], length: 7, height: 7 })
        expect(runs[1].length).toBe(2)
    })

    it('calls out a run end with no tower under it', () => {
        const entities = layRun({ from: [0, 0], to: [6, 0], y: 6 }).map((s, i) => truss(`s${i}`, s.kind, ...s.position, s.yaw))
        entities.push({ id: 'tw', type: 'model', components: { transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 5.855 / 6, 1] }, piece: { kind: 'tower' } } })
        const pieces = piecesOf(entities)
        expect(freeEnds(trussRuns(pieces), pieces)).toEqual([{ run: 's0', at: [6, 0] }])
    })

    it('knows which lamps ride on a truss (hung at a slot) and which do not', () => {
        const [piece] = piecesOf([truss('t', 'truss-2m', 0, 6, 0)])
        const lamps = [
            { id: 'on', mount: [-0.75, 6 - 0.145, 0] },
            { id: 'off', mount: [-0.75, 0, 0] }
        ]
        expect(ridersOf(piece, lamps)).toEqual(['on'])
    })
})

describe('lamps', () => {
    const type = typeById(TYPE_LIBRARY, 'up-250bsw')

    it('puts a hung lamp\'s lens below its clamp and a standing one\'s above its base', () => {
        const hung = lampTransform({ mount: [1, 5.855, 5], hung: true, type })
        expect(hung.rotation).toEqual([0, 0, 0])
        expect(hung.position[1]).toBeCloseTo(5.855 - type.model3d.lensY)
        const back = mountFromLens({ lens: hung.position, hung: true, beam: [0, -1, 0], type })
        expect(back[1]).toBeCloseTo(5.855)
        const standing = lampTransform({ mount: [0, 0, 0], hung: false, type })
        expect(standing.rotation[0]).toBeCloseTo(Math.PI)
        expect(standing.position[1]).toBeCloseTo(type.model3d.lensY)
    })

    it('numbers the next unit on a position', () => {
        const entities = [{ components: { fixture: { position: 'header', unit: 4 } } }, { components: { fixture: { position: 'other', unit: 9 } } }]
        expect(nextUnit(entities, 'header')).toBe(5)
        expect(nextUnit(entities, 'new')).toBe(1)
    })
})

describe('label layout', () => {
    it('puts a label below its symbol when that is free, else somewhere free', () => {
        const items = [
            { id: 'a', at: [0, 0], r: 1, w: 4, h: 1 },
            { id: 'b', at: [0, 4], r: 1, w: 4, h: 1 }
        ]
        const out = layoutLabels(items)
        expect(out.get('a').box).toEqual([-2, 1, 2, 2])
        expect(out.get('a').clear).toBe(true)
        // b's "below" is free too; now a third whose below and above are taken.
        const three = layoutLabels([...items, { id: 'c', at: [0, 2.5], r: 0.2, w: 1, h: 1 }])
        expect(three.get('c').anchor).not.toBe('middle')
        expect(three.get('c').clear).toBe(true)
    })

    it('never places two labels on one another when a free place exists', () => {
        const items = Array.from({ length: 6 }, (_, i) => ({ id: `l${i}`, at: [i * 1.2, 0], r: 0.3, w: 1, h: 0.4 }))
        const out = layoutLabels(items)
        const boxes = [...out.values()].map((v) => v.box)
        for (let i = 0; i < boxes.length; i++) {
            for (let j = i + 1; j < boxes.length; j++) {
                const [a, b] = [boxes[i], boxes[j]]
                const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0])
                const h = Math.min(a[3], b[3]) - Math.max(a[1], b[1])
                expect(w > 1e-9 && h > 1e-9).toBe(false)
            }
        }
    })
})

describe('dimensions and the view', () => {
    it('offsets a dimension line and keeps its figure readable', () => {
        const d = dimension([0, 0], [7, 0], -1)
        expect(d.length).toBe(7)
        expect(d.a).toEqual([0, -1])
        expect(d.angle).toBe(0)
        expect(dimension([0, 0], [-3, 0]).angle).toBe(0)
        expect(Math.abs(dimension([0, 0], [0, 3]).angle)).toBe(90)
    })

    it('fits an extent into a box and zooms about a point', () => {
        const v = fitView([0, 0, 10, 10], [1000, 500], 0)
        expect(v).toEqual([-5, 0, 20, 10])
        const z = zoomView(v, 2, [5, 5])
        expect(z).toEqual([0, 2.5, 10, 5])
    })

    it('opens the room camera inside the walls', () => {
        const cam = roomCameraFor([-38, -12, 38, 54], [-36.4, -54.5, 60.4, 54.5], true)
        expect(cam.position[2]).toBeLessThanOrEqual(52.5)
        expect(cam.position[1]).toBe(6)
        expect(cam.fov).toBe(75)
        expect(roomCameraFor([0, 0, 10, 10]).position[2]).toBeLessThan(10)
    })

    it('frames what is rigged, and the venue when nothing is', () => {
        expect(rigExtent({ lamps: [{ at: [1, 2] }, { at: [3, 5] }] }, null, 1)).toEqual([0, 1, 4, 6])
        expect(rigExtent({}, [0, 0, 9, 9])).toEqual([0, 0, 9, 9])
    })
})

describe('placeNotes', () => {
    it('takes the first clear spot, leaves out a note with none, and keeps a dimension', () => {
        const blockers = [[0, 0, 10, 2]]
        const out = placeNotes([
            { id: 'a', boxes: [[1, 0, 5, 1], [1, 3, 5, 4]] },
            { id: 'b', boxes: [[2, 3, 6, 4]] },
            { id: 'c', boxes: [[0, 0, 4, 1]] },
            { id: 'dim', keep: true, boxes: [[0, 0, 4, 1], [3, 3, 7, 4]] }
        ], blockers)
        expect(out.get('a')).toBe(1)
        expect(out.get('b')).toBe(-1)
        expect(out.get('c')).toBe(-1)
        // the dimension's second box overlaps note a's placed box: both cost something, the least is kept
        expect(out.get('dim')).toBeGreaterThanOrEqual(0)
    })
})
