// @vitest-environment jsdom
// The laser desk's PAGE applies a look set only after a person taps (2026-10-31): a link ?set=<name> shows the set's file
// (ui/sets/<name>.json) at the top of Looks, look by look, now → new, and nothing is sent until Apply. The tap edits each
// look through the Edit pane's own edit, makes a look the bank lacks with the page's own paste, and writes the bank in place
// with ONE Store, never Save (Save keeps a changed saved look and adds the change as a NEW look, so a set would double the
// bank and its scene links would stay on the old looks). The page (ui/desk.js on ui/index.html in jsdom) runs against a
// fake desk behind fetch that edits, pastes, stores and undoes as laserDesk.js does; every test boots the page again.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { capturePageTimers } from '../../testSupport/pageTimers.mjs'

const require = createRequire(import.meta.url)
const here = path.dirname(fileURLToPath(import.meta.url))
const { normaliseLook } = require('../laserDesk')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const deskJs = fs.readFileSync(path.join(here, 'desk.js'), 'utf8')
const indexHtml = fs.readFileSync(path.join(here, 'index.html'), 'utf8')
const setsDir = path.join(here, 'sets')

let calls = [] // every request the page makes: { method, url, body }
let desk
let engine
let steps = [] // the fake desk's undo steps: the bank before each edit or paste
let failEdit = null // an id whose edit the fake desk refuses

