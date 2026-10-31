// @vitest-environment jsdom
/* global window, document, HTMLCanvasElement */
// The show desk's page (showDesk/ui/show.js on showDesk/ui/index.html in jsdom) with a fake lighting desk and a fake laser
// desk behind fetch. Each press posts exactly the desks' own routes, in order; nothing posts without a press (polls only
// read; On is never sent by itself); a missing half says so. The rig here is made up on purpose: any names, any profiles,
// two cubes; the page names no production.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const here = path.dirname(fileURLToPath(import.meta.url))
const UI = path.join(here, 'ui')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const clone = (v) => JSON.parse(JSON.stringify(v))

let light, desk, engine, table, posts, gets, mode, gate, heads, board, boardMode, holdWrites
const fresh = () => {
    light = {
        master: 255, blackout: false, activeScene: 'warm',
        fixtures: [
            { id: 'f1', name: 'Wash left', address: 1, universe: 0, profile: 'drgb', on: true, values: { dimmer: 200, r: 255, g: 80, b: 0 } },
            { id: 'f2', name: 'Wash right', address: 5, universe: 0, profile: 'rgbw', on: true, values: { r: 0, g: 0, b: 255, w: 0 } },
            { id: 'f3', name: 'Back', address: 1, universe: 1, profile: 'dim', on: false, values: { dimmer: 0 } }
        ],
        profiles: { drgb: { channels: ['dimmer', 'r', 'g', 'b'] }, rgbw: { channels: ['r', 'g', 'b', 'w'] }, dim: { channels: ['dimmer'] } },
        roleKinds: { emitter: ['r', 'g', 'b', 'w', 'a', 'y', 'warm', 'cool', 'uv', 'lime'] },
        dmx: { 0: [200, 255, 80, 0, 0, 0, 255, 0], 1: [0] },
        raw: {}, rawOwners: {},
        scenes: [
            { id: 'warm', name: 'Warm open', fixtures: [{ id: 'f1', on: true, values: { dimmer: 255, r: 255, g: 120, b: 0 } }] },
            { id: 'blue', name: 'Blue hour', fixtures: [{ id: 'f2', on: true, values: { r: 0, g: 0, b: 255, w: 0 } }, { id: 'f3', on: false, values: {} }] },
            { id: 'dark', name: 'Dark', fixtures: [] }
        ]
    }
    desk = { liveId: 'ring', live: { name: 'Ring' }, master: 0.8, blackout: false, bpm: 120, unsaved: false, looks: [{ id: 'ring', name: 'Ring', shape: 'circle', colour: '#ff2030', rainbow: false, level: 1, size: 0.5, height: 0, x: 0, rotation: 0, spin: 0, copies: 0, points: 300, cycle: 0, pulse: 0.3, pulseBeats: 1, sweep: 0, sweepBeats: 4, mirror: false, phase: 0, follows: 'warm' }, { id: 'wave', name: 'Wave', shape: 'wave', colour: '#20d8ff', level: 1, pulse: 0 }], cubes: [{ id: 'cube-a', size: 1.2, order: 0 }, { id: 'cube-b', size: 1, order: 1 }] }
    engine = { sim: false, signOff: 'click', zone: { xMin: -1, xMax: 1, yMin: -1, yMax: 1 }, cubes: [{ id: 'cube-a', name: 'Left cube', ip: '10.0.0.2', connected: true, armed: false, stop: null }, { id: 'cube-b', name: 'Right cube', ip: '10.0.0.3', connected: true, armed: false, stop: null }] }
    table = { warm: { look: 'ring', name: 'Ring' }, blue: { look: 'wave', name: 'Wave' } }
    posts = []
    gets = []
    mode = { light: 'ok', laser: 'ok' } // 'down': nothing answers; 'reads-down': its state reads fail, its routes still take a POST
    gate = null // when set, a lift POST waits for it before the fake desk applies it (a lift still in flight)
    heads = [] // the headers of every request the page sent, in order
    board = board || { clients: new Map(), touches: [] } // the server's touch board, as a fake (fakeFetch below); it outlives a test, as the server's does
    boardMode = 'ok' // 'ok' | '404' (an older server: no board) | 'blind' (a board in front of nothing: it never hears of a touch)
    holdWrites = null // when set, every POST waits for it before the fake desks see it (a write still on its way)
}
fresh()

const reply = (v, status = 200) => ({ ok: status < 400, status, json: async () => clone(v) })
const desksFetch = async (url, opts = {}) => {
    const isPost = opts.method === 'POST'
    const body = isPost ? JSON.parse(opts.body || '{}') : null
    if (isPost) posts.push({ url, body })
    else gets.push(url)
    const side = url.startsWith('../light/') ? 'light' : 'laser'
    if (mode[side] === 'down' || (mode[side] === 'reads-down' && !isPost)) throw new TypeError('fetch failed')
    if (gate && isPost && (body.blackout === false || body.on === false)) await gate
    if (mode[side] === '404') return reply({}, 404)
    if (!isPost) {
        if (url === '../light/api/state') return reply(light)
        if (url === '../laser/desk/api/state') return reply(desk)
        if (url === '../laser/api/state') return reply(engine)
        if (url === '../laser/desk/api/follows') return reply({ ok: true, on: false, links: {}, table })
        if (url === '../laser/desk/api/view') return reply({ armed: false, cubes: { 'cube-a': [[0, 0, 0, 0, 0], [0.5, 0.5, 1, 0, 0]] } })
        return reply({}, 404)
    }
    if (url === '../light/api/scenes/recall') { light.activeScene = body.id; return reply({ ok: true }) }
    if (url === '../light/api/master') {
        if (body.blackout != null) light.blackout = !!body.blackout
        if (body.master != null) light.master = body.master
        return reply({ ok: true })
    }
    if (url === '../light/api/fixture') { Object.assign(light.fixtures.find((f) => f.id === body.id).values, body.values); return reply({ ok: true }) }
    if (url === '../light/api/raw' && body.clear) {
        const kept = {}
        for (const key of Object.keys(light.raw)) {
            if (Number(key.split(':')[0]) !== body.universe) continue
            const by = light.rawOwners[key] || 'owner'
            if (body.all || by === 'owner') { delete light.raw[key]; delete light.rawOwners[key] } else kept[by] = (kept[by] || 0) + 1
        }
        return reply({ ok: true, released: 1, ...(Object.keys(kept).length ? { kept } : {}) })
    }
    if (url === '../laser/api/arm') {
        if (body.armed && engine.signOff === 'phrase' && !body.confirm) return reply({ ok: false, needsPhrase: true, error: 'the phrase is asked on the first On' }, 403)
        engine.cubes.find((c) => c.id === body.cube).armed = body.armed
        return reply({ ok: true })
    }
    if (url === '../laser/desk/api/go') { desk.liveId = body.look; return reply({ ok: true, live: body.look }) }
    if (url === '../laser/desk/api/blackout') { desk.blackout = body.on; return reply({ ok: true, blackout: body.on }) }
    if (url === '../laser/desk/api/master') { desk.master = body.level; return reply({ ok: true }) }
    if (url === '../laser/desk/api/cube') { desk.cubes.find((c) => c.id === body.id).size = body.size; return reply({ ok: true }) }
    if (url === '../laser/desk/api/looks/edit') {
        const l = desk.looks.find((x) => x.id === body.id)
        if (!l) return reply({ ok: false, error: 'no such look' }, 404)
        Object.assign(l, body)
        desk.unsaved = true
        return reply({ ok: true })
    }
    if (url === '../laser/desk/api/store') { const i = desk.looks.findIndex((x) => x.id === body.id); desk.looks[i] = { ...body.look, id: body.id }; desk.unsaved = false; return reply({ ok: true }) }
    if (url === '../laser/desk/api/save') { desk.liveId = `${desk.liveId} 2`; return reply({ ok: true }) } // the real desk copies a changed look
    if (url === '../laser/desk/api/undo') return reply({ ok: true })
    if (url === '../laser/desk/api/bpm') { if (body.bpm != null) desk.bpm = body.bpm; return reply({ ok: true, bpm: desk.bpm }) }
    if (url === '../light/api/scenes/update') return reply({ ok: true, scene: { id: body.id } })
    return reply({ error: 'not in the fake' }, 404)
}
// The server's touch board (touchBoard.js) as a fake, in front of the desks' fakes: a browser that asks GET api/who is on it, and a
// write the desk took that carries X-Di-Control is a touch. presence.test.js and touchBoard.test.js have the real rules.
const fakeFetch = async (url, opts = {}) => {
    const h = opts.headers || {}
    heads.push({ url, method: opts.method || 'GET', headers: { ...h } })
    const t = Date.now()
    const join = () => {
        const id = h['X-Di-Client']
        if (!id) return null
        const c = board.clients.get(id) || { id, label: '', slot: board.clients.size % 6, seenAt: t, touchAt: null }
        c.seenAt = t
        if (h['X-Di-Label']) c.label = decodeURIComponent(h['X-Di-Label'])
        board.clients.set(id, c)
        return c
    }
    if (url === 'api/who') {
        gets.push(url)
        if (boardMode === '404') return reply({}, 404)
        join()
        return reply({
            ok: true,
            clients: [...board.clients.values()].map((c) => ({ id: c.id, label: c.label, slot: c.slot, seenMs: t - c.seenAt, touchMs: c.touchAt === null ? null : t - c.touchAt })),
            touches: board.touches.filter((x) => t - x.at < 6000).map((x) => ({ control: x.control, id: x.id, slot: board.clients.get(x.id).slot, ageMs: t - x.at }))
        })
    }
    if (holdWrites && opts.method === 'POST') await holdWrites
    const res = await desksFetch(url, opts)
    if (opts.method === 'POST' && res.ok && h['X-Di-Control'] && boardMode === 'ok') {
        const c = join()
        if (c) {
            c.touchAt = t
            board.touches = board.touches.filter((x) => x.control !== h['X-Di-Control'])
            board.touches.push({ control: h['X-Di-Control'], id: c.id, at: t })
        }
    }
    return res
}
let midiIn = null
const midi = (...bytes) => midiIn.onmidimessage({ data: Uint8Array.from(bytes) })

