import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { CONVERGE_CLIENT, stable, planConverge, readDocument } = require('./followConverge.js')

const project = (entities, extra = {}) => ({
    body: { projectMeta: { id: 'p', title: 'p', createdAt: 1, updatedAt: 2 }, version: 1, entities, nodes: [], assets: [], worldState: {}, ...extra },
    version: 7
})
const box = (id, x) => ({ id, type: 'box', components: { transform: { position: [x, 0, 0] } } })

describe('followConverge — the host wins when the copies disagree', () => {
    it('compares documents regardless of key order', () => {
        expect(stable({ a: 1, b: { c: 2, d: [1, { e: 3, f: 4 }] } })).toBe(stable({ b: { d: [1, { f: 4, e: 3 }], c: 2 }, a: 1 }))
    })

    it('says the copies agree when only the per-install stamps differ', () => {
        const local = project([box('b', 1)])
        const remote = project([box('b', 1)])
        remote.body.projectMeta = { id: 'p', title: 'p', createdAt: 99, updatedAt: 1234 }
        remote.body.version = 40
        remote.version = 4242
        expect(planConverge({ kind: 'project', projectId: 'p', local, remote })).toEqual({ same: true })
    })

    it('treats an asset URL a GET filled in as the empty URL it is stored with', () => {
        const local = project([], { assets: [{ id: 'a1', url: '' }] })
        const remote = project([], { assets: [{ id: 'a1', url: '/api/projects/p/assets/a1' }] })
        expect(planConverge({ kind: 'project', projectId: 'p', local, remote })).toEqual({ same: true })
    })

    it("writes the host's document over this one when the same field differs", () => {
        const local = project([box('b', 1)])
        const remote = project([box('b', 2)])
        const plan = planConverge({ kind: 'project', projectId: 'p', local, remote })
        expect(plan.baseVersion).toBe(7)
        expect(plan.op.type).toBe('replaceDocument')
        expect(plan.op.clientId).toBe(CONVERGE_CLIENT)
        expect(plan.op.payload.document.entities[0].components.transform.position[0]).toBe(2)
    })

    it('refuses to overwrite a full copy with an empty host', () => {
        const plan = planConverge({ kind: 'project', projectId: 'p', local: project([box('b', 1)]), remote: project([]) })
        expect(plan.refused).toMatch(/empty/)
    })

    it('handles the room (scene) the same way', () => {
        const local = { body: { version: 3, objects: [{ id: 'o', position: [0, 0, 0] }] }, version: 3 }
        const remote = { body: { version: 9, objects: [{ id: 'o', position: [5, 0, 0] }] }, version: 9 }
        const plan = planConverge({ kind: 'scene', local, remote })
        expect(plan.op.type).toBe('replaceScene')
        expect(plan.op.payload.scene.objects[0].position[0]).toBe(5)
    })

    it('reads both GET shapes and refuses what it cannot read', () => {
        expect(readDocument('project', { document: { entities: [] }, version: 3 })).toEqual({ body: { entities: [] }, version: 3 })
        expect(readDocument('scene', { scene: { objects: [] }, version: 2 })).toEqual({ body: { objects: [] }, version: 2 })
        expect(readDocument('project', { error: 'x' })).toBeNull()
        expect(planConverge({ kind: 'project', local: null, remote: project([]) }).refused).toBeTruthy()
    })
})
