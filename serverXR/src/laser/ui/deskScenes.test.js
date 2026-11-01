// @vitest-environment jsdom
// The Scenes row on the real page (ui/desk.js + ui/sceneRow.js on ui/index.html in jsdom, a fake light desk and a fake laser desk behind
// fetch): the buttons, the marks, what ONE press sends (the light recall and this desk's Go, nothing else), the words when the light desk
// refuses or is not running, and how often the light desk is asked. The rules alone are in sceneRow.test.js. Real timers, wide margins.
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

// The Mac's ten MUTH scenes in the light desk's own order (muth00 last), one scene no look follows, the laser's looks of the same names.
const KEYS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '00']
const NAMES = { '01': 'Threshold', '02': 'Crypt House', '03': 'Haunted Electro', '04': 'Broken Bones', '05': 'Catacomb', '06': 'Witching Hour', '07': 'Ascension', '08': 'The Long Fall', '09': 'Lusabats', '00': 'Hush' }
const SCENES = [...KEYS.map((k) => ({ id: `muth${k}`, name: `MUTH ${k} ${NAMES[k]}` })), { id: 'spare', name: 'Spare wash' }]
const lookId = (k) => `muth-${k}-${NAMES[k].toLowerCase().replace(/ /g, '-')}`
const TABLE = Object.fromEntries(KEYS.map((k) => [`muth${k}`, { look: lookId(k), name: `MUTH ${k} ${NAMES[k]}` }]))

let desk
let engine
let light = { activeScene: null, blackout: false } // the fake light desk
let lightMode = 'ok' // 'ok' | 'refuse' | 'down'
const posts = [] // every POST the page made: { url, body }
const gets = [] // every GET url
const FORBIDDEN = /api\/(arm|alive|frame|blackout|master|bpm|cube|release|setting|follow|live|store|save|undo|redo)\b/

const fakeFetch = async (url, opts = {}) => {
    const json = (v, status = 200) => ({ ok: status < 400, status, json: async () => v })
    const post = opts.method === 'POST'
    if (post) posts.push({ url, body: JSON.parse(opts.body || '{}') })
    else gets.push(url)
    if (url.startsWith('../light/')) {
        if (lightMode === 'down') throw new TypeError('fetch failed')
        if (post && url === '../light/api/scenes/recall') {
            if (lightMode === 'refuse') return json({ error: 'owner must be 1-40 letters, digits or . _ : @ -' }, 400)
            light.activeScene = JSON.parse(opts.body).id
            return json({ ok: true })
        }
        if (url === '../light/api/summary') return json({ activeScene: light.activeScene, blackout: light.blackout, scenes: SCENES.length })
        if (url === '../light/api/scenes/summary') return json({ scenes: SCENES.map((s) => ({ ...s, fadeMs: 2000, live: 3, missing: 0 })) })
        return json({}, 404)
    }
    if (post) {
        if (url === 'desk/api/go') { desk.liveId = JSON.parse(opts.body).look; return json({ ok: true, live: desk.liveId }) }
        return json({ ok: true })
    }
    if (url === 'desk/api/state') return json(JSON.parse(JSON.stringify(desk)))
    if (url === 'api/state') return json(JSON.parse(JSON.stringify(engine)))
    if (url === 'desk/api/follows') return json({ ok: true, on: false, links: {}, table: TABLE }) // the switch is OFF, as on the Mac
    if (url === 'desk/api/view') return json({ cubes: { 'cube-1': [[-0.5, -0.5, 1, 0, 0]] } })
    return json({})
}
const btn = (id) => document.querySelector(`#sceneGrid .scenebtn[data-id=${id}]`)
const note = () => document.getElementById('sceneNote')
const lightPosts = () => posts.filter((p) => p.url.startsWith('../light/'))
const settle = () => sleep(250)

