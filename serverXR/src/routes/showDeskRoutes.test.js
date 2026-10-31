// The show desk's route (routes/showDeskRoutes.js): the page's files and one read (who is on), local only, and no route of its own
// that takes a POST. observeDeskWrites tells the touch board about a desk's write only after the desk took it.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const express = require('express')
const { registerShowDeskRoutes, observeDeskWrites } = require('./showDeskRoutes.js')
const { createTouchBoard } = require('../touchBoard.js')
const here = path.dirname(fileURLToPath(import.meta.url))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const envBefore = { NODE_ENV: process.env.NODE_ENV, DI_LOCAL: process.env.DI_LOCAL }
const servers = []
afterEach(async () => {
    while (servers.length) await new Promise((r) => servers.pop().close(r))
    for (const [k, v] of Object.entries(envBefore)) { if (v == null) delete process.env[k]; else process.env[k] = v }
})
const boot = async (options = {}) => {
    const app = express()
    registerShowDeskRoutes(app, { mountPaths: ['/serverXR/show'], ...options })
    const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
    servers.push(server)
    return `http://127.0.0.1:${server.address().port}/serverXR/show`
}

describe('GET /show', () => {
    it('redirects /show to /show/ and serves the page and its files', async () => {
        delete process.env.NODE_ENV
        const base = await boot()
        const bare = await fetch(`${base}?x=1`, { redirect: 'manual' })
        expect(bare.status).toBe(302)
        expect(bare.headers.get('location')).toBe('/serverXR/show/?x=1')
        const page = await fetch(`${base}/`)
        expect(page.status).toBe(200)
        expect(await page.text()).toContain('<title>Show desk</title>')
        for (const file of ['show.js', 'show.css']) expect((await fetch(`${base}/${file}`)).status).toBe(200)
    })
    it('has no route that takes a POST: every press is one of the two desks\' own routes', async () => {
        delete process.env.NODE_ENV
        const base = await boot()
        for (const p of ['/', '/api/arm', '/api/blackout']) {
            const res = await fetch(`${base}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
            expect(res.status).toBe(404)
        }
    })
    it('is local only: a hosted tier answers 404', async () => {
        process.env.NODE_ENV = 'production'
        delete process.env.DI_LOCAL
        const base = await boot()
        expect((await fetch(`${base}/`)).status).toBe(404)
    })
})

describe('GET /show/api/who: who is on', () => {
    it('answers the board as JSON, never cached; asking puts the browser on it', async () => {
        delete process.env.NODE_ENV
        const base = await boot({ board: createTouchBoard() })
        const first = await fetch(`${base}/api/who`, { headers: { 'X-Di-Client': 'aa11', 'X-Di-Label': encodeURIComponent('Mac') } })
        expect(first.status).toBe(200)
        expect(first.headers.get('cache-control')).toBe('no-store')
        expect(first.headers.get('content-type')).toMatch(/json/)
        expect(await first.json()).toMatchObject({ ok: true, clients: [{ id: 'aa11', label: 'Mac', touchMs: null }], touches: [] })
        const anonymous = await (await fetch(`${base}/api/who`)).json() // no id: nobody new on the list
        expect(anonymous.clients.map((c) => c.id)).toEqual(['aa11'])
    })
    it('a board that throws answers an empty list, never an error; the page\'s files are still served', async () => {
        delete process.env.NODE_ENV
        const base = await boot({ board: { seen() { throw new Error('boom') }, snapshot() { throw new Error('boom') } } })
        const res = await fetch(`${base}/api/who`)
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ ok: true, clients: [], touches: [] })
        expect((await fetch(`${base}/show.js`)).status).toBe(200)
    })
    it('is a read and local only: a POST to it is a 404, and a hosted tier answers 404 to a GET', async () => {
        delete process.env.NODE_ENV
        const base = await boot()
        expect((await fetch(`${base}/api/who`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status).toBe(404)
        process.env.NODE_ENV = 'production'
        delete process.env.DI_LOCAL
        expect((await fetch(`${base}/api/who`)).status).toBe(404)
    })
})

describe('observeDeskWrites: the desks answer exactly as before; the board hears of a write only after the desk took it', () => {
    const bootDesk = async (board) => {
        const app = express()
        observeDeskWrites(app, { mountPaths: ['/serverXR/light'], board }) // before the desk, as in index.js
        const desk = express.Router()
        desk.use(express.json()) // the real desks read their own bodies after it
        desk.post('/api/ok', (req, res) => res.json({ ok: true, echo: req.body }))
        desk.post('/api/refused', (req, res) => res.status(403).json({ ok: false }))
        desk.get('/api/state', (req, res) => res.json({ ok: true }))
        app.use('/serverXR/light', desk)
        const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
        servers.push(server)
        return `http://127.0.0.1:${server.address().port}/serverXR/light`
    }
    const named = { 'content-type': 'application/json', 'x-di-client': 'aa11', 'x-di-label': 'Mac', 'x-di-control': 'lamp:f1' }
    const post = (base, p, headers = named, body = '{"id":"f1","values":{"dimmer":7}}') => fetch(`${base}${p}`, { method: 'POST', headers, body })

    it('a write the desk took (below 400) with a control is recorded; its answer and body are untouched', async () => {
        const board = createTouchBoard()
        const base = await bootDesk(board)
        const res = await post(base, '/api/ok')
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ ok: true, echo: { id: 'f1', values: { dimmer: 7 } } }) // the body reached the desk whole
        await sleep(30)
        expect(board.snapshot().touches.map((t) => t.control)).toEqual(['lamp:f1'])
    })
    it('a refused write (403), an unknown route (404), a write with no control and a read are not recorded', async () => {
        const board = createTouchBoard()
        const base = await bootDesk(board)
        expect((await post(base, '/api/refused')).status).toBe(403)
        expect((await post(base, '/api/nowhere')).status).toBe(404)
        expect((await post(base, '/api/ok', { 'content-type': 'application/json', 'x-di-client': 'aa11' })).status).toBe(200)
        expect((await fetch(`${base}/api/state`, { headers: named })).status).toBe(200)
        await sleep(30)
        expect(board.snapshot().touches).toEqual([])
    })
    it('a board that throws changes nothing: the desk still answers', async () => {
        const base = await bootDesk({ touch() { throw new Error('boom') } })
        const res = await post(base, '/api/ok')
        expect(res.status).toBe(200)
        expect((await res.json()).ok).toBe(true)
        await sleep(30)
    })
    it('index.js registers the observer before the lighting desk and the lasers, with the mount paths they use, and hands the same board to the show desk', () => {
        const src = fs.readFileSync(path.join(here, '../index.js'), 'utf8')
        const at = (needle) => src.indexOf(needle)
        expect(at('observeDeskWrites(app')).toBeGreaterThan(-1)
        expect(at('observeDeskWrites(app')).toBeLessThan(at('registerLightingRoutes(app'))
        expect(at('observeDeskWrites(app')).toBeLessThan(at('registerLaserRoutes(app'))
        expect(src).toMatch(/observeDeskWrites\(app, \{ mountPaths: \[\.\.\.lightMounts, \.\.\.laserMounts\], board: touchBoard \}\)/)
        expect(src).toMatch(/registerLightingRoutes\(app, \{[\s\S]*?mountPaths: lightMounts,/)
        expect(src).toMatch(/registerLaserRoutes\(app, \{[\s\S]*?mountPaths: laserMounts,/)
        expect(src).toMatch(/registerShowDeskRoutes\(app, \{.*board: touchBoard \}\)/)
    })
})
