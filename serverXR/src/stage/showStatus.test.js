// @vitest-environment node
// The show status (stage/showStatus.js, routes/showStatusRoutes.js) and the Show desk's stage line (showDesk/ui/stageLine.js);
// plan S11, gaps G04/G11/G25. The rig here is made up on purpose: any names, two cubes; the code names no production.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { createShowStatus, validateShowStatus, SCHEMA } = require('./showStatus.js')
const { registerShowStatusRoutes } = require('../routes/showStatusRoutes.js')
const stageLine = require('../showDesk/ui/stageLine.js')
const express = require('express')

const HERE = path.dirname(fileURLToPath(import.meta.url))
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'di-show-status-test-'))
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const T0 = Date.parse('2026-11-01T02:00:00Z')

const lightingWith = (scene) => ({ hasDesk: () => true, getDesk: () => ({ summary: () => ({ activeScene: scene.toLowerCase(), activeSceneName: scene, blackout: false, master: 255 }) }) })
const lasers = {
    hasEngine: () => true,
    getEngine: () => ({ state: () => ({ armed: true, sim: false, cubes: [
        { id: 'a', armed: true, connected: true, stop: null, stops: { linkLost: 1 } },
        { id: 'b', armed: false, connected: false, stop: { reason: 'link-lost', text: 'the cube stopped answering' }, stops: { linkLost: 2 } }
    ] }) })
}
function watchFile(name, { atMs = T0 - 2000, state = 'alert', linkAtMs = T0 - 10000 } = {}) {
    const f = path.join(tmp, `${name}.json`)
    fs.writeFileSync(f, JSON.stringify({
        schema: 'di.stage-watch.latest/1', at: new Date(atMs).toISOString(), state,
        alerts: state === 'alert' ? [{ key: 'usb:1-2.1', level: 'alert', text: 'usb flood 1-2.1: 2655 error lines/s' }, { key: 'heat', level: 'warn', text: '88 °C (crit 105)' }] : [],
        heat: { maxC: state === 'alert' ? 88 : 70, critC: 105 }, usb: { mode: 'warn' },
        link: { at: new Date(linkAtMs).toISOString(), state: 'degraded', gatewayMs: 2, dnsOk: true, tailscale: { state: 'Running', peer: { mode: 'derp', handshakeAgeS: 12 } } }
    }))
    return f
}

