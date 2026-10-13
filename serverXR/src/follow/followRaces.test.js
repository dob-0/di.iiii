// @vitest-environment node

import http from 'node:http'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { side, startFollowing } = require('./follower.js')

// The three interleavings the follow audit (docs/ai/audits/follow-audit-2026-10-04.md)
// could only call PLAUSIBLE, because two real servers never land a write at the
// exact microsecond between two reads. Here each side is a small install in this
// process that answers the routes the follower uses, the way serverXR does, and
// lets a test put an edit precisely in the gap. followIntegration.test.js proves
// the wire on real servers; this proves the follower survives the timing.

vi.setConfig({ testTimeout: 20_000 })

const SPACE = 'race-room'
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms))

const settle = async (label, probe, { timeout = 6000, every = 50 } = {}) => {
    const deadline = Date.now() + timeout
    let last = null
    while (Date.now() < deadline) {
        last = await probe()
        if (last) return last
        await wait(every)
    }
    throw new Error(`${label} — never became true within ${timeout}ms (last saw: ${JSON.stringify(last)})`)
}

const applyOp = (scene, op) => {
    if (op.type === 'replaceScene') return structuredClone(op.payload.scene)
    if (op.type === 'addObject') return { ...scene, objects: [...scene.objects, op.payload.object] }
    if (op.type === 'updateObject') {
        return { ...scene, objects: scene.objects.map(object => (object.id === op.payload.id ? { ...object, ...op.payload.patch } : object)) }
    }
    return scene
}

/**
 * One install, scene stream only, with serverXR's ordering where it matters:
 * GET ops reads the ops, THEN the version (spaceRoutes.js), and a hook can run
 * between the two; GET scene can run a hook before it answers. Writes check
 * baseVersion (409 + pendingOps) and drop opIds already held.
 */