const $ = (id) => document.getElementById(id)
const refresh = () => window.DiShowDesk.refresh()
const settle = () => sleep(120) // a press's posts, its tick and a fader's 50 ms send
const press = async (node) => { node.click(); await settle() }
const key = (k, init = {}, target = document) => target.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }))
const DARK = [{ url: '../light/api/master', body: { blackout: true } }, { url: '../laser/desk/api/blackout', body: { on: true } }]
const LIFT_LIGHTS = { url: '../light/api/master', body: { blackout: false } }
const LIFT_LASER = { url: '../laser/desk/api/blackout', body: { on: false } }
const lifts = () => posts.filter((p) => p.body.blackout === false || p.body.on === false)
const slide = async (input, value) => {
    input.value = String(value)
    input.dispatchEvent(new Event('input'))
    await settle()
}
const sceneBtn = (id) => document.querySelector(`#scenes .scenebtn[data-id="${id}"]`)
const cubeCard = (id) => document.querySelector(`.cubecard[data-id="${id}"]`)
const lampRow = (id) => document.querySelector(`.lamp[data-id="${id}"]`)

beforeAll(async () => {
    const html = fs.readFileSync(path.join(UI, 'index.html'), 'utf8')
    document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/g, '')
    document.body.className = 'showdesk'
    const context = new WeakMap()
    HTMLCanvasElement.prototype.getContext = function getContext() {
        if (!context.has(this)) context.set(this, new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true } }))
        return context.get(this)
    }
    window.fetch = fakeFetch
    globalThis.fetch = fakeFetch
    window.deskColour = require('../lighting/ui/colour.js')
    window.DiLaserDraw = require('../laser/ui/drawRuns.js')
    window.DiSceneRow = require('../laser/ui/sceneRow.js')
    try { window.localStorage.removeItem('diShowDesk.midiMap.v1') } catch { /* no storage: the default map */ }
    midiIn = { name: 'XONE:K2', onmidimessage: null }
    Object.defineProperty(window.navigator, 'requestMIDIAccess', { configurable: true, value: async () => ({ inputs: new Map([['k2', midiIn]]), onstatechange: null }) })
    try { window.localStorage.removeItem('diShowDesk.who.v1') } catch { /* no storage: a fresh id */ }
    new Function(fs.readFileSync(path.join(UI, 'presence.js'), 'utf8'))() // the page loads presence.js before show.js
    new Function(fs.readFileSync(path.join(UI, 'show.js'), 'utf8'))()
    await refresh()
    await refresh()
})
afterAll(() => { window.fetch = undefined })
beforeEach(async () => {
    fresh()
    await sleep(700) // past the Blackout gap of the test before
    await refresh()
    posts = []
})

describe('at rest', () => {
    it('reads the two desks and posts nothing: polls only read, and no cube is ever turned On without a press', async () => {
        engine.cubes[0].stop = { reason: 'still-beam', text: 'Still beam' }
        await refresh()
        engine.cubes[1].armed = true
        desk.blackout = true
        light.raw = { '0:1': 255 }
        await refresh()
        await sleep(650) // the preview's calm read and a poll run on their own
        await refresh()
        expect(posts).toEqual([])
        expect(gets).toEqual(expect.arrayContaining(['../light/api/state', '../laser/desk/api/state', '../laser/api/state', '../laser/desk/api/view']))
        expect(gets.some((u) => /arm|blackout|go|master|cube|raw|recall|fixture/.test(u))).toBe(false)
    })
    it('says what is on in the top line and marks the scene on the lights', async () => {
        expect($('nowScene').textContent).toBe('Warm open')
        expect($('nowLook').textContent).toBe('Ring')
        expect($('nowLaser').textContent).toBe('Laser Off')
        engine.cubes[0].armed = true
        await refresh()
        expect($('nowLaser').textContent).toBe('Laser On')
        expect($('nowLaser').classList.contains('is-armed')).toBe(true)
        expect(sceneBtn('warm').getAttribute('aria-pressed')).toBe('true')
        expect(sceneBtn('warm').textContent).toContain('laser: Ring')
        expect(sceneBtn('dark').textContent).toContain('lights only')
        expect([...document.querySelectorAll('#scenes .scenebtn')].map((b) => b.dataset.id)).toEqual(['warm', 'blue', 'dark'])
        expect(sceneBtn('blue').querySelectorAll('.scenedots i')).toHaveLength(2) // the two patched lamps in that scene
    })
    it('lists every patched lamp of any profile, and every cube with On and Off', () => {
        expect([...document.querySelectorAll('.lamp')].map((r) => r.dataset.id)).toEqual(['f1', 'f2', 'f3'])
        expect(lampRow('f1').querySelector('input').value).toBe('200')
        expect(lampRow('f2').querySelector('input').value).toBe('255') // no dimmer channel: the desk's own, full
        expect(lampRow('f3').textContent).toContain('U2 @1')
        expect([...document.querySelectorAll('.cubecard')].map((c) => c.dataset.id)).toEqual(['cube-a', 'cube-b'])
        expect(cubeCard('cube-a').textContent).toContain('Left cube')
    })
})

