// The show desk's route (routes/showDeskRoutes.js): only files, local only, and no route of its own that takes a POST.
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const express = require('express')
const { registerShowDeskRoutes } = require('./showDeskRoutes.js')

const envBefore = { NODE_ENV: process.env.NODE_ENV, DI_LOCAL: process.env.DI_LOCAL }
const servers = []
afterEach(async () => {
    while (servers.length) await new Promise((r) => servers.pop().close(r))
    for (const [k, v] of Object.entries(envBefore)) { if (v == null) delete process.env[k]; else process.env[k] = v }
})
const boot = async () => {
    const app = express()
    registerShowDeskRoutes(app, { mountPaths: ['/serverXR/show'] })
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
