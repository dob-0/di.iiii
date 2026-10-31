// @vitest-environment jsdom
// The laser desk's PAGE (ui/desk.js on ui/index.html in jsdom, a fake server behind fetch): the stage audit of 2026-10-30,
// rows 2, 3, 6, 7, 19, 22, 23, 24, 25 (the page's part), 30, 31. Each test fails on the page before the fixes.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const here = path.dirname(fileURLToPath(import.meta.url))
const { normaliseLook } = require('../laserDesk')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let posts = []
let desk
let engine
const reset = () => {
    desk = {
        live: null, liveId: null, blackout: false, master: 1, bpm: 120, beat: 0, shapes: ['circle'], unsaved: false, changed: [], added: [],
        canUndo: false, canRedo: false,
        looks: ['a', 'b', 'c'].map((id) => normaliseLook({ id, name: id.toUpperCase() })),
        cubes: [{ id: 'cube-1', on: true, flipX: false, size: 1, x: 0, y: -0.5, order: 0, driving: true, dark: false, held: null, points: 10, lit: 10, blanked: 0, offField: 0, offPercent: 0 }]
    }
    engine = { sim: true, zone: { xMin: -1, xMax: 1, yMin: -1, yMax: 1 }, cubes: [{ id: 'cube-1', name: 'Cube 1', armed: false, ip: '10.0.0.2', connected: true }] }
    posts = []
}
const fakeFetch = async (url, opts = {}) => {
    const json = (v) => ({ ok: true, status: 200, json: async () => v })
    if (opts.method === 'POST') {
        const body = JSON.parse(opts.body || '{}')
        posts.push({ url, body })
        if (url === 'desk/api/blackout') desk.blackout = body.on
        if (url === 'desk/api/release') { desk.live = null; desk.liveId = null; desk.blackout = false }
        return json({ ok: true })
    }
    if (url === 'desk/api/state') return json(JSON.parse(JSON.stringify(desk)))
    if (url === 'api/state') return json(JSON.parse(JSON.stringify(engine)))
    if (url === 'desk/api/view') return json({ cubes: {} })
    return json({})
}
const sent = (url) => posts.filter((p) => p.url === url)
const key = (k, init = {}, target = document.body) => target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }))
const page = (name) => document.querySelector(`.page-tab[data-page=${name}]`).click()
const settle = () => sleep(30)
const ranges = () => [...document.querySelectorAll('#cubeRows input[type=range]')]

beforeAll(async () => {
    const html = fs.readFileSync(path.join(here, 'index.html'), 'utf8')
    document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/g, '')
    const g = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true } })
    HTMLCanvasElement.prototype.getContext = () => g
    window.ResizeObserver = class { observe() {} disconnect() {} }
    window.fetch = fakeFetch
    globalThis.fetch = fakeFetch
    window.DiLaserDraw = require('./drawRuns.js')
    reset()
    new Function(fs.readFileSync(path.join(here, 'desk.js'), 'utf8'))()
    await sleep(80)
})
afterAll(() => { window.fetch = undefined })
beforeEach(async () => {
    reset()
    page('control')
    document.activeElement?.blur?.()
    await sleep(450) // clears the B guard and lets the poll fetch the fresh state
})

describe('Blackout always works (rows 6, 30, 31)', () => {
    it('row 6: B goes dark with focus on a slider; a text field keeps its own B', async () => {
        const slider = document.querySelector('#f-size')
        slider.focus()
        key('b', {}, slider)
        expect(sent('desk/api/blackout')).toEqual([{ url: 'desk/api/blackout', body: { on: true } }])
        await sleep(450)
        const name = document.querySelector('#lookName')
        name.focus()
        key('b', {}, name)
        expect(sent('desk/api/blackout')).toHaveLength(1)
    })
    it('row 6: B works on the Setup page too', () => {
        page('setup')
        key('b')
        expect(sent('desk/api/blackout')).toHaveLength(1)
    })
    it('row 30: the top-bar button only turns blackout on; a second click never lifts it', async () => {
        const b = document.querySelector('#blackoutBtn')
        b.click()
        await settle()
        expect(desk.blackout).toBe(true)
        b.click()
        await settle()
        expect(sent('desk/api/blackout').map((p) => p.body.on)).toEqual([true, true])
    })
    it('Shift+B lifts it', async () => {
        key('B', { shiftKey: true })
        expect(sent('desk/api/blackout').map((p) => p.body.on)).toEqual([false])
    })
    it('row 31 (review D4): a held B is ignored; B (dark) is never gapped; the 400 ms gap guards Shift+B only', async () => {
        key('b')
        key('b')
        key('b', { repeat: true })
        expect(sent('desk/api/blackout')).toHaveLength(2)
        key('b', { shiftKey: true })
        key('b', { shiftKey: true })
        expect(sent('desk/api/blackout')).toHaveLength(3)
        await sleep(450)
        key('b', { shiftKey: true })
        expect(sent('desk/api/blackout')).toHaveLength(4)
    })
})