describe('the presses post exactly the desks\' own routes', () => {
    it('a scene: the light recall, then the laser desk Go of the look that follows it', async () => {
        await press(sceneBtn('blue'))
        expect(posts).toEqual([
            { url: '../light/api/scenes/recall', body: { id: 'blue' } },
            { url: '../laser/desk/api/go', body: { look: 'wave' } }
        ])
        expect($('status').textContent).toContain('Blue hour: lights recalled.')
        expect(sceneBtn('blue').getAttribute('aria-pressed')).toBe('true')
    })
    it('a scene no look follows: the light recall only', async () => {
        await press(sceneBtn('dark'))
        expect(posts).toEqual([{ url: '../light/api/scenes/recall', body: { id: 'dark' } }])
    })
    it('Blackout all only ever goes dark: any number of presses, fast or slow, before and after the desks say dark, by button or B', async () => {
        for (let i = 0; i < 6; i += 1) {
            $('blackoutAll').click()
            await (i % 2 ? sleep(650) : settle()) // inside and past the old 600 ms gap, with the polls saying both are dark
        }
        for (let i = 0; i < 4; i += 1) key('b')
        await settle()
        expect(posts).toHaveLength(20) // every press sends both: a panic retry is never dropped
        for (let i = 0; i < posts.length; i += 2) expect(posts.slice(i, i + 2)).toEqual(DARK)
        expect(JSON.stringify(posts)).not.toMatch(/"blackout":false|"on":false/)
        expect(posts.some((p) => p.url.endsWith('/arm'))).toBe(false)
        expect($('blackoutAll').textContent).toMatch(/^Blackout all/)
        expect($('blackoutAll').textContent).toContain('Lift lights or Lift laser lifts it')
        expect(light.blackout && desk.blackout).toBe(true)
    })
    it('each desk is lifted on its own, only when it answered and its blackout is on, with that desk\'s own route', async () => {
        expect([$('liftLights').disabled, $('liftLaser').disabled]).toEqual([true, true]) // at rest nothing is dark
        light.blackout = true
        await refresh()
        expect([$('liftLights').disabled, $('liftLaser').disabled]).toEqual([false, true])
        await press($('liftLaser')) // disabled: the laser blackout is off
        await press($('liftLights'))
        expect(posts).toEqual([LIFT_LIGHTS])
        expect($('status').textContent).toBe('Blackout lifted on the lights.')
        posts = []
        desk.blackout = true
        await refresh()
        expect([$('liftLights').disabled, $('liftLaser').disabled]).toEqual([true, false])
        await press($('liftLaser'))
        expect(posts).toEqual([LIFT_LASER])
        expect(posts.some((p) => p.url.endsWith('/arm'))).toBe(false) // lifting never turns a cube On
        expect($('status').textContent).toContain('The cubes stay Off until you press On.')
    })
    it('a lift of the same desk inside 600 ms is ignored: a double-click lifts once', async () => {
        light.blackout = true
        await refresh()
        $('liftLights').click()
        $('liftLights').click()
        await settle()
        light.blackout = true // dark again from outside, then a third press still inside the gap
        await refresh()
        await press($('liftLights'))
        expect(posts).toEqual([LIFT_LIGHTS])
        await sleep(650)
        await press($('liftLights'))
        expect(posts).toEqual([LIFT_LIGHTS, LIFT_LIGHTS])
    })
    it('a desk whose state read failed is never lifted, by its button or by Shift+B, even if it is dark', async () => {
        light.blackout = true
        desk.blackout = true
        mode.laser = 'reads-down' // the laser desk's state read fails; its routes would still take a POST
        await refresh()
        expect([$('liftLights').disabled, $('liftLaser').disabled]).toEqual([false, true])
        $('liftLaser').disabled = false // even if the button were enabled, the press reads the last state again
        await press($('liftLaser'))
        key('B', { shiftKey: true })
        await settle()
        expect(posts).toEqual([LIFT_LIGHTS])
        posts = []
        mode.laser = 'ok'
        mode.light = 'reads-down'
        light.blackout = true
        await refresh()
        expect([$('liftLights').disabled, $('liftLaser').disabled]).toEqual([true, false])
        $('liftLights').disabled = false
        await press($('liftLights'))
        key('B', { shiftKey: true })
        await settle()
        expect(posts).toEqual([LIFT_LASER])
        expect(light.blackout).toBe(true) // the desk that did not answer stays dark
    })
    it('the panic key: B is Blackout all, dark only; Shift+B lifts each dark desk once; a text field keeps B; a held key does not repeat', async () => {
        key('b')
        await settle()
        expect(posts).toEqual(DARK)
        posts = []
        key('b', { repeat: true })
        key('B', { shiftKey: true, repeat: true })
        const field = document.createElement('input')
        field.type = 'text'
        document.body.append(field)
        try {
            key('b', {}, field)
            key('B', { shiftKey: true }, field)
            await settle()
        } finally { field.remove() }
        expect(posts).toEqual([])
        key('B', { shiftKey: true })
        key('B', { shiftKey: true }) // inside the gap: ignored
        await settle()
        expect(posts).toEqual([LIFT_LIGHTS, LIFT_LASER])
        expect($('status').textContent).toContain('Blackout lifted on the lights and the laser.')
        posts = []
        key('B', { shiftKey: true })
        await settle()
        expect(posts).toEqual([]) // nothing is dark: nothing to lift
        expect($('status').textContent).toContain('Nothing to lift')
    })
    it('B while a lift is still in flight: once the lift has landed the dark goes again, so the panic press wins', async () => {
        light.blackout = true
        desk.blackout = true
        await refresh()
        let open
        gate = new Promise((resolve) => { open = resolve })
        key('B', { shiftKey: true }) // both lifts wait at the gate
        await sleep(10)
        key('b')
        await sleep(10)
        open()
        gate = null
        await settle()
        expect(lifts()).toEqual([LIFT_LIGHTS, LIFT_LASER])
        expect(posts.slice(-2)).toEqual(DARK)
        expect(light.blackout && desk.blackout).toBe(true)
    })
    it('Blackout all still sends both when the laser desk does not answer, and says which one it did not reach', async () => {
        mode.laser = 'down'
        await refresh()
        await press($('blackoutAll'))
        expect(posts.map((p) => p.url)).toEqual(['../light/api/master', '../laser/desk/api/blackout'])
        expect($('status').textContent).toContain('did not reach the laser desk')
    })
    it('Release holds lets go of the holds made by hand; Release all holds of every hold, universe by universe', async () => {
        light.raw = { '0:1': 255, '0:2': 255, '1:3': 0 }
        light.rawOwners = { '1:3': 'cable-check' }
        await refresh()
        expect($('releaseHolds').textContent).toBe('Release holds (2)')
        expect($('releaseAllHolds').hidden).toBe(false)
        expect($('releaseAllHolds').textContent).toBe('Release all holds (3)')
        await press($('releaseHolds'))
        expect(posts).toEqual([{ url: '../light/api/raw', body: { clear: true, universe: 0 } }])
        posts = []
        light.raw = { '0:1': 255, '1:3': 0 }
        await refresh()
        await press($('releaseAllHolds'))
        expect(posts).toEqual([
            { url: '../light/api/raw', body: { clear: true, all: true, universe: 0 } },
            { url: '../light/api/raw', body: { clear: true, all: true, universe: 1 } }
        ])
    })
    it('a lamp\'s fader: the lighting desk\'s fixture route, as its own page sends a level', async () => {
        await slide(lampRow('f2').querySelector('input'), 100)
        expect(posts).toEqual([{ url: '../light/api/fixture', body: { id: 'f2', values: { dimmer: 100 }, on: true } }])
    })
    it('the light master: the lighting desk\'s master route', async () => {
        await slide($('lightMaster'), 128)
        expect(posts).toEqual([{ url: '../light/api/master', body: { master: 128 } }])
    })
    it('On and Off: the laser engine\'s arm route for that one cube, through the laser desk\'s Out', async () => {
        await press(cubeCard('cube-a').querySelector('.cubeon'))
        await press(cubeCard('cube-a').querySelector('.cubeoff'))
        expect(posts).toEqual([
            { url: '../laser/api/arm', body: { armed: true, cube: 'cube-a', out: 'desk' } },
            { url: '../laser/api/arm', body: { armed: false, cube: 'cube-a', out: 'desk' } }
        ])
    })
    it('On in phrase mode: never sends a phrase; it points to the Laser desk', async () => {
        engine.signOff = 'phrase'
        await press(cubeCard('cube-b').querySelector('.cubeon'))
        expect(posts).toEqual([{ url: '../laser/api/arm', body: { armed: true, cube: 'cube-b', out: 'desk' } }])
        expect($('status').textContent).toContain('Press On on the Laser desk')
    })
    it('Size and the laser master: the laser desk\'s cube and master routes', async () => {
        await slide(cubeCard('cube-a').querySelector('input[type=range]'), 2)
        await slide($('laserMaster'), 0.5)
        expect(posts).toEqual([
            { url: '../laser/desk/api/cube', body: { id: 'cube-a', size: 2 } },
            { url: '../laser/desk/api/master', body: { level: 0.5 } }
        ])
    })
    it('a poll leaves a fader under the hand alone', async () => {
        await slide($('laserMaster'), 0.3)
        desk.master = 0.9
        await refresh()
        expect($('laserMaster').value).toBe('0.3')
    })
})

describe('a half that is missing says so', () => {
    it('no laser desk: the laser half says it did not answer; the lights work on', async () => {
        mode.laser = '404'
        await refresh()
        expect($('laserNote').hidden).toBe(false)
        expect($('laserNote').textContent).toContain('The laser desk did not answer')
        expect($('lightsNote').hidden).toBe(true)
        await press(sceneBtn('warm'))
        expect(posts.map((p) => p.url)).toEqual(['../light/api/scenes/recall', '../laser/desk/api/go'])
    })
    it('no lighting desk: the lights half and the scenes say so', async () => {
        mode.light = 'down'
        await refresh()
        expect($('lightsNote').textContent).toContain('The lighting desk did not answer')
        expect($('scenesNote').textContent).toContain('The lighting desk did not answer')
        expect($('nowScene').textContent).toBe('Lights: no answer')
    })
    it('nothing patched, no cubes set up: each half says so in plain words', async () => {
        light.fixtures = []
        desk.cubes = []
        engine.cubes = []
        await refresh()
        expect($('lightsNote').textContent).toContain('No lamps are patched')
        expect($('laserNote').textContent).toContain('No cubes are set up')
        expect(document.querySelectorAll('.lamp, .cubecard')).toHaveLength(0)
    })
})