beforeAll(async () => {
    desk = {
        live: null, liveId: null, blackout: false, master: 1, bpm: 120, beat: 0, shapes: ['circle'], unsaved: false, changed: [], added: [], canUndo: false, canRedo: false,
        follow: { on: false, scenes: [], last: null },
        looks: [...KEYS.map((k) => normaliseLook({ id: lookId(k), name: `MUTH ${k} ${NAMES[k]}`, spin: 0.5 })), normaliseLook({ id: 'plain', name: 'Plain' })],
        cubes: [{ id: 'cube-1', on: true, flipX: false, size: 1, x: 0, y: -0.5, order: 0, driving: false, dark: false, held: null, points: 0, lit: 0, blanked: 0, offField: 0, offPercent: 0 }]
    }
    engine = { sim: true, zone: { xMin: -1, xMax: 1, yMin: -1, yMax: 1 }, cubes: [{ id: 'cube-1', name: 'Cube 1', armed: false, ip: '10.0.0.2', connected: true }] }
    const html = fs.readFileSync(path.join(here, 'index.html'), 'utf8')
    document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/g, '')
    const context = new WeakMap()
    HTMLCanvasElement.prototype.getContext = function getContext() {
        if (!context.has(this)) context.set(this, new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true } }))
        return context.get(this)
    }
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', { configurable: true, get() { return this.parentNode } })
    window.ResizeObserver = class { observe() {} disconnect() {} }
    window.fetch = fakeFetch
    globalThis.fetch = fakeFetch
    window.DiLaserDraw = require('./drawRuns.js')
    window.DiLaserCalm = require('./drawCalm.js')
    window.DiSceneRow = require('./sceneRow.js')
    window.DiLaser = { ...laserLook }
    new Function(fs.readFileSync(path.join(here, 'desk.js'), 'utf8'))()
    await sleep(1300)
})
// The page polls forever: capture its timers at load (before beforeAll boots it), stop them first in afterAll.
const pageTimers = capturePageTimers()
afterAll(async () => { await pageTimers.stop(); window.fetch = undefined })

