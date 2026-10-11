import { describe, expect, it } from 'vitest'
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three'
import { MOVE_STEP_PX, dragToTruck, resolveMoveStep, sceneLargestSide } from './worldMove.js'

function hall(length) {
    const g = new Group()
    const m = new Mesh(new BoxGeometry(20, 10, length), new MeshBasicMaterial())
    g.add(m); g.updateMatrixWorld(true)
    return [g]
}

describe('world move: a fixed step whatever the zoom', () => {
    it('the auto step is the scene\'s largest side / 40 (a 100 m hall: 2.5 m per 100 px)', () => {
        expect(sceneLargestSide(hall(100))).toBeCloseTo(100, 5)
        expect(resolveMoveStep(null, hall(100))).toBeCloseTo(2.5, 5)
        expect(resolveMoveStep(undefined, hall(4))).toBeCloseTo(0.5, 5)
    })
    it('the owner\'s own step wins over the scene, clamped to sane metres', () => {
        expect(resolveMoveStep(1.25, hall(100))).toBe(1.25)
        expect(resolveMoveStep(0, hall(100))).toBeCloseTo(2.5, 5)
        expect(resolveMoveStep(1e9, hall(100))).toBe(1000)
    })
    it('an empty scene still moves: 1 m per 100 px', () => {
        expect(resolveMoveStep(null, [])).toBe(1)
        expect(resolveMoveStep(null, [new Group()])).toBe(1)
    })
    it('240 px of drag is 240/100 steps, in the directions the pan had, at ANY zoom (no distance in the formula)', () => {
        expect(dragToTruck(240, 0, 2.5)).toEqual({ x: -6, y: 0 })
        expect(dragToTruck(0, MOVE_STEP_PX, 2.5)).toEqual({ x: -0, y: 2.5 })
    })
})