// jsdom has no layout engine, so the one-screen fit is guarded where it is decided: the page is a five-row grid of the
// whole screen with no page scroll, the fixed rows are tokens that add up inside 758 px, and every list that can grow
// scrolls inside its own area. The real fit is measured in a browser at 1278 x 758 (the session note has the numbers).
describe('one screen, 1278 x 758, no page scroll', () => {
    beforeAll(() => { document.querySelector('#density [data-density="touch"]').click() }) // these are the Touch sizes
    const css = fs.readFileSync(path.join(UI, 'show.css'), 'utf8')
    const token = (name) => Number((css.match(new RegExp(`--${name}:\\s*(\\d+)px`)) || [])[1])
    const rule = (selector) => (css.match(new RegExp(`(^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`)) || [])[2] || ''
    it('the fixed rows and the least the bank gets add up inside 758 px', () => {
        const rows = ['top-h', 'scenes-h', 'live-h', 'links-h', 'bank-min'].map(token)
        expect(rows.every((n) => n > 0)).toBe(true)
        expect(rows.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(758)
        expect(rule('body.showdesk')).toMatch(/grid-template-rows:\s*var\(--top-h\) var\(--scenes-h\) var\(--live-h\) minmax\(var\(--bank-min\), var\(--bank-max\)\) var\(--links-h\)/)
        expect(css).toMatch(/:root \{[^}]*--bank-max:\s*1fr;/) // Touch: the bank takes the rest of the screen
        expect(rule('body.showdesk')).toMatch(/height:\s*100vh/)
        expect(rule('body.showdesk')).toMatch(/overflow:\s*hidden/)
        expect(rule('html, body.showdesk')).toMatch(/overflow:\s*hidden/)
    })
    it('the five rows are the body\'s five areas, in order: the top line, the scene keys, the live strip, the bank, the links', () => {
        const areas = [...document.body.children].filter((n) => n.tagName !== 'SCRIPT').map((n) => n.id || n.className.split(' ').pop())
        expect(areas).toEqual(['showbar', 'showscenes', 'live', 'bank', 'links'])
    })
    it('the scene keys are one row that scrolls inside itself; the lamps, the cubes and the shapes scroll inside their own row', () => {
        expect(token('scene-btn-h') + 10).toBeLessThanOrEqual(token('scenes-h'))
        expect(css).toMatch(/\.showscenes \.scenegrid \{[^}]*grid-auto-flow: column;[^}]*overflow-x: auto/)
        for (const list of ['.lamps', '.lasers', '.shapes']) expect(rule(list)).toMatch(/overflow-x:\s*auto/)
    })
    it('targets are 44 px at least in one direction, colour pads 40; Blackout all a fixed width at the far right, the two lifts beside it', () => {
        expect(token('target')).toBeGreaterThanOrEqual(44)
        expect(token('pad')).toBe(40)
        expect(token('scene-btn-h')).toBeGreaterThanOrEqual(44)
        expect(rule('.blackoutall')).toMatch(/flex:\s*none;\s*width:\s*var\(--bo-w\)/)
        expect([token('bo-w'), token('bo-h'), token('lift-w'), token('lift-h'), token('top-h')]).toEqual([160, 44, 100, 32, 64]) // Touch: one dense top line (the owner, 21:1x)
        const stops = $('blackoutAll').parentElement
        expect(stops.parentElement.lastElementChild).toBe(stops)
        expect(stops.firstElementChild).toBe($('blackoutAll'))
        expect([...stops.querySelectorAll('.lifts .liftbtn')].map((b) => b.id)).toEqual(['liftLights', 'liftLaser'])
        expect($('bank').querySelector('.liftbtn')).toBeNull()
    })
    it('the lifts stand 24 px clear of Blackout all: a panic press that lands a little off it lifts nothing', () => {
        expect(token('gap-stop')).toBeGreaterThanOrEqual(24)
        expect(rule('.stops')).toMatch(/flex-direction:\s*row-reverse;[^}]*gap:\s*var\(--gap-stop\)/)
        expect(rule('.lifts')).not.toMatch(/margin/)
        expect(rule('.blackoutall')).not.toMatch(/margin/)
    })
    it('Save scene and Undo sit in the live strip, away from Blackout all', () => {
        for (const id of ['saveScene', 'undoBtn']) {
            expect($(id).closest('#live')).not.toBeNull()
            expect($(id).closest('.showbar')).toBeNull()
        }
    })
    it('the faders are square, like the lighting desk\'s: no native look, both thumbs and tracks radius 0, tokens only', () => {
        const flat = css.replace(/\/\*[\s\S]*?\*\//g, '')
        const block = (pseudo) => (flat.match(new RegExp(`body\\.showdesk input\\[type=range\\]${pseudo}\\s*\\{([^}]*)\\}`)) || [])[1] || ''
        expect(block('')).toMatch(/-webkit-appearance:\s*none;\s*appearance:\s*none/)
        for (const thumb of ['::-webkit-slider-thumb', '::-moz-range-thumb']) {
            expect(block(thumb)).toMatch(/border-radius:\s*0;/)
            expect(block(thumb)).toMatch(/width:\s*var\(--thumb-lw\);\s*height:\s*var\(--thumb-lh\)/) // Touch 44 x 22: 44 where the hand finds it
            expect(block(thumb)).toMatch(/background:\s*var\(--muted\)/)
        }
        for (const track of ['::-webkit-slider-runnable-track', '::-moz-range-track']) expect(block(track)).toMatch(/height:\s*var\(--track\);\s*background:\s*var\(--line\);\s*border:\s*0;\s*border-radius:\s*0;/)
        expect(flat).toMatch(/#live:not\(\.is-idle\) input\[type=range\]::-webkit-slider-thumb \{ background: var\(--text\); \}/) // full strength only for the live look
        expect(block('::-webkit-slider-thumb')).toMatch(/margin-top:\s*calc\(\(var\(--track\) - var\(--thumb-lh\)\) \/ 2\)/) // centred on the track
        expect(['thumb-lw', 'thumb-lh', 'thumb-uw', 'thumb-uh', 'fader-h', 'track'].map(token)).toEqual([24, 14, 14, 24, 32, 4]) // Touch: small caps, a 32 px hit area (the owner, 21:2x)
        expect(flat).not.toMatch(/accent-color/)
    })
    it('brings no colour of its own: every colour it names is one the laser desk already uses', () => {
        const deskCss = fs.readFileSync(path.join(here, '../laser/ui/desk.css'), 'utf8')
        const deskJs = fs.readFileSync(path.join(here, '../laser/ui/desk.js'), 'utf8')
        const named = [...css.matchAll(/#[0-9a-f]{3,8}\b/gi), ...fs.readFileSync(path.join(UI, 'show.js'), 'utf8').matchAll(/#[0-9a-f]{6}\b|rgba\([^)]*\)/gi)].map((m) => m[0].toLowerCase())
        const palette = ['#e0001a', '#f0eaff', '#7a20ff'] // the show palette's own colours (brief 2026-10-31), used only as swatches
        for (const c of named) expect(deskCss.toLowerCase().includes(c) || deskJs.toLowerCase().includes(c) || palette.includes(c), c).toBe(true)
        expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/font-family|@font-face|transition|animation/)
    })
})

// Two densities (the owner, 2026-10-31 20:5x, at the stage Mac with a mouse: "fix the UI, it is huge … it's not the touch
// screen"): Touch keeps the sizes above; Compact is one block of tokens on body[data-density="compact"]; the switch is the
// only logic. The real fit is measured in a browser at 1278 x 758 and 1280 x 700 (the session note has the numbers).
describe('two densities: Touch and Compact', () => {
    const css = fs.readFileSync(path.join(UI, 'show.css'), 'utf8')
    const token = (name) => Number((css.match(new RegExp(`--${name}:\\s*(\\d+)px`)) || [])[1])
    const block = (css.match(/\nbody\.showdesk\[data-density="compact"\]\s*\{([^}]*)\}/) || [])[1] || ''
    const compact = (name) => Number((block.match(new RegExp(`(?:^|[\\s;])--${name}:\\s*(\\d+)px`)) || [])[1])
    const buttons = () => [...$('density').querySelectorAll('button[data-density]')]
    it('a Touch · Compact switch sits in the bottom line, next to the MIDI line', () => {
        expect($('density').closest('.links')).not.toBeNull()
        expect($('density').nextElementSibling).toBe($('midiLine'))
        expect(buttons().map((b) => b.textContent)).toEqual(['Touch', 'Compact'])
        expect($('density').textContent.replace(/\s+/g, '')).toBe('Touch·Compact')
        expect(buttons().every((b) => !b.dataset.midi)).toBe(true) // MIDI never reaches it
    })
    it('a press sets body[data-density] and keeps the choice in this browser; nothing is sent', async () => {
        posts = []
        buttons()[1].click()
        expect(document.body.dataset.density).toBe('compact')
        expect(window.localStorage.getItem('diShowDesk.density.v1')).toBe('compact')
        expect(buttons().map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true'])
        buttons()[0].click()
        expect(document.body.dataset.density).toBe('touch')
        expect(window.localStorage.getItem('diShowDesk.density.v1')).toBe('touch')
        expect(buttons().map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false'])
        await settle()
        expect(posts).toEqual([])
    })
    it('the stored choice wins; until one is made, a fine pointer and no coarse one means Compact, anything else Touch', () => {
        const pick = window.DiShowDesk.pickDensity
        const media = (fine, coarse) => (q) => ({ matches: q === '(pointer: fine)' ? fine : q === '(any-pointer: coarse)' ? coarse : false })
        expect(pick(null, media(true, false))).toBe('compact')
        expect(pick(null, media(true, true))).toBe('touch')
        expect(pick(null, media(false, true))).toBe('touch')
        expect(pick(null, null)).toBe('touch') // jsdom and old browsers: no matchMedia
        expect(pick(null, () => { throw new Error('no') })).toBe('touch')
        expect(pick('touch', media(true, false))).toBe('touch')
        expect(pick('compact', media(false, true))).toBe('compact')
        expect(pick('huge', media(true, false))).toBe('compact')
    })
    it('Compact is tokens only, with the asked sizes; the rows fit a 1280 x 700 window with air below', () => {
        const decls = block.split(';').map((d) => d.trim()).filter(Boolean)
        expect(decls.length).toBeGreaterThan(30)
        for (const d of decls) expect(d).toMatch(/^--[a-z-]+:\s*\S/)
        const want = { 'thumb-lw': 16, 'thumb-lh': 10, 'thumb-uw': 10, 'thumb-uh': 16, track: 3, 'fader-h': 20, pad: 26, 'lamp-pad': 22, 'scene-btn-h': 52,
            'shape-h': 26, 'shape-font': 12, 'fx-font': 12, 'knob-font': 12, row: 26, 'preview-w': 132, 'bo-w': 140, 'bo-h': 36, 'lift-w': 90, 'lift-h': 28, 'top-h': 48, 'look-font': 10 }
        for (const [name, px] of Object.entries(want)) expect(compact(name), name).toBe(px)
        expect(block).toMatch(/--preview-ar:\s*132 \/ 100;/)
        expect(block).toMatch(/--scene-dir:\s*row;/) // the number and the name on one line
        expect(block).not.toMatch(/--master-fader-w/) // the masters stay 44 px wide
        expect(token('master-fader-w')).toBe(44)
        const rows = ['top-h', 'scenes-h', 'live-h', 'bank-max', 'links-h'].map(compact)
        expect(rows.every((n) => n > 0)).toBe(true)
        expect(rows.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(660)
        expect(compact('bank-min')).toBe(compact('bank-max'))
        expect(compact('scene-btn-h') + 10).toBeLessThanOrEqual(compact('scenes-h'))
        expect(compact('shapes-h')).toBeGreaterThanOrEqual(2 * compact('shape-h') + 3)
        expect(compact('pad') + compact('shapes-h') + 3 * compact('row') + 4 * 4 + 2 * 2 + 1).toBeLessThanOrEqual(compact('live-h'))
        expect(compact('lift-h') + 2 * compact('top-pad')).toBeLessThanOrEqual(compact('top-h')) // the lifts side by side
        expect(compact('bo-h') + 2 * compact('top-pad')).toBeLessThanOrEqual(compact('top-h'))
        for (const [a, b] of [['pad', 'pad'], // the inputs are the controls; the caps are only drawn ['lamp-pad', 'lamp-pad'], ['shape-h', 'target'],
            ['row', 'row'], ['lift-w', 'lift-h'], ['bo-w', 'bo-h'], ['target', 'target'], ['vfader-w', 'vfader-w']]) {
            expect(Math.max(compact(a), compact(b)), `${a} x ${b}`).toBeGreaterThanOrEqual(22)
        }
    })
    it('the top line has the desk switch after the mark: Show (this page, marked) · Light · Laser, plain links in this window', () => {
        const sw = document.querySelector('.showbar > .deskswitch')
        expect(sw).not.toBeNull()
        expect(sw.previousElementSibling.classList.contains('homelink')).toBe(true)
        const links = [...sw.querySelectorAll('a')]
        expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([['Show', './'], ['Light', '../light/'], ['Laser', '../laser/']])
        expect(links.map((a) => a.getAttribute('aria-current'))).toEqual(['page', null, null])
        expect(links.every((a) => !a.hasAttribute('target'))).toBe(true)
        expect(token('desk-h')).toBeGreaterThanOrEqual(44)
        expect(compact('desk-h')).toBeGreaterThanOrEqual(28)
        expect([...document.querySelectorAll('.links a')].map((a) => a.getAttribute('href'))).toEqual(['../laser/', '../light/']) // the bottom links stay
    })
    it('the scene row is labelled just Scenes; its explainer is the row\'s title, its words kept for screen readers', () => {
        expect(document.querySelector('.showscenes .panehead h2').textContent).toBe('Scenes')
        expect(document.querySelector('.showscenes').title).toBe($('scenesNote').textContent)
        expect($('scenesNote').textContent.length).toBeGreaterThan(0)
        expect(css).toMatch(/\n\.showscenes \.panehead \.muted \{ position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect\(0 0 0 0\)/)
    })
    it('the lifts stand 24 px clear of Blackout all in both densities', () => {
        expect(token('gap-stop')).toBeGreaterThanOrEqual(24)
        expect(Number.isNaN(compact('gap-stop')) || compact('gap-stop') >= 24).toBe(true)
        expect(css).toMatch(/\n\.stops \{[^}]*gap:\s*var\(--gap-stop\)/)
    })
})

describe('the lamp colours are the lighting desk\'s own', () => {
    it('colour.js carries the same emitter table as the lighting desk page (app.js)', () => {
        const app = fs.readFileSync(path.join(here, '../lighting/ui/app.js'), 'utf8')
        const block = app.match(/const EMITTER_MIX = (\{[\s\S]*?\});/)[1]
        expect(require('../lighting/ui/colour.js').EMITTER_MIX).toEqual(new Function(`return (${block})`)())
    })
})

describe('the live strip plays the live look with the laser desk\'s own looks/edit', () => {
    const edits = () => posts.filter((p) => p.url === '../laser/desk/api/looks/edit').map((p) => p.body)
    it('a fader: only after a move, only with the live id, at most one per 60 ms per field, the last value wins', async () => {
        await sleep(150)
        expect(edits()).toEqual([])
        const input = document.querySelector('#liveRowA input[data-midi="live:level"]')
        for (const v of [0.1, 0.2, 0.3, 0.4, 0.5]) { input.value = String(v); input.dispatchEvent(new Event('input')) }
        await settle()
        expect(edits().length).toBeGreaterThan(0)
        expect(edits().length).toBeLessThan(5)
        expect(edits().every((b) => b.id === 'ring' && Object.keys(b).sort().join() === 'id,level')).toBe(true)
        expect(edits().at(-1).level).toBe(0.5)
    })
    it('nothing is sent while no look is live, by a fader, a pad or MIDI; the strip says so', async () => {
        desk.liveId = null
        desk.live = null
        await refresh()
        expect($('liveName').textContent).toBe('No look is live: press a scene')
        const input = document.querySelector('#liveRowA input[data-midi="live:size"]')
        expect(input.disabled).toBe(true)
        input.value = '0.2'
        input.dispatchEvent(new Event('input'))
        await press(document.querySelector('.colourpad'))
        await press(document.querySelector('.shapepad'))
        midi(0xbe, 4, 64)
        await settle()
        expect(edits()).toEqual([])
    })
    it('a pad press posts one looks/edit with its field: colour, shape (spots, the dots, first), an effect off and back on, mirror', async () => {
        expect(document.querySelector('#liveShapes .shapepad').dataset.shape).toBe('spots')
        await press(document.querySelector('.colourpad[data-colour="#7a20ff"]'))
        await press(document.querySelector('.shapepad[data-shape="spots"]'))
        await press(document.querySelector('[data-effect="pulse"]'))
        await press(document.querySelector('[data-effect="pulse"]'))
        await press($('liveMirror'))
        expect(edits()).toEqual([
            { id: 'ring', colour: '#7a20ff', rainbow: false }, { id: 'ring', shape: 'spots' }, { id: 'ring', pulse: 0 }, { id: 'ring', pulse: 0.3 }, { id: 'ring', mirror: true }
        ])
    })
    it('the XY pad posts x and height of the live look, throttled, the last place wins', async () => {
        const pad = $('xyPad')
        pad.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200 })
        pad.dispatchEvent(new window.MouseEvent('pointerdown', { clientX: 150, clientY: 50, bubbles: true }))
        for (const [x, y] of [[160, 40], [170, 30], [180, 20]]) pad.dispatchEvent(new window.MouseEvent('pointermove', { clientX: x, clientY: y, bubbles: true }))
        pad.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true }))
        await settle()
        const xs = edits().filter((b) => 'x' in b)
        expect(xs.length).toBeGreaterThan(0)
        expect(xs.length).toBeLessThan(4)
        expect(xs.at(-1)).toEqual({ id: 'ring', x: 0.8 })
        expect(edits().filter((b) => 'height' in b).at(-1)).toEqual({ id: 'ring', height: 0.8 })
    })
    it('the lamp swatches: the lighting desk\'s fixture route with that lamp\'s own colour keys; a dimmer-only lamp has none', async () => {
        await press(lampRow('f1').querySelector('.lampcolours [data-colour="#e0001a"]'))
        await press(lampRow('f2').querySelector('.lampcolours [data-colour="#20d8ff"]'))
        expect(lampRow('f3').querySelectorAll('.lampcolours button').length).toBe(0)
        expect(posts).toEqual([
            { url: '../light/api/fixture', body: { id: 'f1', values: { r: 224, g: 0, b: 26 }, on: true } },
            { url: '../light/api/fixture', body: { id: 'f2', values: { r: 32, g: 216, b: 255, w: 0 }, on: true } }
        ])
    })
    it('Save scene: the lit scene restaged (even after the desk forgot it) and the live look stored in place; never desk/api/save', async () => {
        light.activeScene = null // the lighting desk forgets its scene once a lamp is changed by hand
        await refresh()
        expect($('nowScene').textContent).toBe('Warm open · changed')
        await press($('saveScene'))
        expect(posts).toEqual([
            { url: '../light/api/scenes/update', body: { id: 'warm', restage: true } },
            { url: '../laser/desk/api/store', body: { id: 'ring', look: expect.objectContaining({ id: 'ring', name: 'Ring', shape: 'circle', follows: 'warm' }) } }
        ])
        expect(posts.some((p) => p.url === '../laser/desk/api/save')).toBe(false)
        expect(desk.liveId).toBe('ring')
        expect(desk.looks.find((l) => l.id === 'ring').follows).toBe('warm')
        expect(table.warm).toEqual({ look: 'ring', name: 'Ring' })
    })
    it('Undo: the laser desk\'s own undo, then the lit light scene recalled', async () => {
        await press($('undoBtn'))
        expect(posts).toEqual([{ url: '../laser/desk/api/undo', body: {} }, { url: '../light/api/scenes/recall', body: { id: 'warm' } }])
    })
    it('the status says unsaved changes while the laser desk reports them', async () => {
        desk.unsaved = true
        await refresh()
        expect($('saveState').textContent).toMatch(/^unsaved changes · laser: unsaved · lamps: saved on Save scene$/)
    })
    it('BPM and Tap: the laser desk\'s own bpm route', async () => {
        await press($('tapBtn'))
        await slide($('bpm'), 128)
        expect(posts).toEqual([{ url: '../laser/desk/api/bpm', body: { tap: true } }, { url: '../laser/desk/api/bpm', body: { bpm: 128 } }])
    })
    it('the shapes are the laser desk\'s own list (shared/laserShapes.cjs)', () => {
        const src = fs.readFileSync(path.join(UI, 'show.js'), 'utf8')
        const copy = new Function(`return ${src.match(/const SHAPES = (\[[\s\S]*?\])/)[1]}`)()
        expect(copy).toEqual(require('../../../shared/laserShapes.cjs').LASER_SHAPES)
    })
})