describe('keys never act on a hidden page, and a held key does not repeat (rows 3, 31)', () => {
    const openA = async () => {
        document.querySelector('#tiles .tile .name').click()
        await settle()
    }
    it('row 3: digit, Enter, Delete and Backspace do nothing from the Setup page', async () => {
        await openA()
        page('setup')
        for (const k of ['1', 'Enter', 'Delete', 'Backspace']) key(k)
        await settle()
        expect(posts.filter((p) => /go|delete/.test(p.url))).toEqual([])
        page('control')
        key('1')
        await settle()
        expect(sent('desk/api/go')).toHaveLength(1)
    })
    it('row 31: a held Backspace deletes one look, a held digit sends once', async () => {
        await openA()
        key('Backspace')
        key('Backspace', { repeat: true })
        key('Backspace', { repeat: true })
        await settle()
        expect(sent('desk/api/looks/delete')).toHaveLength(1)
        key('2', { repeat: true })
        await settle()
        expect(sent('desk/api/go')).toHaveLength(0)
    })
    it('row 3: no key reaches the page while a field has focus', async () => {
        await openA()
        const slider = document.querySelector('#f-size')
        slider.focus()
        key('Delete', {}, slider)
        key('1', {}, slider)
        await settle()
        expect(posts.filter((p) => /go|delete/.test(p.url))).toEqual([])
    })
})

describe('placement cannot jump (rows 2, 7, 22, 25)', () => {
    it('row 2: a Setup slider shows its number', async () => {
        page('setup')
        await sleep(700)
        const outs = [...document.querySelectorAll('#cubeRows output.num')].map((o) => o.textContent)
        expect(outs).toEqual(['1.00', '0.00', '-0.50'])
    })
    it('row 2: the number follows the hand, and ONE change is sent on release', async () => {
        page('setup')
        await sleep(700)
        const up = ranges()[2]
        up.value = '-0.9'
        up.dispatchEvent(new Event('input', { bubbles: true }))
        expect(up.nextElementSibling.textContent).toBe('-0.90')
        expect(sent('desk/api/cube')).toHaveLength(0)
        up.dispatchEvent(new Event('pointerup', { bubbles: true }))
        up.dispatchEvent(new Event('change', { bubbles: true }))
        expect(sent('desk/api/cube')).toEqual([{ url: 'desk/api/cube', body: { id: 'cube-1', y: -0.9 } }])
    })
    it('rows 2, 7: a wheel or trackpad scroll over a Setup slider changes nothing', async () => {
        page('setup')
        await sleep(700)
        const up = ranges()[2]
        up.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true }))
        up.value = '-0.45'
        up.dispatchEvent(new Event('input', { bubbles: true }))
        up.dispatchEvent(new Event('change', { bubbles: true }))
        expect(sent('desk/api/cube')).toHaveLength(0)
        expect(up.value).toBe('-0.5')
    })
    it('row 7: a wheel over an Edit slider scrolls the pane (no change, not prevented); Alt+wheel still nudges', async () => {
        document.querySelector('#tiles .tile .name').click()
        await settle()
        const size = document.querySelector('#f-size')
        const before = size.value
        const plain = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true })
        size.dispatchEvent(plain)
        expect(plain.defaultPrevented).toBe(false)
        expect(size.value).toBe(before)
        const alt = new WheelEvent('wheel', { deltaY: -100, altKey: true, bubbles: true, cancelable: true })
        size.dispatchEvent(alt)
        expect(alt.defaultPrevented).toBe(true)
        expect(Number(size.value)).toBeGreaterThan(Number(before))
    })
    it('row 22: the Setup table is not rebuilt while a slider has focus', async () => {
        page('setup')
        await sleep(700)
        const up = ranges()[2]
        up.focus()
        await sleep(1700) // longer than the 1.5 s hold: only the focus keeps the table
        expect(document.contains(up)).toBe(true)
        up.blur()
        await sleep(900)
        expect(document.contains(up)).toBe(false) // let go: the next poll rebuilds it
    })
    it('row 22: nor while a pointer is down', async () => {
        page('setup')
        await sleep(700)
        const up = ranges()[2]
        document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
        await sleep(1700)
        expect(document.contains(up)).toBe(true)
        document.body.dispatchEvent(new Event('pointerup', { bubbles: true }))
    })
})

