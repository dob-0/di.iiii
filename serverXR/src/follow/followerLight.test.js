// @vitest-environment node

import http from 'node:http'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { side, startFollowing } = require('./follower.js')

const cleanups = []
afterEach(async () => { while (cleanups.length) await cleanups.pop()() })

// A di.iiii that answers every read with a quiet, empty space — `delayMs` slow.
const quietSpace = async ({ delayMs = 0, status = 200, parkMs = 0 } = {}) => {
    const server = http.createServer((req, res) => {
        const answer = () => {
            res.writeHead(status, { 'Content-Type': 'application/json' })
            const url = req.url || ''
            if (url.includes('/projects')) res.end(JSON.stringify({ projects: [] }))
            else if (url.includes('/ops')) res.end(JSON.stringify({ ops: [], latestVersion: 1 }))
            else res.end(JSON.stringify({ scene: { objects: [] }, version: 1 }))
        }
        // A quiet room: the read with ?wait= is held (parked) until something moves.
        if (parkMs && (req.url || '').includes('wait=')) setTimeout(answer, parkMs)
        else if (delayMs && (req.url || '').includes('/projects')) setTimeout(answer, delayMs)
        else answer()
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${server.address().port}/serverXR`
    return { base, close: () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve) }) }
}

const until = async (check, ms = 8000) => {
    const end = Date.now() + ms
    while (Date.now() < end) {
        const value = check()
        if (value) return value
        await new Promise((resolve) => setTimeout(resolve, 50))
    }
    throw new Error('timed out waiting')
}

const follow = async ({ host, local }) => {
    const follower = startFollowing({
        local: side({ base: local.base, spaceId: 's' }),
        remote: side({ base: host.base, spaceId: 's' }),
        log: { info() {}, warn() {} }
    })
    cleanups.push(() => follower.stop())
    return follower
}

describe('what the follower says about the host, for the sync light', () => {
    it('measures how long the host took to answer a small read, and when it last answered', async () => {
        const host = await quietSpace({ delayMs: 120 })
        const local = await quietSpace()
        cleanups.push(host.close, local.close)
        const follower = await follow({ host, local })
        const state = await until(() => (follower.state.lastAnswerAt ? follower.state : null))
        expect(state.hostAnswering).toBe(true)
        expect(state.hostRefused).toBe(false)
        // The host held its answer 120 ms: that is what was measured, not 0 and not seconds.
        expect(state.latencyMs).toBeGreaterThanOrEqual(110)
        expect(state.latencyMs).toBeLessThan(2000)
        expect(Date.now() - state.lastAnswerAt).toBeLessThan(5000)
    })

    it('a quiet room is not "connecting" for the length of the park: it says following, answering, with a speed, before the host answers the parked read', async () => {
        const host = await quietSpace({ parkMs: 15_000 })
        const local = await quietSpace()
        cleanups.push(host.close, local.close)
        const startedAt = Date.now()
        const follower = await follow({ host, local })
        const state = await until(() => (follower.state.status === 'following' ? follower.state : null), 5000)
        expect(Date.now() - startedAt).toBeLessThan(5000)
        expect(state.hostAnswering).toBe(true)
        expect(state.latencyMs).toBeGreaterThanOrEqual(0)
        expect(state.lastAnswerAt).toBeGreaterThan(startedAt - 1)
    })

    it('says the host is not answering when it goes silent, and keeps when it last did answer', async () => {
        const host = await quietSpace()
        const local = await quietSpace()
        cleanups.push(local.close)
        const follower = await follow({ host, local })
        const before = await until(() => (follower.state.lastAnswerAt ? follower.state : null))
        await host.close()
        const after = await until(() => (follower.state.hostAnswering === false ? follower.state : null))
        expect(after.status).toBe('waiting')
        expect(after.lastAnswerAt).toBeGreaterThanOrEqual(before.lastAnswerAt)
        expect(after.lastAnswerAt).toBeLessThan(Date.now() - 100)
    })

    it('tells a host that answers and refuses (a revoked key) from one that is silent', async () => {
        const host = await quietSpace({ status: 401 })
        const local = await quietSpace()
        cleanups.push(host.close, local.close)
        const follower = await follow({ host, local })
        const state = await until(() => (follower.state.hostRefused ? follower.state : null))
        expect(state.hostAnswering).toBe(true)
        expect(state.status).toBe('waiting')
    })
})