describe('the show-status document', () => {
    it('says the light scene, the laser armed and why a cube stopped, heat, link and the watch, in its schema', () => {
        let t = T0
        const s = createShowStatus({ lighting: lightingWith('Warm'), lasers, watchFile: watchFile('alert'), now: () => t, hostname: 'stage-test' })
        const d = s.build()
        expect(validateShowStatus(d)).toEqual([])
        expect(d).toMatchObject({
            schema: SCHEMA, machine: 'stage-test', period_s: 30, grace_s: 60,
            light: { seen: true, scene: 'Warm', blackout: false },
            laser: { seen: true, armed: true, cubes: 2, connected: 1, stop_reason: 'the cube stopped answering', stops_total: 3 },
            controller: { seen: null, wired: false },
            link: { state: 'degraded', tailscale: 'derp', handshake_age_s: 12, gateway_ms: 2 },
            heat: { state: 'warm', max_c: 88, crit_c: 105 },
            watch: { state: 'alert', usb_mode: 'warn' }
        })
        expect(d.watch.alerts[0].text).toContain('usb flood 1-2.1')
    })

    it('two clocks: sent_at on every build, changed_at only when a state field changes', () => {
        let t = T0; let scene = 'Warm'
        const lighting = { hasDesk: () => true, getDesk: () => ({ summary: () => ({ activeScene: scene, activeSceneName: scene, blackout: false }) }) }
        const s = createShowStatus({ lighting, lasers, watchFile: watchFile('clock'), now: () => t })
        const a = s.build(); t += 5000
        const b = s.build()
        expect(b.sent_at).not.toBe(a.sent_at)
        expect(b.changed_at).toBe(a.changed_at)
        expect(b.seq).toBe(a.seq + 1)
        scene = 'Cold'; t += 5000
        const c = s.build()
        expect(c.changed_at).toBe(new Date(t).toISOString())
        expect(c.last_change.what).toEqual(['light.scene'])
    })

    it('a silent watch is stale, a missing one is off; nothing is built that was not built', () => {
        let t = T0
        expect(createShowStatus({ watchFile: watchFile('old', { atMs: T0 - 60000 }), now: () => t }).build()).toMatchObject({ watch: { state: 'stale', alerts: [] }, heat: { state: 'unknown' } })
        const getDesk = vi.fn(); const getEngine = vi.fn()
        const d = createShowStatus({ lighting: { hasDesk: () => false, getDesk }, lasers: { hasEngine: () => false, getEngine }, watchFile: path.join(tmp, 'none.json'), now: () => t }).build()
        expect(d).toMatchObject({ light: { seen: false }, laser: { seen: false }, watch: { state: 'off' }, link: { state: 'unknown' } })
        expect(validateShowStatus(d)).toEqual([])
        expect(getDesk).not.toHaveBeenCalled()
        expect(getEngine).not.toHaveBeenCalled()
    })

    it('S12 and S14 plug in: the laser safety state and the controller heard', () => {
        const s = createShowStatus({ lighting: lightingWith('Warm'), lasers, watchFile: watchFile('prov'), now: () => T0 })
        s.setProvider('laserSafety', () => ({ armed: false, stopReason: 'no zone set', lso: 'named' }))
        s.setProvider('controller', () => ({ seen: true, heardAt: new Date(T0 - 3000).toISOString(), name: 'any controller' }))
        const d = s.build()
        expect(d.laser).toMatchObject({ armed: false, stop_reason: 'no zone set', safety: { lso: 'named' } })
        expect(d.controller).toMatchObject({ seen: true, wired: true, name: 'any controller' })
        expect(validateShowStatus(d)).toEqual([])
        s.setProvider('controller', () => { throw new Error('a broken provider') })
        expect(s.build().controller.wired).toBe(false)
    })

    it('the example S06 builds its card from stays valid', () => {
        const ex = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures/show-status.example.json'), 'utf8'))
        expect(validateShowStatus(ex)).toEqual([])
    })
})

describe('the push to the door', () => {
    it('is off with no address; sends on start, on a change, never more; failures counted; the token never logged', async () => {
        expect(createShowStatus({ watchFile: path.join(tmp, 'none.json') }).startPush({ url: '', file: '' }).enabled).toBe(false)
        let scene = 'Warm'
        const lighting = { hasDesk: () => true, getDesk: () => ({ summary: () => ({ activeScene: scene, activeSceneName: scene, blackout: false }) }) }
        const logs = []; const calls = []; let fail = false
        const fetchImpl = async (url, init) => { calls.push({ url, init }); return fail ? { ok: false, status: 503 } : { ok: true, status: 200 } }
        const s = createShowStatus({ lighting, lasers, watchFile: watchFile('push', { atMs: Date.now() - 1000, state: 'ok', linkAtMs: Date.now() }), log: (l) => logs.push(l) })
        s.startPush({ url: 'http://door.invalid/crew/status', token: 'secret-token-value', everyMs: 10, fetchImpl })
        await sleep(80)
        expect(calls).toHaveLength(1)
        const body = JSON.parse(calls[0].init.body)
        expect(validateShowStatus(body)).toEqual([])
        expect(calls[0].init.headers).toMatchObject({ 'content-type': 'application/json', authorization: 'Bearer secret-token-value' })
        expect(calls[0].init.headers['idempotency-key']).toMatch(/:\d+$/)
        scene = 'Cold'
        await sleep(60)
        expect(calls).toHaveLength(2)
        fail = true; scene = 'Warm'
        await sleep(60)
        s.stopPush()
        expect(s._push.failures).toBeGreaterThan(0)
        expect(s._push.last_error).toBe('HTTP 503')
        expect(logs.filter((l) => l.includes('did not take'))).toHaveLength(1)
        expect(logs.join('\n')).not.toContain('secret-token-value')
    })
})