describe('a cut picture is shown (rows 19, 23, 24)', () => {
    it('the Stage card says N % of this look is off the field; a clean card says nothing', async () => {
        const cut = () => document.querySelector('#stage .cut')
        await sleep(600)
        expect(cut().hidden).toBe(true)
        desk.cubes[0].offPercent = 40
        desk.cubes[0].offField = 12
        await sleep(600)
        expect(cut().hidden).toBe(false)
        expect(cut().textContent).toBe('40 % of this look is off the field')
    })
    it('a dark cube is shown dark in Setup, not as a point count', async () => {
        Object.assign(desk.cubes[0], { driving: false, dark: true, lit: 0, offPercent: 100 })
        page('setup')
        await sleep(700)
        expect(document.querySelector('#cubeRows tr').textContent).toMatch(/dark · 100 % off the field/)
    })
})

describe('the dark rule is said where the operator looks (N1585)', () => {
    const note = () => document.querySelector('#cubeNote')
    const card = () => document.querySelector('#stage .state')
    it('On with nothing live: the header and the Stage card count down; after the engine switched it off, they say why until On', async () => {
        Object.assign(engine, { sim: false, guard: { darkIdleMs: 5000 } })
        Object.assign(engine.cubes[0], { armed: true, darkOffInMs: 3200, offBy: null })
        Object.assign(desk.cubes[0], { driving: false, dark: false, lit: 0, points: 0 })
        await sleep(1100)
        expect(note().hidden).toBe(false)
        expect(note().textContent).toBe('On with nothing to draw: it switches itself off in 4 s. Pick a look.')
        expect(card().textContent).toBe('on · nothing to draw · off in 4 s')
        Object.assign(engine.cubes[0], { armed: false, darkOffInMs: null, offBy: { reason: 'dark-idle', text: 'Off: it had nothing to draw for 5 s', at: 1 } })
        await sleep(1100)
        expect(note().textContent).toBe('Off: it had nothing to draw for 5 s. Pick a look, then On.')
        expect(card().textContent).toBe('off · had nothing to draw')
        page('setup')
        await sleep(700)
        expect(document.querySelector('#cubeRows tr').textContent).toMatch(/Off: it had nothing to draw for 5 s\. Pick a look, then On\./)
        page('control')
        Object.assign(engine.cubes[0], { armed: true, darkOffInMs: null, offBy: null })
        await sleep(1100)
        expect(note().hidden).toBe(true)
    })
    it('a look live: the Off by the rule asks only for On', async () => {
        Object.assign(engine, { sim: false, guard: { darkIdleMs: 5000 } })
        Object.assign(engine.cubes[0], { armed: false, darkOffInMs: null, offBy: { reason: 'dark-idle', text: 'Off: it had nothing to draw for 5 s', at: 1 } })
        Object.assign(desk, { live: desk.looks[0], liveId: desk.looks[0].id })
        await sleep(1100)
        expect(note().textContent).toBe('Off: it had nothing to draw for 5 s. Press On to use it again.')
    })
})

