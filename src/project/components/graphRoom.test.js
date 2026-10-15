// @vitest-environment node
//
// Regression guard (2026-10-15, MOXIR v2-11): a document whose only node was a VJ Deck was drawn by the node lane's
// RawViewport on the public page — no HDR path, no exposure, no haze — and its room went near black (mean luma 10.5
// vs the Studio's 68.5 /255, same look, same camera). The graph surface is for graphs that DRAW in the room.
import { describe, expect, it } from 'vitest'
import { getNodeType } from '../nodeRegistry.js'
import { graphMakesRoom, WORLD_NODE_TYPE } from './graphRoom.js'

const node = (typeId) => ({ id: `n-${typeId}`, typeId })

describe('graphMakesRoom', () => {
    it('a VJ Deck alone draws nothing in the room: the room keeps its own renderer', () => {
        expect(graphMakesRoom([node('vj.deck')], getNodeType)).toBe(false)
    })
    it('no nodes, or nodes of no known type, make no room', () => {
        expect(graphMakesRoom([], getNodeType)).toBe(false)
        expect(graphMakesRoom(undefined, getNodeType)).toBe(false)
        expect(graphMakesRoom([node('no.such.type')], getNodeType)).toBe(false)
    })
    it('a spatial node (a cube) makes the room: the graph surface draws it', () => {
        expect(getNodeType('geom.cube')?.render).toBe('spatial-3d')
        expect(graphMakesRoom([node('vj.deck'), node('geom.cube')], getNodeType)).toBe(true)
    })
    it('a Scene (World) node makes the room', () => {
        expect(graphMakesRoom([node(WORLD_NODE_TYPE)], getNodeType)).toBe(true)
    })
})
