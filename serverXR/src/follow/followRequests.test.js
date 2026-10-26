// @vitest-environment node

// How many requests one follow tick sends (DSC-7, 2026-10-26). The owner's installed
// di spent ~13 % of a core on request volume; a quiet tick asked the space's project
// list three times here and twice on the host, where once on each side is enough.

import http from 'node:http'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { side, startFollowing } = require('./follower.js')

const cleanups = []
afterEach(async () => { while (cleanups.length) await cleanups.pop()() })

// A quiet di.iiii that counts what it is asked, by method and path.
const countingSpace = async ({ projects = [{ id: 'proj-one', slug: 'proj-one', title: 'One' }] } = {}) => {
    const asked = []
    const server = http.createServer((req, res) => {
        const url = req.url || ''
        asked.push(`${req.method} ${url}`)
        const answer = () => {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            if (url.startsWith('/serverXR/api/spaces/s/projects')) res.end(JSON.stringify({ projects }))
            else if (url.startsWith('/serverXR/api/trash')) res.end(JSON.stringify({ items: [] }))
            else if (url.includes('/ops')) res.end(JSON.stringify({ ops: [], latestVersion: 1 }))
            else if (url.startsWith('/serverXR/api/spaces/s')) res.end(JSON.stringify({ space: { id: 's', label: 'S' } }))
            else res.end(JSON.stringify({ scene: { objects: [] }, version: 1, project: { id: 'proj-one' } }))
        }
        answer()
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${server.address().port}/serverXR`
    cleanups.push(() => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve) }))
    return { base, asked }
}

const until = async (check, ms = 8000) => {
    const end = Date.now() + ms
    while (Date.now() < end) {
        const value = check()
        if (value) return value
        await new Promise((resolve) => setTimeout(resolve, 20))
    }
    throw new Error('timed out waiting')
}

// Follow until the first tick has ended; what each side was asked by then.
const firstTick = async ({ host, local }) => {
    let first = null
    const follower = startFollowing({
        local: side({ base: local.base, spaceId: 's' }),
        remote: side({ base: host.base, spaceId: 's' }),
        log: { info() {}, warn() {} },
        // Called after every tick, before the next one starts.
        onState: () => { if (!first) first = { here: [...local.asked], there: [...host.asked] } }
    })
    cleanups.push(() => follower.stop())
    return until(() => first)
}

const listReads = (asked) => asked.filter(line => line.split('?')[0] === 'GET /serverXR/api/spaces/s/projects').length

describe('one tick reads the space\'s project list once on each side (DSC-7)', () => {
    it('refreshStreams, the space settings and the short names share one read here and one on the host', async () => {
        const host = await countingSpace()
        const local = await countingSpace()
        const tick = await firstTick({ host, local })
        const here = listReads(tick.here)
        const there = listReads(tick.there)
        // Said for the PR's numbers: every request of the first tick, both sides.
        console.info(`[DSC-7] first tick: ${tick.here.length} local + ${tick.there.length} host requests; project list ${here} here, ${there} on the host`)
        expect(here).toBe(1)
        expect(there).toBe(1)
    })

    it('a list a project was just made into is read afresh for the short names', async () => {
        // The host has a project this install has not: it is made here this tick,
        // so the local list read at the start of the tick is stale.
        const host = await countingSpace({ projects: [{ id: 'proj-one', slug: 'proj-one', title: 'One' }, { id: 'proj-two', slug: 'proj-two', title: 'Two' }] })
        const local = await countingSpace()
        const tick = await firstTick({ host, local })
        expect(tick.here.some(line => line.startsWith('POST /serverXR/api/spaces/s/projects'))).toBe(true)
        expect(listReads(tick.here)).toBe(3)
    })
})
