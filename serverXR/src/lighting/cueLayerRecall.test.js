// A person's scene recall wins over a look a hand put on the cue layer (owner 2026-11-13, twice in one night: "when im
// changing lighs scene its dosnt change"). A Looks tile on /light fires its look onto the cue layer (ltp, priority 31,
// mask all), and every scene recalled after it stayed covered: the DMX kept the look. The cue runner's own looks stay.
// The desk is driven through its own handle(), over plain node http, with an offline desk in a temp folder.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createDesk } = require('./desk')

const LAMP = { id: 'f1', index: 1, name: 'Light A1', universe: 0, address: 1, profile: 'drgb', on: true, values: { dimmer: 0, r: 0, g: 0, b: 0 } }
const sceneOf = (id, rgb) => ({ id, name: id.toUpperCase(), fadeMs: 0, fixtures: [{ id: 'f1', on: true, values: { dimmer: 255, r: rgb[0], g: rgb[1], b: rgb[2] } }] })
const lookOf = (id, rgb) => ({ id, name: id.toUpperCase(), kind: 'all', scope: 'each', spatial: 'patch', fixtures: ['f1'], steps: [{ values: { f1: { dimmer: 255, r: rgb[0], g: rgb[1], b: rgb[2] } }, width: 1, transition: 0 }], measure: 16, phase: 0, bpm: null })

const open = []
afterEach(async () => {
    while (open.length) {
        const { desk, server, dir } = open.pop()
        await new Promise((r) => server.close(r))
        desk.close()
        fs.rmSync(dir, { recursive: true, force: true })
    }
})

async function deskWith() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'di-cue-recall-'))
    fs.writeFileSync(path.join(dir, 'show.json'), JSON.stringify({
        fixtures: [LAMP],
        scenes: [sceneOf('red', [255, 0, 0]), sceneOf('blue', [0, 0, 255])],
        looks: [lookOf('amber', [255, 176, 32])],
        cues: { project: 'test', list: [{ id: 'c1', name: 'AMBER', lookId: 'amber', hold: 0, fade: 0 }] },
    }))
    const desk = createDesk({ dataDir: dir, offline: true, outputEnabledDefault: false, log: () => {} })
    const server = http.createServer((req, res) => {
        const p = req.url.split('?')[0]
        req.path = p
        desk.handle(req, res, p)
    })
    await new Promise((r) => server.listen(0, '127.0.0.1', r))
    open.push({ desk, server, dir })
    const base = `http://127.0.0.1:${server.address().port}`
    const post = async (route, body) => (await fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json()
    const get = async (route) => (await fetch(base + route)).json()
    const lamp = async () => (await get('/api/dmx')).dmx[0].slice(0, 4) // A1: dimmer, r, g, b
    const cueLook = async () => (await get('/api/state')).layers.find((l) => l.id === 'cue')?.lookId ?? null
    return { post, get, lamp, cueLook }
}

describe('scene recall and the cue layer', () => {
    it('a hand-fired look (Looks tile) is taken off the cue layer by the next scene recall, so the scene reaches the lamp', async () => {
        const d = await deskWith()
        expect((await d.post('/api/looks/fire', { id: 'amber' })).ok).not.toBe(false)
        expect(await d.cueLook()).toBe('amber')
        expect((await d.lamp()).slice(1)).toEqual([255, 176, 32])
        const r = await d.post('/api/scenes/recall', { id: 'blue', fadeMs: 0 })
        expect(r.ok).toBe(true)
        expect(r.cueLookReleased).toBe('amber')
        expect(await d.cueLook()).toBe(null)
        expect(await d.lamp()).toEqual([255, 0, 0, 255])
        // and the next scene changes the lamp again
        await d.post('/api/scenes/recall', { id: 'red', fadeMs: 0 })
        expect(await d.lamp()).toEqual([255, 255, 0, 0])
    })

    it('a look the cue list fired stays on top of a scene recall (the show playback is not a hand)', async () => {
        const d = await deskWith()
        await d.post('/api/cues/go', {})
        expect(await d.cueLook()).toBe('amber')
        const r = await d.post('/api/scenes/recall', { id: 'blue', fadeMs: 0 })
        expect(r.ok).toBe(true)
        expect(r.cueLookReleased).toBeUndefined()
        expect(await d.cueLook()).toBe('amber')
        expect((await d.lamp()).slice(1)).toEqual([255, 176, 32])
    })

    it('a recall of a scene that does not exist leaves a hand-fired look where it is', async () => {
        const d = await deskWith()
        await d.post('/api/looks/fire', { id: 'amber' })
        const r = await d.post('/api/scenes/recall', { id: 'nope', fadeMs: 0 })
        expect(r.cueLookReleased).toBeUndefined()
        expect(await d.cueLook()).toBe('amber')
    })
})
