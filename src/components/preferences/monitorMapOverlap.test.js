import { describe, expect, it } from 'vitest'
import { layoutMap } from './monitorMapLayout.js'
import { demoMap } from './monitorMapDemo.js'
import { countOverlaps, measurePreset, planLabels, rectOf, stageBlockers } from './monitorMapOverlap.js'
import { PRESET_NAMES, presetPose, keyStep } from './monitorMapCamera.js'
import { buildEdgeLayers, laneKey, arc } from './monitorMapEdges.js'
import { PerspectiveCamera } from 'three'

const SIZES = [{ width: 1100, height: 600 }, { width: 390, height: 560 }]
const layout = layoutMap(demoMap(65))

describe('Monitor map 3D: no overlapping labels (65 nodes)', () => {
    it('the demo map has 65 nodes', () => expect(layout.nodes).toHaveLength(65))
    for (const size of SIZES) {
        for (const name of ['fit', ...PRESET_NAMES]) {
            it(`${name} at ${size.width}x${size.height}: 0 overlaps among labels, tools and hint`, () => {
                const r = measurePreset(layout, name, size)
                expect(r.after.overlaps).toBe(0)
                expect(r.after.shown).toBeGreaterThan(0)
            })
        }
    }
    it('the old rule did overlap (the guard has something to guard against)', () => {
        const r = measurePreset(layout, 'side', SIZES[0])
        expect(r.before.overlaps_at_fit).toBeGreaterThan(0)
    })
    it('a hovered node always shows its full card, even over others', () => {
        const items = [
            { id: 'a', kind: 'machine', label: 'aaaa', sx: 100, sy: 100, sz: 0.5 },
            { id: 'b', kind: 'repo', label: 'bbbb', sx: 104, sy: 102, sz: 0.5, full: true }
        ]
        const out = planLabels(items, SIZES[0], [])
        expect(out.shown.has('b')).toBe(true)
        expect(out.shown.has('a')).toBe(false)
    })
    it('countOverlaps counts touching pairs once', () => {
        expect(countOverlaps([{ ...rectOf(50, 50, 40, 20) }, { ...rectOf(60, 50, 40, 20) }, { ...rectOf(300, 300, 10, 10) }])).toBe(1)
        expect(stageBlockers({ width: 390, height: 560 }).some((b) => b.id === 'hint')).toBe(false)
    })
})

describe('Monitor map 3D: lane bundles and camera', () => {
    it('one bundle per lane pair, far fewer than edges, in a stable order', () => {
        const { bundles, edges } = buildEdgeLayers(layout)
        expect(edges.length).toBe(layout.edges.length)
        expect(bundles.length).toBeLessThan(edges.length / 4)
        expect(bundles.map((b) => b.key)).toEqual([...bundles.map((b) => b.key)].sort())
        expect(bundles.reduce((n, b) => n + b.count, 0)).toBe(edges.length)
        expect(laneKey('machine', 'tier')).toBe(laneKey('tier', 'machine'))
    })
    it('an arc leaves a, arrives at b and rises above the straight line', () => {
        const pts = arc([0, 0, 0], [4, 0, 0])
        expect(pts[0]).toEqual([0, 0, 0])
        expect(pts.at(-1).map((v) => Math.round(v * 1e6) / 1e6)).toEqual([4, 0, 0])
        expect(Math.max(...pts.map((p) => p[1]))).toBeGreaterThan(0.3)
    })
    it('the four presets look from four different sides at the same target', () => {
        const poses = PRESET_NAMES.map((n) => presetPose(layout, n, SIZES[0]))
        const keys = new Set(poses.map((p) => p.position.toArray().map((v) => Math.round(v)).join(',')))
        expect(keys.size).toBe(4)
        for (const p of poses) expect(p.dist).toBeGreaterThan(2)
    })
    it('arrows and WASD move along the floor, other keys do nothing', () => {
        const cam = new PerspectiveCamera(45, 1, 0.1, 100)
        cam.position.set(0, 5, 8); cam.lookAt(0, 0, 0); cam.updateMatrixWorld()
        const fwd = keyStep('w', cam, 1)
        expect(fwd.y).toBe(0)
        expect(fwd.z).toBeLessThan(0)
        expect(keyStep('ArrowRight', cam, 1).x).toBeGreaterThan(0)
        expect(keyStep('x', cam, 1)).toBeNull()
    })
})
