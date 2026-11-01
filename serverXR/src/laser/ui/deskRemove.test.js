// @vitest-environment jsdom
// The laser desk's PAGE asks before it removes (ledger N1586, 2026-10-31): a link ?remove=<id>,<id>,... shows a question at the top of
// Looks, and nothing is sent until a person taps Remove. Scripts and agents cannot delete looks (the laser routes answer only this
// page), so this is how they ask. The page (ui/desk.js on ui/index.html in jsdom) runs against a fake desk behind fetch; every
// test boots the page again with its own link, so each starts from a clean page and a clean bank.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { capturePageTimers } from '../../testSupport/pageTimers.mjs'

const require = createRequire(import.meta.url)
const here = path.dirname(fileURLToPath(import.meta.url))
const { normaliseLook } = require('../laserDesk')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const deskJs = fs.readFileSync(path.join(here, 'desk.js'), 'utf8')
const indexHtml = fs.readFileSync(path.join(here, 'index.html'), 'utf8')

let calls = [] // every request the page makes: { method, url, body }
let desk
let engine
let steps = [] // the fake desk's undo steps: the bank before each delete
let failDelete = null // an id whose delete the fake desk refuses

const bank = (ids) => ids.map((id) => normaliseLook({ id, name: id.toUpperCase() }))
const reset = (ids, liveId) => {
    desk = {
        live: null, liveId, blackout: false, master: 1, bpm: 120, beat: 0, shapes: ['circle'], unsaved: false, changed: [], added: [],
        canUndo: false, canRedo: false, looks: bank(ids),
        cubes: [{ id: 'cube-1', on: true, flipX: false, size: 1, x: 0, y: -0.5, order: 0, driving: true, dark: false, held: null, points: 10, lit: 10, blanked: 0, offField: 0, offPercent: 0 }]
    }
    engine = { sim: true, zone: { xMin: -1, xMax: 1, yMin: -1, yMax: 1 }, cubes: [{ id: 'cube-1', name: 'Cube 1', armed: false, ip: '10.0.0.2', connected: true }] }
    calls = []
    steps = []
    failDelete = null
}
const fakeFetch = async (url, opts = {}) => {
    const json = (v, status = 200) => ({ ok: status < 400, status, json: async () => v })
    const method = opts.method || 'GET'
    const body = opts.body ? JSON.parse(opts.body) : {}
    calls.push({ method, url, body })
    if (method === 'POST') {
        if (url === 'desk/api/looks/delete') {
            if (body.id === failDelete) return json({ ok: false, error: 'the desk refused' }, 500)
            const i = desk.looks.findIndex((l) => l.id === body.id)
            if (i < 0) return json({ ok: false, error: `no look "${body.id}"` }, 404)
            steps.push(JSON.parse(JSON.stringify(desk.looks)))
            desk.looks.splice(i, 1)
            if (desk.liveId === body.id) desk.liveId = null
            desk.unsaved = true
            desk.canUndo = true
            return json({ ok: true })
        }
        if (url === 'desk/api/undo') {
            if (!steps.length) return json({ ok: true, undone: false })
            desk.looks = steps.pop()
            desk.unsaved = true // a restored bank differs from the one saved
            desk.canUndo = steps.length > 0
            return json({ ok: true, undone: true })
        }
        if (url === 'desk/api/save') { desk.unsaved = false; return json({ ok: true, created: [] }) }
        return json({ ok: true })
    }
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

// A fresh page on `query`, over a bank of `ids` with `liveId` on the laser.
const boot = async (query, { ids = ['a', 'b', 'c', 'live'], liveId = 'live', unsaved = false, names = null } = {}) => {
    window.history.replaceState({}, '', `/laser/${query}`)
    reset(ids, liveId)
    desk.unsaved = unsaved
    if (names) desk.looks.forEach((l, i) => { l.name = names[i] ?? l.name })
    document.body.innerHTML = indexHtml.match(/<body[^>]*>([\s\S]*)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/g, '')
    new Function(deskJs)()
    await sleep(120)
}

const $ = (id) => document.getElementById(id)
const shown = (id) => !$(id).hidden
const title = () => $('removeTitle').textContent
const note = () => $('removeNote').textContent
const rows = () => [...document.querySelectorAll('#removeList li')].map((li) => `${li.firstChild.textContent}${li.querySelector('.tag') ? ` | ${li.querySelector('.tag').textContent}` : ''}`)
const posts = () => calls.filter((c) => c.method === 'POST')
const sent = () => posts().map((c) => `${c.url.replace('desk/api/', '')}${c.body.id ? ` ${c.body.id}` : ''}`)
const tap = async (id) => {
    $(id).click()
    for (let i = 0; i < 100 && $('removeAsk').dataset.phase === 'busy'; i += 1) await sleep(20)
}
const ids = () => desk.looks.map((l) => l.id)

describe('?remove= asks first', () => {
    it('?remove=a,b,live lists a and b to go and keeps live; nothing is sent before the tap and the link stays', async () => {
        await boot('?remove=a,b,live')
        expect(shown('removeAsk')).toBe(true)
        expect(title()).toBe('Remove these 2 looks from the bank?')
        expect(rows()).toEqual(['A', 'B', 'LIVE | kept: it is on the laser'])
        expect($('removeGo').textContent).toBe('Remove 2')
        expect($('removeKeep').textContent).toBe('Keep them')
        expect(shown('removeUndo')).toBe(false)
        await sleep(300) // the polls run on; still nothing is sent
        expect(posts()).toEqual([])
        expect(window.location.search).toBe('?remove=a,b,live')
    })

    it('a page opened without ?remove shows no question and sends nothing', async () => {
        await boot('')
        await sleep(200)
        expect(shown('removeAsk')).toBe(false)
        expect(posts()).toEqual([])
    })

    it('the same id twice counts once; one look reads as "this look"', async () => {
        await boot('?remove=a,a')
        expect(title()).toBe('Remove this look from the bank?')
        expect($('removeGo').textContent).toBe('Remove 1')
    })

    it('a look name is shown as text, never as markup', async () => {
        await boot('?remove=a', { names: ['<img src=x onerror=alert(1)>'] })
        expect(rows()).toEqual(['<img src=x onerror=alert(1)>'])
        expect(document.querySelector('#removeAsk img')).toBeNull()
    })

    it('warns when the bank has other changes that are not saved, because Remove saves them too', async () => {
        await boot('?remove=a', { unsaved: true })
        expect(note()).toContain('other changes that are not saved yet')
    })
})

describe('the tap removes through the Edit pane delete, then the page Save', () => {
    it('Remove 2: exactly the deletes for a and b in order, then one Save; "Removed 2" with Undo; the link is dropped', async () => {
        await boot('?remove=a,b,live')
        await tap('removeGo')
        expect(sent()).toEqual(['looks/delete a', 'looks/delete b', 'save'])
        expect(ids()).toEqual(['c', 'live'])
        expect(title()).toBe('Removed 2')
        expect(note()).toBe('Saved · 1 kept: it is on the laser')
        expect(shown('removeUndo')).toBe(true)
        expect($('removeKeep').textContent).toBe('Close')
        expect(window.location.search).toBe('')
    })

    it('a second tap on a busy or finished panel sends nothing more', async () => {
        await boot('?remove=a,b')
        $('removeGo').click()
        $('removeGo').click() // while the first removal is on its way
        for (let i = 0; i < 100 && $('removeAsk').dataset.phase === 'busy'; i += 1) await sleep(20)
        $('removeGo').click() // after it
        await sleep(100)
        expect(sent()).toEqual(['looks/delete a', 'looks/delete b', 'save'])
    })

    it('an id that is not in the bank says "not found" and is never posted; an id with _ is a good id', async () => {
        await boot('?remove=a,nope_1')
        expect(title()).toBe('Remove this look from the bank?')
        expect(rows()).toEqual(['A', 'nope_1 | not found'])
        await tap('removeGo')
        expect(sent()).toEqual(['looks/delete a', 'save'])
        expect(note()).toContain('1 not found')
    })

    it('nothing removable (only the look on the laser): no Remove button, Close leaves everything as it was', async () => {
        await boot('?remove=live')
        expect(title()).toBe('Nothing to remove.')
        expect(shown('removeGo')).toBe(false)
        expect($('removeKeep').textContent).toBe('Close')
        await tap('removeKeep')
        expect(posts()).toEqual([])
        expect(shown('removeAsk')).toBe(false)
        expect(ids()).toEqual(['a', 'b', 'c', 'live'])
    })

    it('if the bank moved while the question was open, nothing is deleted and the question is asked again', async () => {
        await boot('?remove=a,b')
        desk.liveId = 'a' // the operator put a on the laser while the question was open
        await tap('removeGo')
        expect(posts()).toEqual([])
        expect(title()).toBe('Remove this look from the bank?')
        expect(rows()).toEqual(['A | kept: it is on the laser', 'B'])
        expect(note()).toContain('The bank changed while this was open')
        expect($('removeGo').textContent).toBe('Remove 1')
    })

    it('a refused delete stops the removal: no Save, the count says how far it got, and Undo still brings those back', async () => {
        await boot('?remove=a,b,c')
        failDelete = 'b'
        await tap('removeGo')
        expect(sent()).toEqual(['looks/delete a', 'looks/delete b'])
        expect(title()).toBe('Removed 1 of 3')
        expect(note()).toBe('Stopped: the desk refused · not saved')
        expect(shown('removeUndo')).toBe(true)
        calls = []
        failDelete = null
        await tap('removeUndo')
        expect(sent()).toEqual(['undo', 'save'])
        expect(ids()).toEqual(['a', 'b', 'c', 'live'])
    })
})

describe('Undo and Keep them', () => {
    it('Undo goes through the desk undo once per removed look, then Saves again', async () => {
        await boot('?remove=a,b')
        await tap('removeGo')
        calls = []
        await tap('removeUndo')
        expect(sent()).toEqual(['undo', 'undo', 'save'])
        expect(ids()).toEqual(['a', 'b', 'c', 'live'])
        expect(title()).toBe('Brought back 2')
        expect(note()).toBe('Saved')
    })

    it('Undo here is refused, with nothing posted, when the bank changed after the removal', async () => {
        await boot('?remove=a,b')
        await tap('removeGo')
        calls = []
        desk.unsaved = true // an edit made elsewhere after the removal
        await tap('removeUndo')
        expect(posts()).toEqual([])
        expect(note()).toContain('The bank changed after this')
        expect(shown('removeUndo')).toBe(false)
        expect(ids()).toEqual(['c', 'live'])
    })

    it('Keep them sends nothing at all, closes the question, drops only ?remove from the link and leaves the bank alone', async () => {
        await boot('?x=1&remove=a,b&y=2')
        expect(shown('removeAsk')).toBe(true)
        await tap('removeKeep')
        await sleep(300)
        expect(posts()).toEqual([])
        expect(shown('removeAsk')).toBe(false)
        expect(window.location.search).toBe('?x=1&y=2')
        expect(ids()).toEqual(['a', 'b', 'c', 'live'])
    })
})

describe('a malformed link is refused in plain words and sends nothing', () => {
    const refused = async (query, words) => {
        await boot(query)
        await sleep(150)
        expect(shown('removeAsk')).toBe(true)
        expect(title()).toBe('Nothing was removed.')
        expect(note()).toMatch(words)
        expect(shown('removeGo')).toBe(false)
        expect($('removeKeep').textContent).toBe('Close')
        expect(posts()).toEqual([])
        await tap('removeKeep')
        expect(shown('removeAsk')).toBe(false)
        expect(window.location.search).toBe('')
        expect(posts()).toEqual([])
    }
    it('an id with a character outside letters, digits, - and _', () => refused('?remove=a,B!d', /an id that no look can have: "B!d"\. A look id is letters, digits, - and _ only\./))
    it('an id with a space or a path in it', () => refused('?remove=a,x%20y,..%2Fetc', /ids that no look can have: "x y", "\.\.\/etc"/))
    it('an id longer than the desk allows (40)', () => refused(`?remove=${'a'.repeat(41)}`, /no look can have/))
    it('an empty list', () => refused('?remove=', /The link names no looks\./))
    it('more than 200 ids', () => refused(`?remove=${Array.from({ length: 201 }, (_, i) => `l${i}`).join(',')}`, /names 201 looks\. One link may name at most 200\./))

    it('exactly 200 ids is a list: none of them are in the bank, so there is nothing to remove', async () => {
        await boot(`?remove=${Array.from({ length: 200 }, (_, i) => `l${i}`).join(',')}`)
        expect(title()).toBe('Nothing to remove.')
        expect(rows()).toHaveLength(200)
        expect(posts()).toEqual([])
    })
})
