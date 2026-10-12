import { describe, it, expect } from 'vitest'
import { Box3, BoxGeometry, ConeGeometry, Group, Mesh, Object3D, SpotLight, Vector3 } from 'three'
import { bodyBounds } from './selectionBounds.js'

const lampWithBeam = () => {
    const group = new Group()
    group.position.set(2, 0.3, -5)
    const head = new Mesh(new BoxGeometry(0.2, 0.2, 0.2))
    group.add(head)
    const beam = new Mesh(new ConeGeometry(2, 14, 8, 1, true))
    beam.position.set(0, 7, 0)
    beam.userData.noBounds = true
    group.add(beam)
    const light = new SpotLight()
    light.target.position.set(0, 14, 0)
    group.add(light, light.target)
    return { group, head, beam }
}

describe('bodyBounds: the selection box is the thing, never its beam', () => {
    it('leaves the beam cone out and keeps the lamp head', () => {
        const { group } = lampWithBeam()
        const box = bodyBounds(group)
        const size = box.getSize(new Vector3())
        expect(size.x).toBeCloseTo(0.2, 5)
        expect(size.y).toBeCloseTo(0.2, 5)
        expect(size.z).toBeCloseTo(0.2, 5)
        expect(box.getCenter(new Vector3()).toArray()).toEqual([2, 0.3, -5])
    })
    it('the same group through BoxHelper-style bounds (the old way) spans the whole throw — the fault, pinned', () => {
        const { group } = lampWithBeam()
        const old = new Box3().setFromObject(group)
        expect(old.getSize(new Vector3()).y).toBeGreaterThan(13)
    })
    it('skips helpers and a noBounds subtree with children, follows the world matrix, and is empty for a bare light', () => {
        const group = new Group()
        const helper = new Object3D(); helper.type = 'BoxHelper'; helper.add(new Mesh(new BoxGeometry(9, 9, 9)))
        group.add(helper)
        const rig = new Object3D(); rig.userData.noBounds = true; rig.add(new Mesh(new BoxGeometry(9, 9, 9)))
        group.add(rig)
        const body = new Mesh(new BoxGeometry(1, 1, 1)); body.position.set(10, 0, 0); body.scale.set(2, 2, 2)
        group.add(body)
        const box = bodyBounds(group)
        expect(box.min.toArray()).toEqual([9, -1, -1])
        expect(box.max.toArray()).toEqual([11, 1, 1])
        const bare = new Group(); bare.add(new SpotLight())
        expect(bodyBounds(bare).isEmpty()).toBe(true)
        expect(bodyBounds(null).isEmpty()).toBe(true)
    })
})