const look = (id, shape, colour, extra = {}) => normaliseLook({ id, name: id.toUpperCase(), shape, colour, ...extra })
const fieldsOf = (l) => Object.fromEntries(Object.entries(l).filter(([k]) => k !== 'id' && k !== 'follows'))
const DEMO = {
    set: 'Demo',
    about: '# Set demo: three looks\n1. One line.\n\n2. Two line.\n3. Not shown.',
    looks: [look('a', 'lines', '#e0001a', { size: 0.77 }), look('live', 'wave', '#7a20ff'), look('ghost-look', 'spots', '#7a20ff')]
}
const FILES = { // the set files the fake server has
    'sets/demo.json': DEMO,
    'sets/bad.json': { about: 'x', looks: [{ ...DEMO.looks[0], id: 'a b' }] },
    'sets/twice.json': { about: 'x', looks: [DEMO.looks[0], DEMO.looks[0]] },
    'sets/markup.json': { about: '<img src=x onerror=alert(1)>', looks: [{ ...look('new-one', 'lines', '#e0001a'), name: '<img src=y onerror=alert(2)>' }] }
}
const reset = (liveId) => {
    desk = {
        live: null, liveId, blackout: false, master: 1, bpm: 120, beat: 0, shapes: ['circle'], unsaved: false, changed: [], added: [],
        canUndo: false, canRedo: false,
        looks: [look('a', 'grid', '#ffffff', { follows: 'scene-3' }), look('b', 'grid', '#ffffff'), look('live', 'line', '#ff0000', { follows: 'scene-7' })],
        cubes: [{ id: 'cube-1', on: true, flipX: false, size: 1, x: 0, y: -0.5, order: 0, driving: true, dark: false, held: null, points: 10, lit: 10, blanked: 0, offField: 0, offPercent: 0 }]
    }
    engine = { sim: true, zone: { xMin: -1, xMax: 1, yMin: -1, yMax: 1 }, cubes: [{ id: 'cube-1', name: 'Cube 1', armed: false, ip: '10.0.0.2', connected: true }] }
    calls = []
    steps = []
    failEdit = null
}
const fakeFetch = async (url, opts = {}) => {
    const json = (v, status = 200) => ({ ok: status < 400, status, json: async () => v })
    const method = opts.method || 'GET'
    const body = opts.body ? JSON.parse(opts.body) : {}
    calls.push({ method, url, body })
    const remember = () => { steps.push(JSON.parse(JSON.stringify(desk.looks))); desk.canUndo = true }
    if (method === 'POST') {
        if (url === 'desk/api/looks/edit') { // laserDesk.js editLook: every field but the link, over the look as it is
            if (body.id === failEdit) return json({ ok: false, error: 'the desk refused' }, 500)
            const i = desk.looks.findIndex((l) => l.id === body.id)
            if (i < 0) return json({ ok: false, error: `no look "${body.id}"` }, 404)
            remember()
            const { follows: _link, ...fields } = body
            desk.looks[i] = normaliseLook({ ...fields, id: desk.looks[i].id }, desk.looks[i])
            desk.unsaved = true
            return json({ ok: true, look: desk.looks[i] })
        }
        if (url === 'desk/api/looks/paste') { // laserDesk.js pasteLook: an id from the name, no link, after `after`
            remember()
            const taken = new Set(desk.looks.map((l) => l.id))
            const stem = String(body.look.name).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '')
            let id = stem
            for (let n = 2; taken.has(id); n += 1) id = `${stem}-${n}`
            const i = desk.looks.findIndex((l) => l.id === body.after)
            desk.looks.splice(i < 0 ? desk.looks.length : i + 1, 0, normaliseLook({ ...body.look, id, follows: null }))
            desk.unsaved = true
            return json({ ok: true, id })
        }
        if (url === 'desk/api/store') { // laserDesk.js store: the look into its own tile, keeps name and link; writes the bank as it is
            const i = desk.looks.findIndex((l) => l.id === body.id)
            if (i < 0) return json({ ok: false, error: `no look "${body.id}"` }, 404)
            const was = desk.looks[i]
            desk.looks[i] = normaliseLook({ ...body.look, id: was.id, name: body.name ?? was.name, follows: was.follows })
            desk.unsaved = false
            return json({ ok: true, id: was.id })
        }
        if (url === 'desk/api/undo') {
            if (!steps.length) return json({ ok: true, undone: false })
            desk.looks = steps.pop()
            desk.unsaved = true
            desk.canUndo = steps.length > 0
            return json({ ok: true, undone: true })
        }
        if (url === 'desk/api/save') { desk.unsaved = false; return json({ ok: true, created: [] }) }
        return json({ ok: true })
    }
    if (url.startsWith('sets/')) return url in FILES ? json(JSON.parse(JSON.stringify(FILES[url]))) : json({ error: 'not found' }, 404)
    if (url === 'desk/api/state') return json(JSON.parse(JSON.stringify(desk)))
    if (url === 'api/state') return json(JSON.parse(JSON.stringify(engine)))
    if (url === 'desk/api/view') return json({ cubes: {} })
    return json({})
}

beforeAll(() => {
    const g = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true } })
    HTMLCanvasElement.prototype.getContext = () => g
    window.ResizeObserver = class { observe() {} disconnect() {} }
    window.fetch = fakeFetch
    globalThis.fetch = fakeFetch
    window.DiLaserDraw = require('./drawRuns.js')
})
// The page polls forever: capture its timers at load (before beforeAll boots it), stop them first in afterAll.
const pageTimers = capturePageTimers()
afterAll(async () => { await pageTimers.stop(); window.fetch = undefined })

// A fresh page on `query`, over the bank a, b, live with `live` on the laser (and open in Edit, as a page opened mid-show does).
const boot = async (query, { unsaved = false } = {}) => {
    window.history.replaceState({}, '', `/laser/${query}`)
    reset('live')
    desk.unsaved = unsaved
    document.body.innerHTML = indexHtml.match(/<body[^>]*>([\s\S]*)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/g, '')
    new Function(deskJs)()
    await sleep(150)
    // On a busy machine the page may need longer: a set link is ready once its question is painted.
    for (let i = 0; i < 150 && query.includes('set=') && !document.getElementById('setAsk').dataset.phase; i += 1) await sleep(20)
}

