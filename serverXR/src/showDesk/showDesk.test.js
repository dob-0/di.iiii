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

let light, desk, engine, table, posts, gets, mode
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
    desk = { liveId: 'ring', live: { name: 'Ring' }, master: 0.8, blackout: false, looks: [{ id: 'ring', name: 'Ring' }, { id: 'wave', name: 'Wave' }], cubes: [{ id: 'cube-a', size: 1.2, order: 0 }, { id: 'cube-b', size: 1, order: 1 }] }
    engine = { sim: false, signOff: 'click', zone: { xMin: -1, xMax: 1, yMin: -1, yMax: 1 }, cubes: [{ id: 'cube-a', name: 'Left cube', ip: '10.0.0.2', connected: true, armed: false, stop: null }, { id: 'cube-b', name: 'Right cube', ip: '10.0.0.3', connected: true, armed: false, stop: null }] }
    table = { warm: { look: 'ring', name: 'Ring' }, blue: { look: 'wave', name: 'Wave' } }
    posts = []
    gets = []
    mode = { light: 'ok', laser: 'ok' }
}
fresh()

const reply = (v, status = 200) => ({ ok: status < 400, status, json: async () => clone(v) })
const fakeFetch = async (url, opts = {}) => {
    const isPost = opts.method === 'POST'
    const body = isPost ? JSON.parse(opts.body || '{}') : null
    if (isPost) posts.push({ url, body })
    else gets.push(url)
    const side = url.startsWith('../light/') ? 'light' : 'laser'
    if (mode[side] === 'down') throw new TypeError('fetch failed')
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
    return reply({ error: 'not in the fake' }, 404)
}

const $ = (id) => document.getElementById(id)
const refresh = () => window.DiShowDesk.refresh()
const settle = () => sleep(120) // a press's posts, its tick and a fader's 50 ms send
const press = async (node) => { node.click(); await settle() }
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
    it('Blackout all: both blackouts on in one press; the second press lifts both; a double-click sets and never lifts', async () => {
        $('blackoutAll').click()
        $('blackoutAll').click() // inside the gap: ignored
        await settle()
        expect(posts).toEqual([
            { url: '../light/api/master', body: { blackout: true } },
            { url: '../laser/desk/api/blackout', body: { on: true } }
        ])
        expect($('blackoutAll').textContent).toContain('Lift blackout')
        posts = []
        await sleep(650)
        await press($('blackoutAll'))
        expect(posts).toEqual([
            { url: '../light/api/master', body: { blackout: false } },
            { url: '../laser/desk/api/blackout', body: { on: false } }
        ])
        expect(posts.some((p) => p.url.endsWith('/arm'))).toBe(false) // lifting never turns a cube On
        expect($('status').textContent).toContain('The cubes stay Off until you press On.')
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
    const css = fs.readFileSync(path.join(UI, 'show.css'), 'utf8')
    const token = (name) => Number((css.match(new RegExp(`--${name}:\\s*(\\d+)px`)) || [])[1])
    const rule = (selector) => (css.match(new RegExp(`(^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`)) || [])[2] || ''
    it('the fixed rows and the least the halves get add up inside 758 px', () => {
        const rows = ['top-h', 'status-h', 'scenes-h', 'links-h', 'halves-min'].map(token)
        expect(rows.every((n) => n > 0)).toBe(true)
        expect(rows.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(758)
        expect(rule('body.showdesk')).toMatch(/grid-template-rows:\s*var\(--top-h\) var\(--status-h\) var\(--scenes-h\) minmax\(var\(--halves-min\), 1fr\) var\(--links-h\)/)
        expect(rule('body.showdesk')).toMatch(/height:\s*100vh/)
        expect(rule('body.showdesk')).toMatch(/overflow:\s*hidden/)
        expect(rule('html, body.showdesk')).toMatch(/overflow:\s*hidden/)
    })
    it('the five rows are the body\'s five areas, in order', () => {
        const areas = [...document.body.children].filter((n) => n.tagName !== 'SCRIPT').map((n) => n.id || n.className.split(' ').pop())
        expect(areas).toEqual(['showbar', 'status', 'showscenes', 'halves', 'links'])
    })
    it('two rows of scene buttons fit the scenes row; more scroll inside it', () => {
        expect(32 + 2 * token('scene-btn-h') + 3 * 6).toBeLessThanOrEqual(token('scenes-h'))
        expect(css).toMatch(/\.showscenes \.scenegrid \{[^}]*overflow-y: auto/)
        for (const list of ['.lamps', '.lasers']) expect(rule(list)).toMatch(/min-height:\s*0;[^]*overflow-y:\s*auto/)
    })
    it('targets are at least 40 px, and Blackout all keeps a fixed width at the far right', () => {
        expect(token('target')).toBeGreaterThanOrEqual(40)
        expect(token('scene-btn-h')).toBeGreaterThanOrEqual(40)
        expect(rule('.blackoutall')).toMatch(/flex:\s*none;\s*width:\s*\d+px/)
        const bar = $('blackoutAll').parentElement
        expect(bar.lastElementChild).toBe($('blackoutAll'))
    })
    it('brings no colour of its own: every colour it names is one the laser desk already uses', () => {
        const deskCss = fs.readFileSync(path.join(here, '../laser/ui/desk.css'), 'utf8')
        const deskJs = fs.readFileSync(path.join(here, '../laser/ui/desk.js'), 'utf8')
        const named = [...css.matchAll(/#[0-9a-f]{3,8}\b/gi), ...fs.readFileSync(path.join(UI, 'show.js'), 'utf8').matchAll(/#[0-9a-f]{6}\b|rgba\([^)]*\)/gi)].map((m) => m[0].toLowerCase())
        for (const c of named) expect(deskCss.toLowerCase().includes(c) || deskJs.toLowerCase().includes(c), c).toBe(true)
        expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/font-family|@font-face|transition|animation/)
    })
})

describe('the lamp colours are the lighting desk\'s own', () => {
    it('colour.js carries the same emitter table as the lighting desk page (app.js)', () => {
        const app = fs.readFileSync(path.join(here, '../lighting/ui/app.js'), 'utf8')
        const block = app.match(/const EMITTER_MIX = (\{[\s\S]*?\});/)[1]
        expect(require('../lighting/ui/colour.js').EMITTER_MIX).toEqual(new Function(`return (${block})`)())
    })
})