describe('the row', () => {
    it('sits above the tiles in the Looks pane, one button per light scene in the light desk\'s order, with the switch OFF', () => {
        const rowEl = document.getElementById('sceneRow')
        expect(rowEl.hidden).toBe(false)
        expect(rowEl.closest('.bank')).not.toBeNull()
        expect(rowEl.compareDocumentPosition(document.getElementById('tiles')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        const ids = [...document.querySelectorAll('#sceneGrid .scenebtn')].map((b) => b.dataset.id)
        expect(ids).toEqual(SCENES.map((s) => s.id)) // muth01 ... muth09, muth00, spare
        expect(btn('muth05').querySelector('.scenename').textContent).toContain('MUTH 05 Catacomb')
        expect(btn('muth05').querySelector('.scenelook').textContent).toContain('laser: MUTH 05 Catacomb')
        expect(btn('spare').querySelector('.scenelook').textContent).toContain('lights only')
    })
    it('marks nothing while nothing is on, then the scene the light desk has on and the look on the cubes', async () => {
        expect(document.querySelectorAll('.scenebtn.is-lights, .scenebtn.is-laser')).toHaveLength(0)
        light.activeScene = 'muth03'
        desk.liveId = lookId('07')
        await sleep(1700)
        expect(btn('muth03').className).toContain('is-lights')
        expect(btn('muth03').getAttribute('aria-pressed')).toBe('true')
        expect(btn('muth03').querySelector('.tag').hidden).toBe(true) // lights: border, bar, aria-pressed; LIVE is only for the look on the cubes
        expect(btn('muth07').className).toContain('is-laser')
        expect(btn('muth07').getAttribute('aria-pressed')).toBe('false')
        expect([...btn('muth07').querySelectorAll('.tag')].map((t) => [t.textContent, t.hidden])).toEqual([['LIVE', false]])
        expect(note().textContent).toBe('Lights on: MUTH 03 Haunted Electro.')
        expect(document.querySelectorAll('.scenebtn.is-lights')).toHaveLength(1)
        expect(document.querySelectorAll('.scenebtn.is-laser')).toHaveLength(1)
    })
    it('buttons are at least 36 px tall in the stylesheet', () => {
        const css = fs.readFileSync(path.join(here, 'desk.css'), 'utf8')
        expect(css).toMatch(/--scene-h: 38px/)
        expect(css).toMatch(/\.scenebtn \{[^}]*min-height: 36px/)
        const mine = css.slice(css.indexOf('/* ---- Scenes row')).replace(/\/\*[\s\S]*?\*\//g, '') // the row's own rules, comments off
        expect(mine).toContain('.scenebtn')
        expect(mine).not.toMatch(/animation|transition|border-radius: [1-9]/)
    })
})

describe('one press', () => {
    it('recalls MUTH 05 on the light desk AND makes its look live: exactly those two requests, light first', async () => {
        posts.length = 0
        btn('muth05').click()
        await settle()
        expect(posts).toEqual([
            { url: '../light/api/scenes/recall', body: { id: 'muth05' } },
            { url: 'desk/api/go', body: { look: 'muth-05-catacomb' } }
        ])
        await sleep(1100)
        expect(btn('muth05').className).toContain('is-lights')
        expect(btn('muth05').className).toContain('is-laser')
        expect(btn('muth03').className).not.toContain('is-lights')
        expect(note().textContent).toBe('MUTH 05 Catacomb: lights recalled. Laser look MUTH 05 Catacomb is live.')
        expect(note().className).not.toContain('is-error')
    })
    it('a scene no look follows is lights only: the light recall and no Go', async () => {
        posts.length = 0
        btn('spare').click()
        await settle()
        expect(posts).toEqual([{ url: '../light/api/scenes/recall', body: { id: 'spare' } }])
        expect(note().textContent).toBe('Spare wash: lights recalled. No laser look follows it.')
        expect(desk.liveId).toBe('muth-05-catacomb') // the laser stays as it was
    })
    it('a second press while the first is on its way is the same press', async () => {
        posts.length = 0
        btn('muth02').click()
        btn('muth02').click()
        btn('muth08').click()
        await settle()
        expect(lightPosts().map((p) => p.body.id)).toEqual(['muth02'])
        expect(posts.filter((p) => p.url === 'desk/api/go')).toHaveLength(1)
    })
    it('a refused light route is said on the row, the look still goes, nothing is retried', async () => {
        lightMode = 'refuse'
        posts.length = 0
        btn('muth06').click()
        await settle()
        expect(note().textContent).toBe('Lights did not change: the light desk said "owner must be 1-40 letters, digits or . _ : @ -". Laser look MUTH 06 Witching Hour is live.')
        expect(note().className).toContain('is-error')
        await sleep(2300)
        expect(lightPosts()).toHaveLength(1)
        expect(posts.filter((p) => p.url === 'desk/api/go')).toHaveLength(1)
        lightMode = 'ok'
    })
    it('a light desk that is not running is said so, on the press and as a standing note', async () => {
        lightMode = 'down'
        posts.length = 0
        btn('muth04').click()
        await settle()
        expect(note().textContent).toBe('Lights did not change: the light desk did not answer. Laser look MUTH 04 Broken Bones is live.')
        expect(lightPosts()).toHaveLength(1)
        await sleep(13500) // the words about the press are gone; the row says the light desk is not answering
        expect(note().textContent).toBe('The light desk is not answering. The marks are from its last answer.')
        expect(note().className).toContain('is-error')
        expect(document.querySelectorAll('#sceneGrid .scenebtn')).toHaveLength(SCENES.length) // the buttons stay
        lightMode = 'ok'
        await sleep(1300)
        expect(note().textContent).toBe('Lights on: MUTH 02 Crypt House.') // the last light recall that worked
        expect(document.getElementById('sceneRow').title).toContain('One press recalls the scene on the light desk')
    }, 25000)
})

describe('how often the light desk is asked', () => {
    it('about once a second while the page is visible, and not at all while it is hidden', async () => {
        gets.length = 0
        await sleep(2600)
        const asked = gets.filter((u) => u === '../light/api/summary').length
        expect(asked).toBeGreaterThanOrEqual(1)
        expect(asked).toBeLessThanOrEqual(4)
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
        await sleep(1200)
        gets.length = 0
        await sleep(2300)
        expect(gets.filter((u) => u.startsWith('../light/'))).toEqual([])
        delete document.hidden
    }, 15000)
    it('the whole run sent nothing the operator could not send with two clicks today', async () => {
        posts.length = 0
        for (const s of SCENES) { btn(s.id).click(); await sleep(350) }
        const urls = new Set(posts.map((p) => p.url))
        expect([...urls].sort()).toEqual(['../light/api/scenes/recall', 'desk/api/go'])
        expect(posts.filter((p) => FORBIDDEN.test(p.url))).toEqual([])
        expect(lightPosts().map((p) => p.body.id)).toEqual(SCENES.map((s) => s.id))
        expect(posts.filter((p) => p.url === 'desk/api/go').map((p) => p.body.look)).toEqual(KEYS.map(lookId)) // the spare scene sent no Go
    }, 15000)
})