const $ = (id) => document.getElementById(id)
const shown = (id) => !$(id).hidden
const title = () => $('setTitle').textContent
const note = () => $('setNote').textContent
const about = () => [...document.querySelectorAll('#setAbout p')].map((p) => p.textContent)
const rows = () => [...document.querySelectorAll('#setList li')].map((li) => {
    const tag = li.querySelector('.tag')
    return `${li.querySelector('b').textContent} ${li.querySelector('.setid').textContent}${tag ? ` | ${tag.textContent}` : ''} | ${li.querySelector('.setchange').textContent}`
})
const posts = () => calls.filter((c) => c.method === 'POST')
const sent = () => posts().map((c) => `${c.url.replace('desk/api/', '')}${c.body.id ? ` ${c.body.id}` : c.body.look ? ` ${c.body.look.name}` : ''}`)
const tap = async (id) => {
    $(id).click()
    for (let i = 0; i < 250 && $('setAsk').dataset.phase === 'busy'; i += 1) await sleep(20)
}
const ids = () => desk.looks.map((l) => l.id)
// Every test boots a new page in the same document, and a page left asking keeps polling and would paint its question
// over the next test's page (it asks again when unsaved changes come or go): close it.
afterEach(() => { if ($('setAsk')?.dataset.phase === 'ask') $('setKeep').click() })

describe('?set= asks first', () => {
    it('the question: title, the about lines, one row per look now → new, the live look and the new look named; nothing is sent before the tap', async () => {
        await boot('?set=demo')
        expect(shown('setAsk')).toBe(true)
        expect(title()).toBe('Apply the look set demo?')
        expect(about()).toEqual(['Set demo: three looks', '1. One line.', '2. Two line.', '3. Not shown.'])
        expect(rows()).toEqual([
            'A a | grid #ffffff → lines #e0001a · also size',
            'LIVE live | on the laser: changes at once | line #ff0000 → wave #7a20ff',
            'GHOST-LOOK ghost-look | new: will be created | spots #7a20ff'
        ])
        expect(note()).toContain('The live look changes at once: LIVE is on the laser.')
        expect(note()).toContain('1 look is not in the bank yet: Apply makes it.')
        expect($('setGo').textContent).toBe('Apply 3')
        expect($('setKeep').textContent).toBe('Keep as is')
        expect(shown('setUndo')).toBe(false)
        expect(document.querySelectorAll('#setList canvas.setpic')).toHaveLength(3)
        await sleep(300) // the polls run on; still nothing is sent
        expect(posts()).toEqual([])
        expect(window.location.search).toBe('?set=demo')
    })

    it('a page opened without ?set shows no set question and fetches no set', async () => {
        await boot('')
        await sleep(200)
        expect(shown('setAsk')).toBe(false)
        expect(calls.some((c) => c.url.startsWith('sets/'))).toBe(false)
        expect(posts()).toEqual([])
    })

    it('the about lines and a look name are shown as text, never as markup', async () => {
        await boot('?set=markup')
        expect(about()).toEqual(['<img src=x onerror=alert(1)>'])
        expect(rows()[0]).toContain('<img src=y onerror=alert(2)>')
        expect(document.querySelector('#setAsk img')).toBeNull()
    })

    it('while the bank has other changes not saved, Apply is not offered (Store would write them in place); it comes once they are saved', async () => {
        await boot('?set=demo', { unsaved: true })
        expect(shown('setAsk')).toBe(true)
        expect(shown('setGo')).toBe(false)
        expect(note()).toContain('other changes that are not saved yet')
        desk.unsaved = false // saved elsewhere
        await sleep(700)
        expect(shown('setGo')).toBe(true)
        expect(posts()).toEqual([])
    })
})

