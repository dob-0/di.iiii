// @vitest-environment jsdom
// The laser desk's calm drawing on the real page (ui/desk.js on ui/index.html in jsdom, a fake server behind fetch): which tiles play,
// how often the stage is asked while nothing is armed, what is not drawn again, the rates, and the full mode that keeps the older motion.
// The pure rules are in drawCalm.test.js. Counts are over real time windows with wide margins (the page's own clocks run).
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { capturePageTimers } from '../../testSupport/pageTimers.mjs'

const require = createRequire(import.meta.url)
const here = path.dirname(fileURLToPath(import.meta.url))
const { normaliseLook } = require('../laserDesk')
const laserLook = require('../../../../shared/laserLook.cjs')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const IDS = ['a', 'b', 'c', 'd', 'e', 'f']
const FIELD = [[-0.5, -0.5, 1, 0, 0], [0.5, -0.5, 1, 0, 0], [0.5, 0.5, 1, 0, 0], [-0.5, 0.5, 1, 0, 0]]
let desk
let engine
let viewPoints = FIELD
let viewFetches = 0
const lookCalls = {} // look id → lookPointsAt calls (the tiles and the Preview)
const clears = new Map() // canvas → clearRect calls = pictures drawn

const mkLook = (id) => normaliseLook({ id, name: id.toUpperCase(), spin: 0.5 }) // a look that moves, so every picture differs
const fakeFetch = async (url, opts = {}) => {
    const json = (v) => ({ ok: true, status: 200, json: async () => v })
    if (opts.method === 'POST') return json({ ok: true })
    if (url === 'desk/api/state') return json(JSON.parse(JSON.stringify(desk)))
    if (url === 'api/state') return json(JSON.parse(JSON.stringify(engine)))
    if (url === 'desk/api/view') { viewFetches += 1; return json({ cubes: { 'cube-1': viewPoints } }) }
    return json({})
}
const tile = (id) => document.querySelector(`.tile[data-id=${id}]`)
const canvasOf = (id) => tile(id).querySelector('canvas')
const playing = () => [...document.querySelectorAll('.tile.is-playing')].map((t) => t.dataset.id)
const drawn = (canvas) => clears.get(canvas) || 0
const window_ = async (ms, probe) => { const before = probe(); await sleep(ms); return probe() - before }
const callsIn = async (ms) => {
    const before = { ...lookCalls }
    await sleep(ms)
    return Object.fromEntries(IDS.map((id) => [id, (lookCalls[id] || 0) - (before[id] || 0)]))
}
const motionBtn = (m) => [...document.querySelectorAll('.motion button')].find((b) => b.textContent === m)

beforeAll(async () => {
    desk = {
        live: null, liveId: null, blackout: false, master: 1, bpm: 120, beat: 0, shapes: ['circle'], unsaved: false, changed: [], added: [], canUndo: false, canRedo: false,
        looks: IDS.map(mkLook),
        cubes: [{ id: 'cube-1', on: true, flipX: false, size: 1, x: 0, y: -0.5, order: 0, driving: true, dark: false, held: null, points: 10, lit: 10, blanked: 0, offField: 0, offPercent: 0 }]
    }
    engine = { sim: false, zone: { xMin: -1, xMax: 1, yMin: -1, yMax: 1 }, cubes: [{ id: 'cube-1', name: 'Cube 1', armed: false, ip: '10.0.0.2', connected: true }] }
    const html = fs.readFileSync(path.join(here, 'index.html'), 'utf8')
    document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/g, '')
    const context = new WeakMap()
    HTMLCanvasElement.prototype.getContext = function getContext() {
        if (!context.has(this)) {
            const canvas = this
            context.set(this, new Proxy({}, {
                get: (t, k) => (k === 'clearRect' ? () => clears.set(canvas, (clears.get(canvas) || 0) + 1) : k in t ? t[k] : () => {}),
                set: (t, k, v) => { t[k] = v; return true }
            }))
        }
        return context.get(this)
    }
    // jsdom has no layout: a drawn element is one with a parent.
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', { configurable: true, get() { return this.parentNode } })
    window.ResizeObserver = class { observe() {} disconnect() {} }
    window.fetch = fakeFetch
    globalThis.fetch = fakeFetch
    window.DiLaserDraw = require('./drawRuns.js')
    window.DiLaserCalm = require('./drawCalm.js')
    window.DiLaser = { ...laserLook, lookPointsAt: (look, o) => { lookCalls[look.id] = (lookCalls[look.id] || 0) + 1; return laserLook.lookPointsAt(look, o) } }
    new Function(fs.readFileSync(path.join(here, 'desk.js'), 'utf8'))()
    await sleep(900)
})
// The page polls forever: capture its timers at load (before beforeAll boots it), stop them first in afterAll.
const pageTimers = capturePageTimers()
afterAll(async () => { await pageTimers.stop(); window.fetch = undefined })

