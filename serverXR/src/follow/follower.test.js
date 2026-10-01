import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { carry, side } = require('./follower.js')

const stream = { key: 'project:p', kind: 'project', opsPath: '/api/projects/p/ops', writePath: '/api/projects/p/ops' }
const to = side({ base: 'http://target.invalid/serverXR', spaceId: 's' })

describe('carry — a refused write loses nothing', () => {
    it("does not mark the target's own new edits as carried when a write is refused with 409", async () => {
        // The target moved between our read and our write: someone there made
        // edit T1. The refusal hands T1 back. T1 has NOT been carried anywhere —
        // it still has to travel the other way on the next tick.
        const seen = new Set()
        const refusal = async () => ({ ok: false, status: 409, payload: { latestVersion: 9, pendingOps: [{ opId: 'T1', version: 9, type: 'updateEntity' }] } })
        const result = await carry({ to, stream, ops: [{ opId: 'S1', version: 4, type: 'updateEntity' }], seen, targetVersion: 8, send: refusal })
        expect(result.wrote).toBe(0)
        expect(result.targetVersion).toBe(9)
        expect(seen.has('T1')).toBe(false)
        expect(seen.has('S1')).toBe(false)
    })

    it('marks what it actually carried as seen when the write lands', async () => {
        const seen = new Set()
        const landed = async (_url, { body }) => ({ ok: true, status: 200, payload: { newVersion: 10, ops: body.ops } })
        const result = await carry({ to, stream, ops: [{ opId: 'S1', version: 4, type: 'updateEntity' }], seen, targetVersion: 9, send: landed })
        expect(result.wrote).toBe(1)
        expect(seen.has('S1')).toBe(true)
    })
})