describe('MIDI: a controller in the page, the Xone:K2 map by default', () => {
    it('the MIDI line names the device; the default map uses the K2\'s own numbers on channel 15 (14 on the wire)', () => {
        expect($('midiLine').textContent).toBe('MIDI: XONE:K2')
        const k2 = JSON.parse(fs.readFileSync(path.join(UI, 'midi/xone-k2.json'), 'utf8'))
        const num = (control) => k2.find((c) => c.control === control).number
        const map = window.DiShowDesk.midiMap()
        expect(map.find((m) => m.target === 'light-master')).toMatchObject({ kind: 'cc', ch: 14, num: num('pot 12') }) // fader 4 is dead on the owner's K2
        expect(map.find((m) => m.kind === 'cc' && m.num === num('fader 4'))).toMatchObject({ target: 'spare' })
        expect(map.find((m) => m.target === 'lamp:0')).toMatchObject({ kind: 'cc', ch: 14, num: num('fader 1') })
        expect(map.find((m) => m.target === 'live:rotation')).toMatchObject({ kind: 'cc', ch: 14, num: num('encoder 1'), relative: true })
    })
    it('a fader picks up: nothing moves or posts until the control passes the screen\'s value, then it follows', async () => {
        midi(0xbe, 15, 0)
        midi(0xbe, 15, 40)
        await settle()
        expect(posts).toEqual([])
        expect($('lightMaster').value).toBe('255')
        midi(0xbe, 15, 127)
        await settle()
        midi(0xbe, 15, 100)
        await settle()
        expect(posts.at(-1)).toEqual({ url: '../light/api/master', body: { master: 201 } })
    })
    it('a pot on the live look picks up too, then posts looks/edit with the live id', async () => {
        midi(0xbe, 4, 0) // level is 1 on the screen: a pot at 0 waits
        await settle()
        expect(posts).toEqual([])
        midi(0xbe, 4, 127)
        midi(0xbe, 4, 64)
        await settle()
        expect(posts.filter((p) => p.url === '../laser/desk/api/looks/edit').at(-1)).toEqual({ url: '../laser/desk/api/looks/edit', body: { id: 'ring', level: 0.5 } })
    })
    it('a button presses its scene key: matrix B is scene 01', async () => {
        midi(0x9e, 37, 127)
        await settle()
        expect(posts[0]).toEqual({ url: '../light/api/scenes/recall', body: { id: 'blue' } })
    })
    it('the Blackout button (matrix P) sends only the two dark routes', async () => {
        midi(0x9e, 27, 127)
        await settle()
        expect(posts).toEqual(DARK)
    })
    it('no MIDI message of any kind, channel, number or value reaches On, Off, a lift, Undo, Save or Release', async () => {
        desk.blackout = true
        light.blackout = true
        light.raw = { '0:1': 255 }
        await refresh()
        for (let ch = 0; ch < 16; ch += 1) {
            for (let n = 0; n < 128; n += 1) for (const v of [0, 1, 64, 127]) { midi(0xb0 | ch, n, v); midi(0x90 | ch, n, v); midi(0x80 | ch, n, v) }
        }
        await sleep(400)
        await refresh()
        const bad = posts.filter((p) => p.url === '../laser/api/arm' || /\/(undo|store|save|scenes\/update|raw|release)$/.test(p.url) || p.body.blackout === false || p.body.on === false)
        expect(bad).toEqual([])
        expect(posts.length).toBeGreaterThan(0)
    })
    it('while Learn waits for a control, the Blackout button still blacks out and is not learned', async () => {
        await press($('midiLearn'))
        $('lightMaster').dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true }))
        $('lightMaster').dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true }))
        midi(0x9e, 27, 127)
        await settle()
        expect(posts).toEqual(DARK)
        const sceneKey = document.querySelector('[data-midi^="scene:"]')
        if (sceneKey) {
            sceneKey.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true }))
            sceneKey.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true }))
            midi(0x9e, 27, 127)
            await settle()
        }
        expect(window.DiShowDesk.midiMap().filter((m) => m.kind === 'note' && m.ch === 14 && m.num === 27).map((m) => m.target)).toEqual(['blackout'])
        expect(posts.filter((p) => p.url === '../light/api/scenes/recall')).toEqual([])
        await press($('midiLearn')) // leave Learn mode, so the next test starts clean
    })
    it('Learn maps one control to a fader; On, Off, a lift, Undo and Save cannot be picked', async () => {
        await press($('midiLearn'))
        for (const n of [cubeCard('cube-a').querySelector('.cubeon'), cubeCard('cube-a').querySelector('.cubeoff'), $('liftLights'), $('undoBtn'), $('saveScene')]) n.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true }))
        midi(0xb0, 7, 10)
        expect(window.DiShowDesk.midiMap().some((m) => m.ch === 0 && m.num === 7)).toBe(false)
        $('lightMaster').dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true }))
        $('lightMaster').dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true }))
        midi(0xb0, 7, 10)
        expect(window.DiShowDesk.midiMap()).toContainEqual({ kind: 'cc', ch: 0, num: 7, target: 'light-master' })
        await settle()
        expect(posts.filter((p) => p.url === '../laser/api/arm' || p.url.endsWith('/undo') || p.url.endsWith('/store'))).toEqual([])
    })
})

