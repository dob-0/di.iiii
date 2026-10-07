import { describe, expect, it } from 'vitest'
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene } from 'three'
import { clientToNdc, contentBoundary, isNavigationHelper, pickHit, pickPivot, selectionCenter } from './autoDepth.js'

const geo = new BoxGeometry(1, 1, 1)
const mat = new MeshBasicMaterial()
function box(z, x = 0) {
    const m = new Mesh(geo, mat)
    m.position.set(x, 0, z)
    m.updateMatrixWorld(true)
    return m
}
function cam() {
    const c = new PerspectiveCamera(50, 1, 0.1, 1000)
    c.position.set(0, 0, 10)
    c.lookAt(0, 0, 0)
    c.updateMatrixWorld(true)
    return c
}

describe('pickPivot', () => {
    it('hit: returns the front face point under the centre', () => {
        const p = pickPivot({ camera: cam(), ndc: [0, 0], objects: [box(0)] })
        expect(p.z).toBeCloseTo(0.5, 5)
    })
    it('miss: null', () => {
        expect(pickPivot({ camera: cam(), ndc: [0.9, 0.9], objects: [box(0)] })).toBeNull()
        expect(pickPivot({ camera: cam(), ndc: [0, 0], objects: [] })).toBeNull()
    })
    it('hidden mesh (or hidden parent) is skipped', () => {
        const hidden = box(2)
        hidden.visible = false
        const parent = new Group()
        parent.visible = false
        parent.add(box(3))
        const p = pickPivot({ camera: cam(), ndc: [0, 0], objects: [hidden, parent, box(0)] })
        expect(p.z).toBeCloseTo(0.5, 5)
    })
    it('helpers (noPick, *Helper, TransformControls*) are skipped', () => {
        const flagged = box(4)
        flagged.userData.noPick = true
        const gizmo = box(3)
        gizmo.type = 'TransformControlsGizmo'
        const helper = box(2)
        helper.type = 'BoxHelper'
        expect(isNavigationHelper(gizmo)).toBe(true)
        const p = pickPivot({ camera: cam(), ndc: [0, 0], objects: [flagged, gizmo, helper, box(0)] })
        expect(p.z).toBeCloseTo(0.5, 5)
    })
    it('nearest of two', () => {
        const p = pickPivot({ camera: cam(), ndc: [0, 0], objects: [box(-3), box(2)] })
        expect(p.z).toBeCloseTo(2.5, 5)
    })
    it('maxMeshes bounds the work', () => {
        const p = pickPivot({ camera: cam(), ndc: [0, 0], objects: [box(-3), box(2)], maxMeshes: 1 })
        expect(p.z).toBeCloseTo(-2.5, 5)
    })
    it('cost on 2000 boxes (reported, budget 4 ms median)', () => {
        const scene = new Scene()
        for (let i = 0; i < 2000; i += 1) {
            const m = new Mesh(geo, mat)
            m.position.set((i % 50) * 1.5 - 37, Math.floor(i / 50) * 1.5 - 30, -((i * 7) % 40))
            scene.add(m)
        }
        scene.updateMatrixWorld(true)
        const camera = cam()
        camera.position.set(0, 0, 60)
        camera.updateMatrixWorld(true)
        for (let i = 0; i < 5; i += 1) pickPivot({ camera, ndc: [0.1, 0.1], objects: [scene] }) // warm-up
        const times = []
        for (let i = 0; i < 50; i += 1) {
            const t0 = performance.now()
            pickPivot({ camera, ndc: [(i % 10) / 10 - 0.5, 0.2], objects: [scene] })
            times.push(performance.now() - t0)
        }
        times.sort((a, b) => a - b)
        const median = times[25]
        const p95 = times[47]
        console.log(`[pickPivot] 2000 boxes: median ${median.toFixed(3)} ms, p95 ${p95.toFixed(3)} ms, max ${times[49].toFixed(3)} ms (n=50)`)
        expect(median).toBeLessThan(4)
    })
})

describe('helpers', () => {
    it('clientToNdc maps corners and centre', () => {
        const rect = { left: 10, top: 20, width: 200, height: 100 }
        expect(clientToNdc(110, 70, rect)).toEqual([0, 0])
        expect(clientToNdc(10, 20, rect)).toEqual([-1, 1])
        expect(clientToNdc(0, 0, { width: 0, height: 0 })).toBeNull()
    })
    it('selectionCenter is the bounding box centre', () => {
        const c = selectionCenter([box(0, -2), box(0, 2)])
        expect(c.x).toBeCloseTo(0, 5)
        expect(selectionCenter([])).toBeNull()
    })
})

describe('contentBoundary', () => {
    const cuboid = (min, max) => {
        const g = new BoxGeometry(max[0] - min[0], max[1] - min[1], max[2] - min[2])
        const m = new Mesh(g)
        m.position.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2)
        m.updateMatrixWorld(true)
        return m
    }
    it('no content, no limit', () => {
        expect(contentBoundary([])).toBeNull()
        expect(contentBoundary(null)).toBeNull()
    })
    it('a 120 m hall is bounded by half its size on every side (60 m)', () => {
        const b = contentBoundary([cuboid([-60, 0, -60], [60, 20, 60])])
        expect(b.min.x).toBeCloseTo(-120, 3)
        expect(b.max.z).toBeCloseTo(120, 3)
        expect(b.min.y).toBeCloseTo(-60, 3)
    })
    it('a small thing still gets the 30 m minimum margin', () => {
        const b = contentBoundary([cuboid([0, 0, 0], [2, 2, 2])])
        expect(b.min.x).toBeCloseTo(-30, 3)
    })
    it('skips hidden roots', () => {
        const hidden = cuboid([500, 0, 500], [600, 10, 600])
        hidden.visible = false
        const b = contentBoundary([cuboid([0, 0, 0], [2, 2, 2]), hidden])
        expect(b.max.x).toBeLessThan(100)
    })
})

describe('pickHit', () => {
    it('names the tagged root that was hit', () => {
        const root = new Group()
        root.userData.svEntityId = 'lamp-1'
        const m = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial())
        root.add(m)
        root.position.set(0, 0, -5)
        root.updateMatrixWorld(true)
        const camera = new PerspectiveCamera(50, 1, 0.1, 100)
        camera.position.set(0, 0, 5)
        camera.lookAt(0, 0, 0)
        camera.updateMatrixWorld(true)
        const hit = pickHit({ camera, ndc: [0, 0], objects: [root] })
        expect(hit.root).toBe(root)
        expect(hit.point.z).toBeCloseTo(-4.5, 3)
    })
    it('nothing under the pointer: null', () => {
        const camera = new PerspectiveCamera(50, 1, 0.1, 100)
        camera.position.set(0, 0, 5)
        camera.updateMatrixWorld(true)
        expect(pickHit({ camera, ndc: [0, 0], objects: [] })).toBeNull()
    })
})