describe('calm is the default', () => {
    it('the page starts calm and the Motion control says so', () => {
        expect(document.body.dataset.motion).toBe('calm')
        expect([...document.querySelectorAll('.motion button')].map((b) => b.textContent)).toEqual(['calm', 'full'])
        expect([...document.querySelectorAll('.motion button')].map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false'])
    })
    it('with nothing live, open or under the pointer, no tile plays and every look is drawn once, as a still', async () => {
        expect(playing()).toEqual([])
        const calls = await callsIn(700)
        expect(Object.values(calls).reduce((a, b) => a + b, 0)).toBe(0) // the first pictures were drawn while the page loaded
        for (const id of IDS) expect(lookCalls[id]).toBe(1)
        for (const id of IDS) expect(drawn(canvasOf(id))).toBe(1)
    })
})

describe('the stage while nothing is armed', () => {
    it('is asked every 500 ms, not every 80 ms, and an unchanged picture is not drawn again', async () => {
        const stage = document.querySelector('#stage canvas')
        const asked = await window_(1300, () => viewFetches)
        expect(asked).toBeGreaterThanOrEqual(2)
        expect(asked).toBeLessThanOrEqual(4)
        expect(drawn(stage)).toBe(1) // drawn once for the first answer, never again for the same points
    })
    it('a cube that is armed brings it back to 80 ms; a changed picture is drawn once', async () => {
        engine.cubes[0].armed = true
        await sleep(1700) // the engine poll (1 s) sees it, then the old 500 ms wait ends
        const stage = document.querySelector('#stage canvas')
        const asked = await window_(1000, () => viewFetches)
        expect(asked).toBeGreaterThanOrEqual(8)
        const before = drawn(stage)
        await sleep(300)
        expect(drawn(stage)).toBe(before)
        viewPoints = FIELD.map((p) => [p[0] * 0.8, p[1] * 0.8, p[2], p[3], p[4]])
        await sleep(300)
        expect(drawn(stage)).toBe(before + 1)
    })
    it('disarmed again it slows down; a look open in the Preview speeds it up', async () => {
        engine.cubes[0].armed = false
        await sleep(1700)
        expect(await window_(1300, () => viewFetches)).toBeLessThanOrEqual(4)
        tile('b').querySelector('.name').click()
        await sleep(700)
        expect(await window_(1000, () => viewFetches)).toBeGreaterThanOrEqual(8)
    })
})

describe('which tiles play', () => {
    it('the tile on the laser, the tile open in Edit and the tile under the pointer; the rest hold still', async () => {
        desk.liveId = 'a'
        desk.live = desk.looks[0]
        canvasOf('c').dispatchEvent(new Event('pointerover', { bubbles: true }))
        await sleep(900)
        expect(playing()).toEqual(['a', 'b', 'c'])
        const calls = await callsIn(600)
        for (const id of ['a', 'b', 'c']) expect(calls[id]).toBeGreaterThanOrEqual(4)
        for (const id of ['d', 'e', 'f']) expect(calls[id]).toBe(0)
    })
    it('a playing tile draws at most ~20 pictures a second', async () => {
        const n = await window_(1000, () => drawn(canvasOf('a')))
        expect(n).toBeGreaterThanOrEqual(8)
        expect(n).toBeLessThanOrEqual(22)
    })
    it('a tile keeps its backing store while its size does not change', async () => {
        const canvas = canvasOf('a')
        let sets = 0
        let width = canvas.width
        Object.defineProperty(canvas, 'width', { configurable: true, get: () => width, set: (v) => { sets += 1; width = v } })
        await sleep(500)
        expect(drawn(canvas)).toBeGreaterThan(0)
        expect(sets).toBe(0)
        delete canvas.width
    })
    it('the pointer leaving the bank stills the hovered tile', async () => {
        document.querySelector('#tiles').dispatchEvent(new Event('pointerleave'))
        await sleep(500)
        expect(playing()).toEqual(['a', 'b'])
        expect((await callsIn(600)).c).toBe(0)
    })
    it('the Preview draws at most ~30 pictures a second, and nothing while the page is hidden', async () => {
        const preview = document.querySelector('#preview')
        const n = await window_(1000, () => drawn(preview))
        expect(n).toBeGreaterThanOrEqual(10)
        expect(n).toBeLessThanOrEqual(34)
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
        await sleep(150)
        expect(await window_(500, () => drawn(preview) + drawn(canvasOf('a')))).toBe(0)
        delete document.hidden
        await sleep(300)
        expect(await window_(300, () => drawn(preview))).toBeGreaterThan(0)
    })
})

describe('a still is drawn again only when its look, the beat or its size changes', () => {
    it('a changed look redraws that tile once and no other', async () => {
        await callsIn(400)
        const before = { ...lookCalls }
        desk.looks[3].size = 0.2
        await sleep(1100)
        expect(lookCalls.d - before.d).toBe(1)
        expect(lookCalls.e - before.e).toBe(0)
        expect(lookCalls.f - before.f).toBe(0)
    })
    it('a changed beat redraws every still once', async () => {
        const before = { ...lookCalls }
        desk.bpm = 140
        await sleep(1100)
        for (const id of ['d', 'e', 'f']) expect(lookCalls[id] - before[id]).toBe(1)
    })
    it('a tile that changes size redraws once', async () => {
        const before = { ...lookCalls }
        Object.defineProperty(canvasOf('e'), 'clientWidth', { configurable: true, get: () => 120 })
        await sleep(600)
        expect(lookCalls.e - before.e).toBe(1)
        expect(lookCalls.d - before.d).toBe(0)
    })
})

describe('full keeps the older motion', () => {
    it('every tile plays, the stage is redrawn at every answer and asked every 80 ms; the choice is kept in this browser', async () => {
        motionBtn('full').click()
        expect(document.body.dataset.motion).toBe('full')
        expect(window.localStorage.getItem('diLaserDeskMotion')).toBe('full')
        expect(motionBtn('full').getAttribute('aria-pressed')).toBe('true')
        await sleep(300)
        expect(playing()).toEqual([])
        const calls = await callsIn(600)
        for (const id of IDS) expect(calls[id]).toBeGreaterThanOrEqual(4)
        const stage = document.querySelector('#stage canvas')
        const redrawn = await window_(800, () => drawn(stage))
        expect(redrawn).toBeGreaterThanOrEqual(6)
    })
    it('calm again: the stills stop, and the choice is kept', async () => {
        motionBtn('calm').click()
        expect(window.localStorage.getItem('diLaserDeskMotion')).toBe('calm')
        await sleep(900)
        expect(playing()).toEqual(['a', 'b'])
        const calls = await callsIn(600)
        for (const id of ['c', 'd', 'e', 'f']) expect(calls[id]).toBe(0)
    })
})