describe("darkOff 'never' (the default, N1591): On stays On; its card says so plainly, nothing counts down", () => {
    const note = () => document.querySelector('#cubeNote')
    const card = () => document.querySelector('#stage .state')
    it('On with nothing to draw: the card says "On, nothing to draw. Pick a look."; the countdown shows only in auto', async () => {
        Object.assign(engine, { sim: false, darkOff: 'never', guard: { darkIdleMs: 5000 } })
        Object.assign(engine.cubes[0], { armed: true, darkOffInMs: 3200, nothingToDraw: true, offBy: null })
        Object.assign(desk.cubes[0], { driving: false, dark: false, lit: 0, points: 0 })
        await sleep(1100)
        expect(card().textContent).toBe('On, nothing to draw. Pick a look.')
        expect(note().hidden).toBe(true)
        // the same cube numbers in 'auto': the countdown, as before
        Object.assign(engine, { darkOff: 'auto' })
        await sleep(1100)
        expect(card().textContent).toBe('on · nothing to draw · off in 4 s')
        expect(note().textContent).toBe('On with nothing to draw: it switches itself off in 4 s. Pick a look.')
    })
    it("an Off by the dark rule is said only in 'auto'; an Out that let go is said in both", async () => {
        Object.assign(engine, { sim: false, darkOff: 'never', guard: { darkIdleMs: 5000 } })
        Object.assign(engine.cubes[0], { armed: false, darkOffInMs: null, nothingToDraw: false, offBy: { reason: 'dark-idle', text: 'Off: it had nothing to draw for 5 s', at: 1 } })
        Object.assign(desk.cubes[0], { driving: false, dark: false, lit: 0, points: 0 })
        await sleep(1100)
        expect(note().hidden).toBe(true)
        expect(card().textContent).not.toMatch(/had nothing to draw/)
        Object.assign(engine.cubes[0], { offBy: { reason: 'out-let-go', text: 'Off: its Out let go', at: 1 } })
        await sleep(1100)
        expect(note().textContent).toBe('Off: its Out let go. Press On to use it again.')
        expect(card().textContent).toBe('off · its Out stopped')
    })
    it('a cube the desk holds with nothing live says nothing to draw, though the desk keeps a blank frame fresh', async () => {
        Object.assign(engine, { sim: false, darkOff: 'never', guard: { darkIdleMs: 5000 } })
        Object.assign(engine.cubes[0], { armed: true, darkOffInMs: null, nothingToDraw: false, claimedBy: 'desk', offBy: null })
        Object.assign(desk.cubes[0], { driving: false, dark: false, lit: 0, points: 0 })
        await sleep(1100)
        expect(card().textContent).toBe('On, nothing to draw. Pick a look.')
    })
})

describe('the follow status is short and its full sentence is the title; Setup > Safety names the modes in words (Projector Room 2026-10-31)', () => {
    const status = () => document.querySelector('#followStatus')
    const refresh = async () => { document.querySelector('#tapBtn').click(); await settle() }
    it('one name when the scene and its look share it, both when they differ, the reason when none follows; the title is the whole sentence', async () => {
        desk.follow = { on: true, scenes: [], last: { scene: { id: 'muth05', name: 'MUTH 05 Catacomb' }, look: 'l1', name: 'MUTH 05 Catacomb' } }
        await refresh()
        expect(status().textContent).toBe('Followed MUTH 05 Catacomb')
        expect(status().title).toBe('Last light scene followed: MUTH 05 Catacomb. The laser look it put live: MUTH 05 Catacomb.')
        desk.follow.last = { scene: { id: 's2', name: 'Intro' }, look: 'l2', name: 'Glint' }
        await refresh()
        expect(status().textContent).toBe('Followed Intro → Glint')
        desk.follow.last = { scene: { id: 's3', name: 'Outro' }, look: null, why: 'no look' }
        await refresh()
        expect(status().textContent).toBe('Outro: not followed (no look follows it)')
        desk.follow.last = null
        await refresh()
        expect(status().textContent).toBe('')
        expect(status().title).toBe('')
    })
    it('Setup > Safety says the sign-off and dark-rule modes in plain words, never as setting names', async () => {
        Object.assign(engine, { sim: false, signOff: 'phrase', darkOff: 'auto' })
        await sleep(1100)
        expect(document.querySelector('#safetySignOff').textContent).toBe("on (the laser safety officer's phrase is asked)")
        expect(document.querySelector('#safetyDark').textContent).toBe('on (it switches itself off after 5 s)')
        Object.assign(engine, { signOff: 'click', darkOff: 'never' })
        await sleep(1100)
        expect(document.querySelector('#safetySignOff').textContent).toBe('off (On is one click)')
        expect(document.querySelector('#safetyDark').textContent).toBe('off (On stays on until Off)')
        expect(document.querySelector('#page-setup .notes').textContent).not.toMatch(/DI_LASER/)
    })
})
