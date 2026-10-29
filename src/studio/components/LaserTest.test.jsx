import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { measureUnits, surfaceMeshes } from './LaserTest.jsx'

// A hall wall 10 m in front of a laser unit, a lamp body and a beam mesh in between that a ray must pass through.
const laser = (id, x, name = 'LaserCube 4 beam') => ({
    id, type: 'spotLight', name: `${name} ${id}`,
    components: { transform: { position: [x, 3, 0], rotation: [Math.PI / 2, 0, 0], scale: [1, 1, 1] }, light: {}, beam: { laser: { mW: [100, 100, 100] } } }
})
const entities = [
    { id: 'place-hall', type: 'model', name: 'hall', components: { venuePlan: {} } },
    { id: 'lamp-front', type: 'spotLight', components: { light: {} } },
    laser('rig-laser-41a', -0.1), laser('rig-laser-41b', 0.1)
]
const group = (id, pos = [0, 0, 0], rot = [0, 0, 0]) => {
    const g = new THREE.Group()
    g.userData = { svEntityId: id, svPick: 'other' }
    g.position.set(...pos); g.rotation.set(...rot)
    return g
}
const sceneOf = ({ wallZ = -10, wallRot = [0, 0, 0] } = {}) => {
    const scene = new THREE.Scene()
    const hall = group('place-hall')
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshBasicMaterial({ side: THREE.FrontSide }))
    wall.position.set(0, 3, wallZ); wall.rotation.set(...wallRot)
    wall.rotation.y += Math.PI // faces away from the laser: the cast must ignore winding
    hall.add(wall)
    const lamp = group('lamp-front', [0, 3, -5])
    lamp.userData.svPick = 'body'
    lamp.add(new THREE.Mesh(new THREE.BoxGeometry(40, 40, 0.2)))
    const beam = new THREE.Mesh(new THREE.BoxGeometry(40, 40, 0.2))
    beam.userData = { beamPick: true, noBounds: true }
    beam.position.z = -3
    for (const e of entities.filter((x) => x.id.startsWith('rig-laser'))) {
        const g = group(e.id, e.components.transform.position, e.components.transform.rotation)
        g.add(beam.clone())
        scene.add(g)
    }
    scene.add(hall, lamp)
    scene.updateMatrixWorld(true)
    return scene
}

describe('LaserTest: the rays land on the building, not on lamps or beams', () => {
    it('surfaceMeshes keeps the hall wall only', () => {
        const meshes = surfaceMeshes(sceneOf(), entities)
        expect(meshes).toHaveLength(1)
        expect(meshes[0].geometry.type).toBe('PlaneGeometry')
    })
    it('a unit of two lines throws a square of 2 d tan(H) at d = 10 m, half field 18.5 deg, centre 10 m', () => {
        const [sq, ...rest] = measureUnits(sceneOf(), entities)
        expect(rest).toHaveLength(0)
        expect(sq.unit).toBe('rig-laser-41')
        expect(sq.name).toBe('LaserCube 4')
        expect(sq.measure.complete).toBe(true)
        const side = 2 * 10 * Math.tan(18.5 * Math.PI / 180)
        expect(sq.measure.width).toBeCloseTo(side, 3)
        expect(sq.measure.height).toBeCloseTo(side, 3)
        expect(sq.measure.distance).toBeCloseTo(10, 3)
        expect(sq.label).toBe('LaserCube 4 · 6.7 × 6.7 m · 10.0 m')
    })
    it('move the unit back to z = +10 (wall now 20 m away): the square doubles — it follows the device', () => {
        const moved = entities.map((e) => (e.id.startsWith('rig-laser') ? { ...e, components: { ...e.components, transform: { ...e.components.transform, position: [e.components.transform.position[0], 3, 10] } } } : e))
        const scene = sceneOf()
        for (const o of scene.children) if (o.userData.svEntityId?.startsWith('rig-laser')) o.position.z = 10
        scene.updateMatrixWorld(true)
        const [sq] = measureUnits(scene, moved)
        expect(sq.measure.width).toBeCloseTo(2 * 20 * Math.tan(18.5 * Math.PI / 180), 3)
        expect(sq.measure.distance).toBeCloseTo(20, 3)
    })
    it('a field that points at nothing says so, not a size', () => {
        const [sq] = measureUnits(sceneOf({ wallZ: 500 }), entities)
        expect(sq.measure.complete).toBe(false)
        expect(sq.label).toBe('LaserCube 4 · no surface in reach')
    })
    it('the laser entity\'s own field half-angle is read (beam.laser.fieldHalfDeg)', () => {
        const wide = entities.map((e) => (e.id.startsWith('rig-laser') ? { ...e, components: { ...e.components, beam: { laser: { mW: [1, 1, 1], fieldHalfDeg: 30 } } } } : e))
        const [sq] = measureUnits(sceneOf(), wide)
        expect(sq.measure.width).toBeCloseTo(2 * 10 * Math.tan(30 * Math.PI / 180), 3)
    })
})
