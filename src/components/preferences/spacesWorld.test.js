import { describe, expect, it } from 'vitest'
import { buildSpacesWorld, layoutSpacesWorld, personNodeId, spaceNodeId } from './spacesWorld.js'
import { layoutMap, sizeOf } from './monitorMapLayout.js'

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

describe('Spaces world clustered layout', () => {
    const many = {
        spaces: Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, label: `Space ${i}`, isPublic: i % 2 === 0 })),
        users: Array.from({ length: 14 }, (_, i) => ({
            id: `u${i}`, displayName: `Person ${i}`, role: 'editor', isUnrestricted: i % 7 === 0,
            spaces: [`s${i % 8}`, ...(i % 3 === 0 ? [`s${(i + 1) % 8}`] : [])]
        }))
    }
    const rect = (l, id) => { const p = l.pos.get(id); const n = l.nodes.find((x) => x.id === id); const { w, h } = sizeOf(n.kind); return { x0: p.x - w / 2, x1: p.x + w / 2, y0: p.y - h / 2, y1: p.y + h / 2 } }

    it('no two cards overlap (names never collide), for a small and a big world', () => {
        for (const [spaces, users] of [[[{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], [{ id: 'u1', spaces: ['a'] }, { id: 'u2', spaces: ['a'] }, { id: 'u3', isUnrestricted: true }]], [many.spaces, many.users]]) {
            const l = layoutSpacesWorld(buildSpacesWorld(spaces, users))
            const ids = l.nodes.map((n) => n.id)
            for (let i = 0; i < ids.length; i += 1) {
                for (let j = i + 1; j < ids.length; j += 1) {
                    const a = rect(l, ids[i]); const b = rect(l, ids[j])
                    const hit = a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0
                    expect(hit, `${ids[i]} overlaps ${ids[j]}`).toBe(false)
                }
            }
        }
    })

    it('a person stands nearer to their own space than the average space is', () => {
        const l = layoutSpacesWorld(buildSpacesWorld(many.spaces, many.users))
        const d = (a, b) => Math.hypot((l.pos.get(a).x - l.pos.get(b).x) / l.aspect, l.pos.get(a).y - l.pos.get(b).y)
        const own = []
        const all = []
        for (const u of many.users.filter((x) => !x.isUnrestricted)) {
            own.push(d(personNodeId(u.id), spaceNodeId(u.spaces[0])))
            for (const s of many.spaces) all.push(d(personNodeId(u.id), spaceNodeId(s.id)))
        }
        const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length
        expect(mean(own)).toBeLessThan(mean(all) * 0.8)
    })

    it('is deterministic and keeps every node', () => {
        const w = buildSpacesWorld(many.spaces, many.users)
        const a = layoutSpacesWorld(w)
        const b = layoutSpacesWorld(w)
        expect([...a.pos.entries()]).toEqual([...b.pos.entries()])
        expect(a.pos.size).toBe(8 + 14)
    })
})
