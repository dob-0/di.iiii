// @vitest-environment jsdom
// The laser desk's Motion choice is kept per browser (localStorage) and the page still works where the browser keeps nothing.
// The page is loaded with "full" already stored: it starts full; the choice is read, not assumed. Rules: drawCalm.test.js; behaviour: deskCalm.test.js.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it, afterAll } from 'vitest'

const require = createRequire(import.meta.url)
const here = path.dirname(fileURLToPath(import.meta.url))
const { normaliseLook } = require('../laserDesk')
const laserLook = require('../../../../shared/laserLook.cjs')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const motionBtn = (m) => [...document.querySelectorAll('.motion button')].find((b) => b.textContent === m)

const desk = {
    live: null, liveId: null, blackout: false, master: 1, bpm: 120, beat: 0, shapes: ['circle'], unsaved: false, changed: [], added: [], canUndo: false, canRedo: false,
    looks: ['a', 'b'].map((id) => normaliseLook({ id, name: id.toUpperCase() })),
    cubes: [{ id: 'cube-1', on: true, flipX: false, size: 1, x: 0, y: -0.5, order: 0, driving: true, dark: false, held: null, points: 10, lit: 10, blanked: 0, offField: 0, offPercent: 0 }]
}
const engine = { sim: true, zone: { xMin: -1, xMax: 1, yMin: -1, yMax: 1 }, cubes: [{ id: 'cube-1', name: 'Cube 1', armed: false, ip: '10.0.0.2', connected: true }] }
const fakeFetch = async (url, opts = {}) => {
    const json = (v) => ({ ok: true, status: 200, json: async () => v })
    if (opts.method === 'POST') return json({ ok: true })
    if (url === 'desk/api/state') return json(JSON.parse(JSON.stringify(desk)))
    if (url === 'api/state') return json(JSON.parse(JSON.stringify(engine)))
    if (url === 'desk/api/view') return json({ cubes: {} })
    return json({})
}

const pageTimers = new Set()
const realSetTimeout = globalThis.setTimeout
const realSetInterval = globalThis.setInterval
afterAll(() => {
    for (const id of pageTimers) { clearTimeout(id); clearInterval(id) }
    globalThis.setTimeout = realSetTimeout
    globalThis.setInterval = realSetInterval
})

beforeAll(async () => {
    window.localStorage.setItem('diLaserDeskMotion', 'full')
    const html = fs.readFileSync(path.join(here, 'index.html'), 'utf8')
    document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/g, '')
    const g = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true } })
    HTMLCanvasElement.prototype.getContext = () => g
    window.ResizeObserver = class { observe() {} disconnect() {} }
    window.fetch = fakeFetch
    globalThis.fetch = fakeFetch
    window.DiLaserDraw = require('./drawRuns.js')
    window.DiLaserCalm = require('./drawCalm.js')
    window.DiLaser = laserLook
    // The page keeps polling with timers; collect them so afterAll can stop them (else they fire after the
    // window is gone: 'document is not defined', an unhandled error that fails the whole run).
    globalThis.setTimeout = (fn, ms, ...a) => { const id = realSetTimeout(fn, ms, ...a); pageTimers.add(id); return id }
    globalThis.setInterval = (fn, ms, ...a) => { const id = realSetInterval(fn, ms, ...a); pageTimers.add(id); return id }
    new Function(fs.readFileSync(path.join(here, 'desk.js'), 'utf8'))()
    await sleep(300)
})

describe('the Motion choice is kept per browser', () => {
    it('a stored "full" is read at load', () => {
        expect(document.body.dataset.motion).toBe('full')
        expect(motionBtn('full').getAttribute('aria-pressed')).toBe('true')
        expect(motionBtn('calm').getAttribute('aria-pressed')).toBe('false')
    })
    it('a browser that keeps nothing: the choice still switches, nothing throws', () => {
        const real = Object.getOwnPropertyDescriptor(window, 'localStorage')
        Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('denied') } })
        try {
            expect(() => motionBtn('calm').click()).not.toThrow()
            expect(document.body.dataset.motion).toBe('calm')
        } finally {
            if (real) Object.defineProperty(window, 'localStorage', real)
        }
    })
})