describe('GET /show-status', () => {
    it('answers the document from the local runtime', async () => {
        const app = express()
        const s = createShowStatus({ lighting: lightingWith('Warm'), lasers, watchFile: watchFile('route') })
        registerShowStatusRoutes(app, { mountPaths: ['/serverXR/show-status'], status: s })
        const server = await new Promise((r) => { const sv = app.listen(0, '127.0.0.1', () => r(sv)) })
        try {
            const res = await fetch(`http://127.0.0.1:${server.address().port}/serverXR/show-status`)
            expect(res.status).toBe(200)
            expect(res.headers.get('cache-control')).toBe('no-store')
            expect(validateShowStatus(await res.json())).toEqual([])
        } finally { server.close() }
    })
})

describe('the Show desk stage line', () => {
    const ok = { watch: { state: 'ok', alerts: [] }, heat: { max_c: 70.4, crit_c: 105, state: 'ok' }, link: { state: 'ok', tailscale: 'direct', gateway_ms: 2, dns_ok: true }, laser: { seen: true, armed: true, cubes: 2, connected: 2 }, controller: { wired: false }, push: { enabled: false } }
    it('one short line, coloured by its state; the whole story in its title', () => {
        expect(stageLine.render(ok, T0)).toMatchObject({ state: 'ok', text: 'stage ok · 70° · link ok · laser armed' })
        const alert = stageLine.render({ ...ok, watch: { state: 'alert', alerts: [{ level: 'alert', text: 'usb flood 1-2.1: 2655 error lines/s' }, { level: 'warn', text: '88 °C' }] } }, T0)
        expect(alert.state).toBe('alert')
        expect(alert.text.startsWith('ALERT usb flood 1-2.1: 2655 error lines/s (+1)')).toBe(true)
        expect(alert.title).toContain('warn: 88 °C')
        expect(stageLine.render({ ...ok, link: { state: 'lost' } }, T0).state).toBe('alert')
        expect(stageLine.render({ ...ok, laser: { seen: true, armed: false, stop_reason: 'link lost', cubes: 1, connected: 0 } }, T0)).toMatchObject({ state: 'warn', text: 'stage ok · 70° · link ok · laser stop: link lost' })
        expect(stageLine.render({ ...ok, controller: { wired: true, seen: false } }, T0).text).toContain('controller not heard')
        expect(stageLine.render({ ...ok, controller: { wired: true, seen: true, heard_at: new Date(T0 - 4000).toISOString() } }, T0).text).toContain('controller 4 s')
        expect(stageLine.render({ watch: { state: 'off', alerts: [] }, link: { state: 'unknown' }, laser: { seen: false } }, T0)).toMatchObject({ state: 'off', text: 'watch off' })
        expect(stageLine.render(null)).toMatchObject({ state: 'off', text: '' })
    })

    it('hidden on a server without the route; says so when an answering route goes quiet', async () => {
        const el = { hidden: true, textContent: '', title: '', dataset: {} }
        const doc = { hidden: false, getElementById: (id) => (id === 'stageLine' ? el : null) }
        const scheduled = []
        const old = stageLine.start(doc, { fetchImpl: async () => ({ status: 404, ok: false }), schedule: (fn) => scheduled.push(fn) })
        await sleep(5)
        expect(el.hidden).toBe(true)
        expect(scheduled).toHaveLength(0)
        expect(old).toBeTruthy()
        let up = true
        const live = stageLine.start(doc, { fetchImpl: async () => (up ? { status: 200, ok: true, json: async () => ok } : Promise.reject(new Error('down'))), schedule: () => {} })
        await sleep(5)
        expect(el).toMatchObject({ hidden: false, textContent: 'stage ok · 70° · link ok · laser armed', dataset: { state: 'ok' } })
        up = false
        await live.tick()
        expect(el.textContent).toMatch(/^stage status: no answer since \d\d:\d\d:\d\d$/)
        expect(el.dataset.state).toBe('alert')
    })

    it('the page carries the line in its status corner and loads it; the CSS uses the desk tokens only', () => {
        const ui = path.join(HERE, '../showDesk/ui')
        const html = fs.readFileSync(path.join(ui, 'index.html'), 'utf8')
        expect(html).toMatch(/<div class="statusline">\s*<p class="stageline" id="stageLine" hidden><\/p>/)
        expect(html).toContain('<script src="stageLine.js"></script>')
        const css = fs.readFileSync(path.join(ui, 'show.css'), 'utf8')
        const block = css.slice(css.indexOf('/* ---- The stage line'))
        expect(block).toMatch(/var\(--danger\)/)
        expect(block).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i)
    })
})
