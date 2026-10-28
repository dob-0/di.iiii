import { describe, expect, it } from 'vitest'
import { LASERCUBE_TYPE, beamDirection, laserCubesOf, laserSegments } from './laserView.js'

const cube = (id, rotation = [0, 0, 0]) => ({ id, type: 'spotLight', components: { transform: { position: [0, 5, 0], rotation }, light: { distance: 10 }, fixture: { type: LASERCUBE_TYPE } } })
const par = { id: 'rig-par-1', type: 'spotLight', components: { transform: { position: [0, 3, 0] }, fixture: { type: 'up-pl5403' } } }

describe('the laser view', () => {
    it('numbers the room’s LaserCubes as the server does, by entity id, and skips every other lamp', () => {
        const cubes = laserCubesOf([cube('rig-lasercube-cut-02'), par, cube('rig-lasercube-cut-01')])
        expect(cubes.map((c) => [c.entity.id, c.cubeId])).toEqual([['rig-lasercube-cut-01', 'cube-1'], ['rig-lasercube-cut-02', 'cube-2']])
    })
    it('turns a beam by the point’s place in the field: centre along the aim, the edge 30° off', () => {
        const aim = [0, 0, 1]
        expect(beamDirection(aim, 0, 0)).toEqual([0, 0, 1].map((v) => expect.closeTo(v, 6)))
        const right = beamDirection(aim, 1, 0)
        expect(Math.acos(right[2]) * 180 / Math.PI).toBeCloseTo(30, 4)
        const up = beamDirection(aim, 0, 1)
        expect(up[1]).toBeGreaterThan(0)
    })
    it('draws one segment a lit point, none for a blank one, the frame per cube over the frame for all', () => {
        const entities = [cube('rig-lasercube-cut-01'), cube('rig-lasercube-cut-02')]
        const frames = { all: [[0, 0, 1, 0, 0], [0.5, 0, 0, 0, 0]], byCube: { 'cube-2': [[0, 0, 0, 1, 0], [0, 0.5, 0, 1, 0], [0, 1, 0, 1, 0]] } }
        const s = laserSegments(entities, frames)
        expect(s.count).toBe(1 + 3)
        expect([...s.positions.slice(0, 3)]).toEqual([0, 5, 0])
        expect([...s.colors.slice(0, 3)]).toEqual([1, 0, 0])
    })
    it('draws nothing without frames', () => {
        expect(laserSegments([cube('rig-lasercube-cut-01')], null).count).toBe(0)
        expect(laserSegments([cube('rig-lasercube-cut-01')], { all: null, byCube: {} }).count).toBe(0)
    })
})