const fakeInstall = async () => {
    const state = { ops: [], version: 0, scene: { objects: [] } }
    const hooks = { betweenOpsAndVersion: null, beforeScene: null }
    const listeners = new Set()

    const write = (incoming, baseVersion) => {
        if (baseVersion !== state.version) {
            return { status: 409, body: { latestVersion: state.version, pendingOps: state.ops.filter(op => op.version > baseVersion) } }
        }
        const known = new Set(state.ops.map(op => op.opId))
        const fresh = incoming.filter(op => !known.has(op.opId))
        const landed = fresh.map(op => ({ ...op, version: ++state.version, timestamp: Date.now() }))
        for (const op of landed) {
            state.ops.push(op)
            state.scene = applyOp(state.scene, op)
        }
        if (landed.length) for (const notify of listeners) notify()
        return { status: 200, body: { newVersion: state.version, ops: landed } }
    }

    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://fake')
        const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)) }
        const route = url.pathname
        if (req.method === 'GET' && route === `/api/spaces/${SPACE}/projects`) return send(200, { projects: [] })
        if (req.method === 'GET' && route === '/api/trash') return send(200, { projects: [] })
        if (req.method === 'GET' && route === `/api/spaces/${SPACE}/scene`) {
            if (hooks.beforeScene) await hooks.beforeScene()
            return send(200, { scene: structuredClone(state.scene), version: state.version })
        }
        if (req.method === 'GET' && route === `/api/spaces/${SPACE}/ops`) {
            const since = url.searchParams.has('since') ? Number(url.searchParams.get('since')) : null
            const read = () => state.ops.filter(op => since === null || op.version > since)
            let ops = read()
            const waitMs = Math.min(Number(url.searchParams.get('wait')) || 0, 1) * 300
            if (waitMs && !ops.length) {
                await new Promise((resolve) => {
                    const done = () => { listeners.delete(done); clearTimeout(timer); resolve() }
                    const timer = setTimeout(done, waitMs)
                    listeners.add(done)
                    req.on('close', done)
                })
                ops = read()
            }
            if (hooks.betweenOpsAndVersion) await hooks.betweenOpsAndVersion({ since, ops })
            return send(200, { ops, latestVersion: state.version })
        }
        if (req.method === 'POST' && route === `/api/spaces/${SPACE}/ops`) {
            let raw = ''
            for await (const chunk of req) raw += chunk
            const body = JSON.parse(raw || '{}')
            const answer = write(body.ops || [], Number(body.baseVersion))
            return send(answer.status, answer.body)
        }
        return send(404, { error: 'not here' })
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${server.address().port}`
    return {
        base,
        state,
        hooks,
        edit: (op) => write([op], state.version),
        hasOp: (opId) => state.ops.some(op => op.opId === opId),
        close: () => new Promise(resolve => { server.closeAllConnections?.(); server.close(resolve) })
    }
}

const quiet = { warn: () => {}, info: () => {} }
const addObject = (id, opId) => ({ opId, type: 'addObject', payload: { object: { id, type: 'box', name: id } } })

let cleanup = []
afterEach(async () => {
    for (const fn of cleanup.reverse()) await fn()
    cleanup = []
})

const pair = async ({ onSave = null } = {}) => {
    const host = await fakeInstall()
    const mine = await fakeInstall()
    let ticks = 0
    const follower = startFollowing({
        local: side({ base: mine.base, spaceId: SPACE }),
        remote: side({ base: host.base, spaceId: SPACE }),
        log: quiet,
        onState: () => { ticks += 1 },
        onSave
    })
    cleanup.push(() => host.close(), () => mine.close(), () => follower.stop())
    return { host, mine, follower, ticks: () => ticks }
}

describe('C2 — an edit landing between the op read and the version read is carried (audit F9)', () => {
    it('does not move its cursor past an op the read did not return', async () => {
        const { host, mine, follower, ticks } = await pair()
        await settle('the follow running', () => ticks() >= 2)

        // The next read of this install's own log comes back empty — and in the
        // gap before the version is read, a person here makes an edit. The answer
        // says latestVersion 1 with no op 1 in it. The real server nudges the
        // follower on that write (nudgeFollow), so the loop goes round at once.
        let armed = true
        mine.hooks.betweenOpsAndVersion = ({ ops }) => {
            if (!armed || ops.length) return
            armed = false
            mine.edit(addObject('gap', 'op-in-the-gap'))
            follower.wake()
        }
        follower.wake()

        await settle('the edit made in the gap reaching the host', () => host.hasOp('op-in-the-gap'))
        expect(armed).toBe(false)
    })
})

describe('C1 — a converge never erases an edit made while it was comparing (audit F12)', () => {
    it('keeps a local edit made between the op read and the document read, and the copies end up equal', async () => {
        const { host, mine, follower, ticks } = await pair()
        await settle('the first comparison done', () => ticks() >= 3)

        // Both sides move, so the next quiet pass compares the two copies.
        host.edit(addObject('lamp', 'op-host-lamp'))
        follower.wake()
        await settle('the host edit reaching this install', () => mine.hasOp('op-host-lamp'))
        mine.edit(addObject('chair', 'op-mine-chair'))
        follower.wake()
        await settle('this edit reaching the host', () => host.hasOp('op-mine-chair'))

        // The compare reads this install's document; just before it answers, a
        // person here renames the lamp. The copies now differ in a field, which
        // the host wins — with the host's copy that never saw the rename.
        let armed = true
        mine.hooks.beforeScene = () => {
            if (!armed) return
            armed = false
            mine.edit({ opId: 'op-mine-rename', type: 'updateObject', payload: { id: 'lamp', patch: { name: 'reading lamp' } } })
            follower.wake()
        }

        const nameOf = (install) => install.state.scene.objects.find(object => object.id === 'lamp')?.name
        await settle('the rename on both copies', () => !armed && nameOf(mine) === 'reading lamp' && nameOf(host) === 'reading lamp')
        expect(JSON.stringify(mine.state.scene)).toBe(JSON.stringify(host.state.scene))
    })
})

describe('C3 — where the follow got to is not kept only in memory when a save fails', () => {
    it('saves the same cursors again after a failed save, without waiting for a new edit', async () => {
        const saves = []
        let failNext = true
        const onSave = async (snapshot) => {
            saves.push(snapshot)
            if (failNext) {
                failNext = false
                throw new Error('disk full')
            }
        }
        await pair({ onSave })

        // The first save is refused. Nothing moves after it, so the only copy of
        // the cursors is in this process — a restart now would resume from
        // nothing. The follow must try again on its own.
        await settle('a second save after the failed one', () => saves.length >= 2)
        expect(saves[1].cursors).toEqual(saves[0].cursors)
    })
})
