import { describe, expect, it } from 'vitest'
import { buildSpacesWorld, personNodeId, spaceNodeId } from './spacesWorld.js'
import { layoutMap } from './monitorMapLayout.js'

const spaces = [{ id: 'a', label: 'Alpha', isPublic: true }, { id: 'b', label: 'Beta' }]
const users = [
    { id: 'u1', displayName: 'Ana', role: 'editor', spaces: ['a', 'gone'] },
    { id: 'u2', email: 'root@x.io', role: 'admin', isUnrestricted: true, spaces: ['a'] }
]

describe('Spaces world data', () => {
    it('spaces sit on ring 1, people on ring 3, one line per granted space that exists', () => {
        const w = buildSpacesWorld(spaces, users, { globalSpaceId: 'a' })
        expect(w.nodes.filter((n) => n.kind === 'space').every((n) => n.ring === 1)).toBe(true)
        expect(w.nodes.find((n) => n.id === spaceNodeId('a')).stateLabel).toBe('live · guest')
        expect(w.edges).toEqual([{ from: personNodeId('u1'), to: spaceNodeId('a'), kind: 'member' }])
    })
    it('an unrestricted account gets no per-space lines and says so', () => {
        const w = buildSpacesWorld(spaces, users)
        expect(w.nodes.find((n) => n.id === personNodeId('u2')).stateLabel).toBe('admin · all spaces')
    })
    it('lays out through the Monitor engine with every node placed', () => {
        const w = buildSpacesWorld(spaces, users)
        const l = layoutMap(w)
        expect(l.pos.size).toBe(4)
        expect(l.tierIds).toHaveLength(2) // ring 1 = the spaces, joined to the hub
    })
    it('survives empty or missing lists', () => {
        expect(buildSpacesWorld(null, undefined)).toEqual({ nodes: [], edges: [] })
    })
})
