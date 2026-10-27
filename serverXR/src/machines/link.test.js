// @vitest-environment node

// The follower's machine link when the host keeps saying no (DSC-9, aylmo
// 2026-10-26): the sync and signal loops shared ONE lastError, so each overwrote
// the other's message and a 401 that never changed was logged every 13-17 s.

import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { startMachineLink } = require('./link.js')
const { createMachineHub } = require('./hub.js')

const links = []
afterEach(() => { while (links.length) links.pop().stop() })

// A host that answers every sync and every held signal read with `status`.
const start = ({ status, ms = 600 }) => new Promise((resolve) => {
    const calls = { sync: [], signal: [] }
    const warn = []
    const send = async (url) => {
        calls[url.includes('/machines/sync') ? 'sync' : 'signal'].push(Date.now())
        return { ok: status >= 200 && status < 300, status, payload: status === 200 ? { peers: [], messages: [] } : { error: 'no' } }
    }
    const link = startMachineLink({
        spaceId: 'room',
        link: { base: 'https://host.invalid/serverXR', spaceId: 'room', token: 'dii_sync_key' },
        hub: createMachineHub(),
        machine: () => ({ id: 'here', name: 'here' }),
        log: { warn: (line) => warn.push(line), info() {} },
        send,
        syncEveryMs: 5,
        waitSeconds: 0,
        backoffCeilingMs: 10,
        refusedCeilingMs: 80
    })
    links.push(link)
    setTimeout(() => resolve({ calls, warn, state: link.state }), ms)
})

describe('a machine link the host refuses', () => {
    it('says a repeating failure once per loop, not every time the other loop fails', async () => {
        const { warn, calls } = await start({ status: 500 })
        expect(calls.sync.length + calls.signal.length).toBeGreaterThan(10)
        expect(warn.sort()).toEqual(['[machines] room: signal: 500', '[machines] room: sync: 500'])
    })

    it('on 401 says it once, in the log and in the link state, and asks far less often', async () => {
        const refused = await start({ status: 401 })
        const failing = await start({ status: 500 })
        expect(refused.warn).toEqual(['[machines] room: the host refuses this machine\'s key (401) — asking again less often, at most every 0 min'])
        expect(refused.state.refused).toMatchObject({ status: 401 })
        expect(refused.state.lastError).toMatch(/: 401$/)
        // Waits 10, 20, 40, 80, 80 ms … against 10 ms for a host that is merely failing.
        const asked = (run) => run.calls.sync.length + run.calls.signal.length
        console.info(`[DSC-9] 600 ms: ${asked(refused)} asks refused (401) vs ${asked(failing)} failing (500)`)
        expect(asked(refused) * 3).toBeLessThan(asked(failing))
        const gaps = refused.calls.sync.slice(1).map((at, i) => at - refused.calls.sync[i])
        expect(Math.max(...gaps)).toBeGreaterThanOrEqual(70)
    })

    it('a host that answers again clears the refusal', async () => {
        const { state } = await start({ status: 200, ms: 100 })
        expect(state.refused).toBe(null)
        expect(state.lastError).toBe(null)
        expect(state.synced).toBeGreaterThan(0)
    })
})
