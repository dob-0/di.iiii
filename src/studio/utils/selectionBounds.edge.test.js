// Edges of the selection box that selectionBounds.test.js (on #891) leaves open: the box fits the lamp, not its beam.
import { describe, expect, it } from 'vitest'
import { Box3, BoxGeometry, ConeGeometry, Group, Mesh, Object3D, Vector3 } from 'three'
import { bodyBounds } from './selectionBounds.js'
import spotLightSource from '../../objectComponents/SpotLightObject.jsx?raw'

describe('bodyBounds: more ways the box must stay on the lamp', () => {
    it('a rotated, scaled lamp group still gives the head, not the beam pointing across the room', () => {
        const lamp = new Group()
        lamp.position.set(0, 4, 0); lamp.rotation.x = Math.PI / 2; lamp.scale.setScalar(2)
        lamp.add(new Mesh(new BoxGeometry(0.2, 0.2, 0.2)))
        const beam = new Mesh(new ConeGeometry(2, 14, 8, 1, true)); beam.position.y = 7; beam.userData.noBounds = true
        lamp.add(beam)
        const size = bodyBounds(lamp).getSize(new Vector3())
        expect(Math.max(size.x, size.y, size.z)).toBeCloseTo(0.4, 5) // 0.2 x scale 2
    })
    it('a noBounds mesh that is also the only geometry gives an empty box, not the beam', () => {
        const only = new Mesh(new ConeGeometry(1, 10, 8)); only.userData.noBounds = true
        expect(bodyBounds(only).isEmpty()).toBe(true)
    })
    it('TransformControls and gizmo helpers are skipped like BoxHelper', () => {
        const g = new Group(); const gizmo = new Object3D(); gizmo.type = 'TransformControlsGizmo'; gizmo.add(new Mesh(new BoxGeometry(50, 50, 50)))
        g.add(gizmo, new Mesh(new BoxGeometry(1, 1, 1)))
        expect(bodyBounds(g).getSize(new Vector3()).x).toBe(1)
    })
    it('the target is emptied first and returned: a reused Box3 never keeps the last selection', () => {
        const target = new Box3(new Vector3(-100, -100, -100), new Vector3(100, 100, 100))
        const out = bodyBounds(new Mesh(new BoxGeometry(1, 1, 1)), target)
        expect(out).toBe(target)
        expect(target.getSize(new Vector3()).x).toBe(1)
        expect(bodyBounds(new Group(), target).isEmpty()).toBe(true)
    })
})

// The beams are the three meshes of SpotLightObject that already opt out of picking (raycast null). UNVERIFIED at render time:
// no three renderer is available in this unit lane, so this pins the source, not the scene graph.
describe('SpotLightObject: every beam mesh that opts out of picking opts out of the selection box', () => {
    const src = spotLightSource
    it('each beam <mesh ... beamPick ...> carries userData noBounds', () => {
        // since 2026-10-13 (pickPriority.js) the beams take a click as the last choice: they carry beamPick, not raycast null
        const tags = src.match(/<mesh\b[^>]*beamPick:\s*true[^>]*>/gs) || []
        expect(tags.length).toBeGreaterThanOrEqual(3)
        for (const tag of tags) expect(tag).toMatch(/userData=\{\{\s*noBounds:\s*true,\s*beamPick:\s*true\s*\}\}/)
    })
})
