import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { carry, side, startFollowing, cleartextManageRefusal } = require('./follower.js')

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

// A manage key never leaves this machine over plain http (review L2; owner
// 2026-10-07: any network). Its id starts with 'm', so its text says so.
describe('a manage key is sent only over https, or to this machine', () => {
    const manage = 'dii_sync_m0123456789abcdef.secret'
    const edit = 'dii_sync_0123456789abcdef.secret'
    it('refuses plain http to a LAN, a VPN and a public name; allows https and loopback', () => {
        for (const base of ['http://192.168.1.20:4000/serverXR', 'http://100.87.4.12:4000/serverXR', 'http://example.org/serverXR', 'http://studio.local/serverXR']) {
            expect(cleartextManageRefusal(base, manage)).toMatch(/only over https/)
        }
        for (const base of ['https://dev.diiii.xyz/serverXR', 'http://127.0.0.1:4000/serverXR', 'http://localhost:4000/serverXR']) {
            expect(cleartextManageRefusal(base, manage)).toBe(null)
        }
        expect(cleartextManageRefusal('http://192.168.1.20:4000/serverXR', edit)).toBe(null)
    })

    it('a follow given one over http does not start, sends nothing, and says why', async () => {
        const sent = []
        const follower = startFollowing({
            local: side({ base: 'http://127.0.0.1:9/serverXR', spaceId: 's' }),
            remote: side({ base: 'http://192.168.1.20:4000/serverXR', spaceId: 's', token: manage }),
            log: { warn: (message) => sent.push(message), info: () => {} }
        })
        expect(follower.state.status).toBe('refused')
        expect(follower.state.lastError).toMatch(/only over https/)
        expect(sent.join()).not.toMatch(/dii_sync_/)
        follower.stop()
    })
})