describe('the tap edits in place, makes what is missing, and Stores once', () => {
    it('Apply 3: looks/edit a with every field, looks/paste the new look after the one before it, the look open in Edit last, then ONE Store', async () => {
        await boot('?set=demo')
        await tap('setGo')
        expect(sent()).toEqual(['looks/edit a', 'looks/paste GHOST-LOOK', 'looks/edit live', 'store live'])
        const body = (n) => posts()[n].body
        expect(body(0)).toEqual({ id: 'a', ...fieldsOf(DEMO.looks[0]) })
        expect(body(1)).toEqual({ look: fieldsOf(DEMO.looks[2]), after: 'live' })
        expect(body(2)).toEqual({ id: 'live', ...fieldsOf(DEMO.looks[1]) })
        expect(body(3)).toEqual({ id: 'live', look: fieldsOf(DEMO.looks[1]) })
        expect(ids()).toEqual(['a', 'b', 'live', 'ghost-look'])
        expect(fieldsOf(desk.looks[0])).toEqual(fieldsOf(DEMO.looks[0]))
        expect(fieldsOf(desk.looks[2])).toEqual(fieldsOf(DEMO.looks[1]))
        expect(desk.unsaved).toBe(false)
        expect(title()).toBe('Applied 3')
        expect(note()).toBe('Saved in place · the live look changed at once · 1 made new')
        expect(shown('setUndo')).toBe(true)
        expect($('setKeep').textContent).toBe('Close')
        expect(window.location.search).toBe('')
    })

    it('Apply never posts desk/api/save (Save would add every changed look as a new one and move the live look to it)', async () => {
        await boot('?set=demo')
        await tap('setGo')
        await tap('setUndo')
        expect(posts().length).toBeGreaterThan(4)
        expect(posts().filter((c) => c.url === 'desk/api/save')).toEqual([])
    })

    it('the scene links stay: no request carries follows, and every look keeps its link after Apply', async () => {
        await boot('?set=demo')
        await tap('setGo')
        expect(posts().filter((c) => 'follows' in c.body || (c.body.look && 'follows' in c.body.look))).toEqual([])
        expect(desk.looks.map((l) => [l.id, l.follows])).toEqual([['a', 'scene-3'], ['b', null], ['live', 'scene-7'], ['ghost-look', null]])
    })

    it('a second tap on a busy or finished panel sends nothing more', async () => {
        await boot('?set=demo')
        $('setGo').click()
        $('setGo').click() // while the first apply is on its way
        for (let i = 0; i < 250 && $('setAsk').dataset.phase === 'busy'; i += 1) await sleep(20)
        $('setGo').click() // after it
        await sleep(100)
        expect(sent()).toEqual(['looks/edit a', 'looks/paste GHOST-LOOK', 'looks/edit live', 'store live'])
    })

    it('if the bank moved while the question was open, nothing is sent and the question is asked again', async () => {
        await boot('?set=demo')
        desk.looks[0] = look('a', 'bars', '#ffffff', { follows: 'scene-3' }) // a was changed elsewhere
        await tap('setGo')
        expect(posts()).toEqual([])
        expect(title()).toBe('Apply the look set demo?')
        expect(note()).toContain('The bank changed while this was open')
        expect(rows()[0]).toBe('A a | bars #ffffff → lines #e0001a · also size')
    })

    it('a refused edit stops: no Store, the count says how far it got, and Undo still puts those back', async () => {
        await boot('?set=demo')
        failEdit = 'live'
        await tap('setGo')
        expect(sent()).toEqual(['looks/edit a', 'looks/paste GHOST-LOOK', 'looks/edit live'])
        expect(title()).toBe('Applied 2 of 3')
        expect(note()).toBe('Stopped: the desk refused · not saved · 1 made new')
        expect(shown('setUndo')).toBe(true)
        calls = []
        failEdit = null
        await tap('setUndo')
        expect(sent()).toEqual(['undo', 'undo', 'store a'])
        expect(ids()).toEqual(['a', 'b', 'live'])
        expect(desk.looks[0].shape).toBe('grid')
    })
})