// Two pages of the show desk (the stage Mac and the Arch desk) meet only through the desks' state: each page reads both
// desks every POLL_MS (1 s) while it is visible, and leaves a fader under a hand alone until 1 s after it is let go.
describe('two pages on two machines meet through the poll', () => {
    it('a change made on another page shows here within 2.5 s, with no press on this page', async () => {
        const wasHidden = document.hidden
        if (wasHidden) { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')) }
        try {
            await sleep(1100) // past the hold of any fader the test before touched
            const want = $('lightMaster').value === '128' ? '64' : '128'
            light.master = Number(want)
            const t0 = Date.now()
            while ($('lightMaster').value !== want && Date.now() - t0 < 2500) await sleep(50)
            expect($('lightMaster').value).toBe(want)
            expect(Date.now() - t0).toBeLessThanOrEqual(2500)
        } finally {
            if (wasHidden) { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')) }
        }
    }, 10000)
})

// Presence (the owner, 23:0x: "make colours like if someone is active, that is coloured around"): a ring on the control a browser
// touched, in that browser's colour; the frame in the colour of whoever drives; a list of who is on. The fake board above stands in
// for the server's; presence.js has the rules and presence.test.js tests them on their own. The 404 test is last: it makes the
// page stop asking for 30 s.
describe('presence: who is on, who touched what', () => {
    const OTHER = 'a1b2c3d4e5f6'
    const THIRD = '0f0f0f0f0f0f'
    const mineId = () => window.DiShowDesk.presence.self().id
    const join = (id, label, slot, seenAgo = 0) => board.clients.set(id, { id, label, slot, seenAt: Date.now() - seenAgo, touchAt: null })
    const touchAs = (id, control, ago) => {
        board.touches = board.touches.filter((x) => x.control !== control)
        board.touches.push({ control, id, at: Date.now() - ago })
        board.clients.get(id).touchAt = Date.now() - ago
    }
    const seatMe = async (slot) => { board.clients.set(mineId(), { id: mineId(), label: '', slot, seenAt: Date.now(), touchAt: null }); await refresh() }
    const by = (node) => node.getAttribute('data-by')
    const ringOf = (node) => node.style.getPropertyValue('--ring')
    const chips = () => [...$('whoIsOn').querySelectorAll('.whochip')]
    beforeEach(() => { board.clients.clear(); board.touches = []; window.DiShowDesk.presence.reset() })

    it('a ring appears on the control another browser touched, in its colour: full to 1.5 s, fading, gone by 4 s; the frame follows', async () => {
        join(OTHER, 'phone', 2)
        touchAs(OTHER, 'lamp:f1', 500)
        await refresh()
        expect([by(lampRow('f1')), ringOf(lampRow('f1'))]).toEqual(['2', '1.00'])
        expect(document.body.dataset.driver).toBe('2')
        expect(lampRow('f2').hasAttribute('data-by')).toBe(false) // a control nobody touched has no ring
        touchAs(OTHER, 'lamp:f1', 3200)
        await refresh()
        expect(Number(ringOf(lampRow('f1')))).toBeCloseTo(0.32, 1)
        expect(document.body.dataset.driver).toBe('2')
        touchAs(OTHER, 'lamp:f1', 4100)
        await refresh()
        expect(lampRow('f1').hasAttribute('data-by')).toBe(false)
        expect(document.body.hasAttribute('data-driver')).toBe(false)
    })
    it('one colour per browser: each keeps its own on every control it touches, and a ring never moves a press (pointer-events none, tokens only)', async () => {
        join(OTHER, 'phone', 2)
        join(THIRD, 'Mac', 4)
        touchAs(OTHER, 'lamp:f1', 200)
        touchAs(THIRD, 'scene:blue', 300)
        touchAs(OTHER, 'laser-master', 400)
        await refresh()
        expect([by(lampRow('f1')), by(sceneBtn('blue')), by(document.querySelector('[data-ctl="laser-master"]'))]).toEqual(['2', '4', '2'])
        expect(document.body.dataset.driver).toBe('2') // the latest touch was OTHER's on lamp:f1
        const css = fs.readFileSync(path.join(UI, 'show.css'), 'utf8')
        expect([0, 1, 2, 3, 4, 5].map((n) => (css.match(new RegExp(`--c${n}:\\s*(#[0-9a-f]{6})`)) || [])[1])).toEqual(['#e0001a', '#7a20ff', '#ffb020', '#f0eaff', '#00ffb0', '#ff30c0'])
        for (const n of [0, 1, 2, 3, 4, 5]) expect(css).toContain(`[data-by="${n}"], [data-driver="${n}"] { --by: var(--c${n}); }`)
        expect(css).toMatch(/\[data-ctl\]\[data-by\]::before \{[^}]*pointer-events: none/)
        expect(css).toMatch(/body\.showdesk\[data-driver\]::after \{[^}]*position: fixed[^}]*pointer-events: none/)
    })
    it('my own press rings at once, in my colour, before any answer; a write the desk refused leaves no ring', async () => {
        await seatMe(3)
        let release
        holdWrites = new Promise((r) => { release = r })
        sceneBtn('dark').click()
        await sleep(20) // the request is out and waiting: no answer yet
        expect([by(sceneBtn('dark')), ringOf(sceneBtn('dark')), document.body.dataset.driver]).toEqual(['3', '1.00', '3'])
        holdWrites = null
        release()
        await settle()
        expect(by(sceneBtn('dark'))).toBe('3') // taken by the desk, so it stays
        window.DiShowDesk.presence.reset()
        await refresh()
        expect(by(sceneBtn('dark'))).toBe('3') // the board lists the same touch under my id: the same ring, the same colour
        mode.light = 'down'
        await slide(lampRow('f2').querySelector('input'), 50)
        expect(lampRow('f2').hasAttribute('data-by')).toBe(false)
    })
    it('the list in the top line: browsers seen under 5 s or touched under 4 s ago, in slot order, a repeated name numbered, the long gone dropped', async () => {
        await seatMe(5)
        join('c1c1c1c1c1c1', 'phone', 4)
        join('d2d2d2d2d2d2', 'phone', 1)
        join('e3e3e3e3e3e3', 'Mac', 0)
        join('f4f4f4f4f4f4', 'old', 3, 6000) // asked 6 s ago, never touched: not on
        await refresh()
        expect($('whoIsOn').firstElementChild.textContent).toBe('on')
        expect(chips().map((c) => c.textContent)).toEqual(['Mac', 'phone', 'phone 2', 'tab'])
        expect(chips().map((c) => c.getAttribute('data-by'))).toEqual(['0', '1', '4', '5'])
        expect(chips().map((c) => c.classList.contains('is-mine'))).toEqual([false, false, false, true])
        expect(chips().some((c) => c.classList.contains('is-driving'))).toBe(false)
        touchAs('c1c1c1c1c1c1', 'lamp:f1', 100)
        await refresh()
        expect(chips().filter((c) => c.classList.contains('is-driving')).map((c) => c.textContent)).toEqual(['phone 2'])
        expect($('whoIsOn').hidden).toBe(false)
    })
    it('the Name button opens a field of 12 characters; Enter keeps the name in this browser; Escape leaves it; B typed in it sends no blackout', async () => {
        const btn = $('whoName')
        const field = $('whoField')
        const type = (k) => field.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))
        expect(btn.textContent).toBe('Name: tab')
        expect(btn.closest('.links')).not.toBeNull()
        expect(field.hidden).toBe(true)
        btn.click()
        expect(field.hidden).toBe(false)
        expect(field.getAttribute('maxlength')).toBe('12')
        field.value = 'b'
        key('b', {}, field)
        await settle()
        expect(posts).toEqual([]) // the B key stayed in the field
        field.value = 'Stage left plus more'
        type('Escape')
        expect([field.hidden, btn.textContent]).toEqual([true, 'Name: tab'])
        btn.click()
        field.value = 'Արամ'
        type('Enter')
        expect([field.hidden, btn.textContent]).toEqual([true, 'Name: Արամ'])
        expect(JSON.parse(window.localStorage.getItem('diShowDesk.who.v1'))).toEqual({ id: mineId(), label: 'Արամ' })
        heads = []
        await refresh()
        const ask = heads.find((h) => h.url === 'api/who')
        expect(ask.headers['X-Di-Label']).toBe(encodeURIComponent('Արամ'))
        expect(ask.headers['X-Di-Label']).toMatch(/^[\x20-\x7e]+$/)
        expect(chips().find((c) => c.classList.contains('is-mine')).textContent).toBe('Արամ')
        btn.click()
        field.value = '   '
        type('Enter')
        expect(btn.textContent).toBe('Name: tab') // an empty name is the default again
        expect(JSON.parse(window.localStorage.getItem('diShowDesk.who.v1'))).toEqual({ id: mineId(), label: '' })
    })
    it('every control a touch can ring carries a key of the board\'s shape, and every key a press sends has an element; ?presence=0 is read from the address', () => {
        const keys = [...document.querySelectorAll('[data-ctl]')].map((n) => n.getAttribute('data-ctl'))
        for (const k of keys) expect(k, k).toMatch(window.DiPresence.CONTROL)
        const want = ['blackout', 'lift:lights', 'lift:laser', 'release', 'save', 'undo', 'tap', 'bpm', 'light-master', 'laser-master', 'live:xy', 'live:colour', 'live:shape', 'live:mirror',
            ...['level', 'size', 'copies', 'rotation', 'phase', 'pulseBeats', 'sweepBeats', 'points', 'pulse', 'sweep', 'spin', 'cycle'].map((k) => `live:${k}`),
            'lamp:f1', 'lamp:f2', 'lamp:f3', 'scene:warm', 'scene:blue', 'scene:dark', 'size:cube-a', 'size:cube-b', 'on:cube-a', 'on:cube-b']
        expect([...new Set(keys)].sort()).toEqual([...want].sort())
        expect(fs.readFileSync(path.join(UI, 'show.js'), 'utf8')).toMatch(/DiPresence\.enabled\(window\.location\.search\)/)
    })
    it('every press and move names this browser and the control it touched; the reads name nothing but the board\'s own', async () => {
        const id = mineId()
        light.raw = { '0:1': 255 }
        await refresh()
        const cases = [
            ['Blackout all', () => press($('blackoutAll')), ['blackout', 'blackout']],
            ['Lift lights', () => press($('liftLights')), ['lift:lights']],
            ['Lift laser', () => press($('liftLaser')), ['lift:laser']],
            ['a scene', () => press(sceneBtn('blue')), ['scene:blue', 'scene:blue']],
            ['a lamp fader', () => slide(lampRow('f1').querySelector('input'), 90), ['lamp:f1']],
            ['a lamp colour', () => press(lampRow('f1').querySelector('.swatch[data-colour]')), ['lamp:f1']],
            ['Release holds', () => press($('releaseHolds')), ['release']],
            ['the light master', () => slide($('lightMaster'), 100), ['light-master']],
            ['the laser master', () => slide($('laserMaster'), 0.4), ['laser-master']],
            ['BPM', () => slide($('bpm'), 130), ['bpm']],
            ['Tap', () => press($('tapBtn')), ['tap']],
            ['On', () => press(cubeCard('cube-a').querySelector('.cubeon')), ['on:cube-a']],
            ['Off', () => press(cubeCard('cube-a').querySelector('.cubeoff')), ['on:cube-a']],
            ['Size', () => slide(cubeCard('cube-a').querySelector('input[type=range]'), 1.5), ['size:cube-a']],
            ['Save scene', () => press($('saveScene')), ['save', 'save']],
            ['Undo', () => press($('undoBtn')), ['undo', 'undo']],
            ['a live colour', () => press(document.querySelector('#liveColours .colourpad')), ['live:colour']],
            ['a shape', () => press(document.querySelector('#liveShapes .shapepad')), ['live:shape']],
            ['an effect', () => press(document.querySelector('#liveEffects [data-effect="pulse"]')), ['live:pulse']],
            ['a live fader', () => slide(document.querySelector('#liveRowA input[data-midi="live:level"]'), 0.5), ['live:level']],
            ['the XY pad', () => slide(document.querySelector('#xyPad input[data-midi="live:x"]'), 0.5), ['live:xy']],
            ['a MIDI scene key', async () => { midi(0x9e, 37, 127); await settle() }, ['scene:blue', 'scene:blue']],
            ['the B key', async () => { key('b'); await settle() }, ['blackout', 'blackout']]
        ]
        for (const [name, act, controls] of cases) {
            heads = []
            await act()
            const writes = heads.filter((h) => h.method === 'POST')
            expect(writes.map((h) => h.headers['X-Di-Control']), name).toEqual(controls)
            for (const w of writes) {
                expect(w.headers['X-Di-Client'], name).toBe(id)
                expect(w.headers['X-Di-Label'], name).toMatch(/^[\x20-\x7e]+$/)
            }
            for (const c of controls) expect(document.querySelector(`[data-ctl="${c}"]`), c).not.toBeNull()
        }
        heads = []
        posts = []
        await refresh()
        await sleep(650)
        expect(posts).toEqual([]) // a poll still posts nothing
        const reads = heads.filter((h) => h.method === 'GET')
        expect(reads.some((h) => h.url === 'api/who')).toBe(true)
        for (const h of reads) {
            if (h.url === 'api/who') expect([h.headers['X-Di-Client'], h.headers['X-Di-Control']]).toEqual([id, undefined])
            else expect(Object.keys(h.headers).filter((k) => /^x-di-/i.test(k)), h.url).toEqual([])
        }
    }, 20000)
    it('if the board does not list my accepted touch in the next two answers, the status line says so once', async () => {
        boardMode = 'blind'
        await press(sceneBtn('dark')) // its own tick is an answer without the touch
        await refresh() // and two more: a poll already in flight when the write landed does not count
        await refresh()
        expect($('status').textContent).toBe('Others do not see your touches: the desk board did not list them.')
        expect($('whoIsOn').title).toContain('the board did not list your last touches')
        await press(sceneBtn('blue'))
        await refresh()
        await refresh()
        expect($('status').textContent).toContain('Blue hour') // once: the words of the press are back, not the warning again
    }, 20000)
    it('an older server without the board (404): no error, no rings from others, my own chip with the reason, and the page stops asking for a while', async () => {
        boardMode = '404'
        gets = []
        await refresh()
        await refresh()
        await refresh()
        expect(gets.filter((u) => u === 'api/who')).toHaveLength(1) // it asked once, was told 404, and holds off for 30 s
        expect(fs.readFileSync(path.join(UI, 'show.js'), 'utf8')).toMatch(/WHO_RETRY_MS = 30000/)
        expect(chips().map((c) => c.textContent)).toEqual(['tab'])
        expect($('whoIsOn').title).toContain('this server has no board yet')
        expect(document.body.hasAttribute('data-driver')).toBe(false)
        await press(sceneBtn('dark'))
        expect(by(sceneBtn('dark'))).not.toBeNull() // my own ring still works
        expect($('status').textContent).toContain('Dark: lights recalled.')
    }, 20000)
})
