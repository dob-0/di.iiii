import { describe, expect, it } from 'vitest'
import { NODE_TYPES } from '../../project/nodeRegistry.js'
import { BEAM_STOPPING_NODE_KINDS, beamStopUserData, nodeStopsBeams } from './beamStops.js'

describe('where a beam stops in the Nodes scene', () => {
    it('every kind that stops a beam is a real node that stands in the scene', () => {
        for (const kind of BEAM_STOPPING_NODE_KINDS) expect(NODE_TYPES[kind]?.render, kind).toBe('spatial-3d')
    })

    it('a solid shape stops it; a lamp, a light, a line, a camera and a container do not', () => {
        for (const kind of ['geom.cube', 'geom.plane', 'geom.model']) expect(nodeStopsBeams(kind), kind).toBe(true)
        for (const kind of ['light.lamp', 'light.point', 'geom.line', 'world.camera', 'geom.geo']) expect(nodeStopsBeams(kind), kind).toBe(false)
    })

    it("tags the group with the building flag the reach probe looks for (beamReach.js)", () => {
        expect(beamStopUserData('geom.cube')).toEqual({ svBuilding: true })
        expect(beamStopUserData('geom.cube')).not.toBe(beamStopUserData('geom.cube'))
        expect(beamStopUserData('light.lamp')).toBeUndefined()
    })
})