describe('Undo and Keep as is', () => {
    it('Undo posts the desk undo once per edit and paste, then Stores in place again; the bank is as it was', async () => {
        await boot('?set=demo')
        const before = JSON.parse(JSON.stringify(desk.looks))
        await tap('setGo')
        calls = []
        await tap('setUndo')
        expect(sent()).toEqual(['undo', 'undo', 'undo', 'store a'])
        expect(desk.looks).toEqual(before)
        expect(desk.unsaved).toBe(false)
        expect(title()).toBe('Put back 3')
        expect(note()).toBe('Saved in place')
    })

    it('Undo here is refused, with nothing posted, when the bank changed after the apply', async () => {
        await boot('?set=demo')
        await tap('setGo')
        calls = []
        desk.unsaved = true // an edit made elsewhere after the apply
        await tap('setUndo')
        expect(posts()).toEqual([])
        expect(note()).toContain('The bank changed after this')
        expect(shown('setUndo')).toBe(false)
    })

    it('Keep as is sends nothing, closes the question, drops only ?set from the link and leaves the bank alone', async () => {
        await boot('?x=1&set=demo&y=2')
        expect(shown('setAsk')).toBe(true)
        await tap('setKeep')
        await sleep(300)
        expect(posts()).toEqual([])
        expect(shown('setAsk')).toBe(false)
        expect(window.location.search).toBe('?x=1&y=2')
        expect(ids()).toEqual(['a', 'b', 'live'])
    })
})

describe('a link or a set that cannot be read is refused in plain words and sends nothing', () => {
    const refused = async (query, words, { fetched = false } = {}) => {
        await boot(query)
        await sleep(100)
        expect(shown('setAsk')).toBe(true)
        expect(title()).toBe('No look set was applied.')
        expect(note()).toMatch(words)
        expect(shown('setGo')).toBe(false)
        expect($('setKeep').textContent).toBe('Close')
        expect(calls.some((c) => c.url.startsWith('sets/'))).toBe(fetched)
        expect(posts()).toEqual([])
        await tap('setKeep')
        expect(shown('setAsk')).toBe(false)
        expect(window.location.search).toBe('')
        expect(posts()).toEqual([])
    }
    it('a name with a capital or _', () => refused('?set=Under_A', /"Under_A" cannot be a set name\. A set name is a-z, 0-9 and - only/))
    it('a name with a path in it', () => refused('?set=a%2F..%2Fb', /"a\/\.\.\/b" cannot be a set name/))
    it('an empty name', () => refused('?set=', /The link names no set\./))
    it('two sets in one link', () => refused('?set=a&set=b', /more than one set/))
    it('a set the page does not ship: a plain "no set named" line', () => refused('?set=nope', /^No set named "nope"\.$/, { fetched: true }))
    it('a set with an id no look can have', () => refused('?set=bad', /has a look without a good id/, { fetched: true }))
    it('a set that names one look twice', () => refused('?set=twice', /names the look "a" twice/, { fetched: true }))
})

describe('the sets shipped with the page', () => {
    it('every set file can be read by the page: an about, at most 200 looks with good ids, each once, each a look the desk keeps as it is', () => {
        const names = fs.readdirSync(setsDir).filter((f) => f.endsWith('.json'))
        expect(names.length).toBeGreaterThan(0)
        for (const f of names) {
            expect(f).toMatch(/^[a-z0-9-]{1,60}\.json$/)
            const set = JSON.parse(fs.readFileSync(path.join(setsDir, f), 'utf8'))
            expect(typeof set.about, f).toBe('string')
            expect(set.about.trim(), f).not.toBe('')
            expect(set.looks.length, f).toBeGreaterThan(0)
            expect(set.looks.length, f).toBeLessThanOrEqual(200)
            const lookIds = set.looks.map((l) => l.id)
            expect(new Set(lookIds).size, f).toBe(lookIds.length)
            for (const l of set.looks) {
                expect(l.id, f).toMatch(/^[A-Za-z0-9_-]{1,40}$/)
                expect(normaliseLook(l), `${f} ${l.id}`).toEqual(l)
            }
        }
    })
})
