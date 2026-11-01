// @vitest-environment node
// di show checkpoint and the probe, run for real with bash on this machine against a temporary di home
// and a local HTTP server standing in for the di server. Nothing leaves the temp folders.
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { loadProfile } from './lib/profile.mjs'
import { makeTransport } from './lib/transport.mjs'
import { parseProbe, probeScript } from './lib/probe.mjs'
import { REMOTE_CACHE, runCheckpoint } from './checkpoint.mjs'

let server
let port
let failPath = null
const ROUTES = {
    '/serverXR/laser/api/state': { cubes: [{ id: 'c1', connected: true, armed: false, stop: null }] },
    '/serverXR/laser/desk/api/state': { looks: [1], unsaved: false },
    '/serverXR/light/api/summary': { scenes: 2 },
    '/serverXR/light/api/state': { output: { enabled: true } }
}
beforeAll(async () => {
    server = http.createServer((req, res) => {
        if (failPath && req.url.endsWith(failPath)) { res.writeHead(500); res.end('boom'); return }
        if (req.url.endsWith('/')) { res.writeHead(200); res.end('<!doctype html>'); return }
        const body = ROUTES[req.url]
        res.writeHead(body ? 200 : 404, { 'content-type': 'application/json' })
        res.end(JSON.stringify(body ?? { error: 'no route' }))
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    port = server.address().port
})
afterAll(() => new Promise((resolve) => server.close(resolve)))
const tmps = []
afterEach(() => { failPath = null; while (tmps.length) fs.rmSync(tmps.pop(), { recursive: true, force: true }) })

function machine({ marker = 'venue-a', installed = true } = {}) {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'di-show-ck-'))
    tmps.push(home)
    const w = (rel, text) => { fs.mkdirSync(path.dirname(path.join(home, rel)), { recursive: true }); fs.writeFileSync(path.join(home, rel), text) }
    w('.di/data/laser/laser.json', '{"cubes":[]}')
    w('.di/data/laser/.token', 'LOCK-FILE-MUST-NOT-TRAVEL')
    w('.di/data/lighting/show.json', '{"scenes":[]}')
    w('.di/releases/9.9.9/release.json', '{"subject":[{"digest":{"sha256":"cd"}}]}')
    w('.di/releases/9.9.9/PATCHES', 'ui.abc12345 2099-01-01\n')
    if (installed) fs.symlinkSync(path.join(home, '.di/releases/9.9.9'), path.join(home, '.di/current'))
    if (marker) w('.config/di/venue', `${marker}\n`)
    w('venues/venue-a.json', JSON.stringify({
        venue: 'venue-a', confirmed: false, host: 'local', api: `http://127.0.0.1:${port}/serverXR`,
        backupsDir: path.join(home, 'backups'), packsDir: '~/packs', laser: {}, light: {}, midi: false, watch: false
    }))
    const profile = loadProfile({ flags: { venue: 'venue-a', 'venues-dir': path.join(home, 'venues') }, env: {}, home })
    const transport = makeTransport({ host: 'local', env: { ...process.env, HOME: home } })
    return { home, profile, transport }
}
const listTar = (file) => spawnSync('tar', ['tzf', file], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean)

describe('di show checkpoint (real bash, here)', () => {
    it('both bash halves pass bash -n', () => {
        for (const f of ['lib/checkpoint.sh', 'lib/probe.sh']) expect(spawnSync('bash', ['-n', new URL(`./${f}`, import.meta.url).pathname]).status).toBe(0)
    })

    it('takes a whole checkpoint: data without lock files, version, states, RESTORE.md and a hashed manifest', async () => {
        const { home, profile, transport } = machine()
        const r = await runCheckpoint({ profile, why: 'test change', session: 'test-session', transport, home })
        expect(r.code, r.stderrTail).toBe(0)
        expect(r.version).toBe('9.9.9')
        const files = fs.readdirSync(r.folder)
        expect(files).toEqual(expect.arrayContaining(['data.tgz', 'version.txt', 'release.json', 'PATCHES', 'marker.txt', 'laser-api-state.json', 'laser-desk-api-state.json', 'light-api-summary.json', 'RESTORE.md', 'manifest.json']))
        const members = listTar(path.join(r.folder, 'data.tgz'))
        expect(members).toEqual(expect.arrayContaining(['laser/laser.json', 'lighting/show.json']))
        expect(members.some((m) => m.endsWith('.token'))).toBe(false)
        const cache = path.join(home, REMOTE_CACHE.slice(2))
        const ts = fs.readdirSync(cache)[0]
        expect(listTar(path.join(cache, ts, 'data.tgz')).some((m) => m.endsWith('.token'))).toBe(false)
        const restore = fs.readFileSync(path.join(r.folder, 'RESTORE.md'), 'utf8')
        expect(restore).toMatch(/di update --from ~\/packs\/di-runtime-9\.9\.9\.tar\.gz/)
        expect(restore).toMatch(/Overlays \(PATCHES lines\): 1\./)
        const manifest = JSON.parse(fs.readFileSync(path.join(r.folder, 'manifest.json'), 'utf8'))
        expect(manifest).toMatchObject({ venue: 'venue-a', why: 'test change', session: 'test-session', version: '9.9.9', exit: 0, unreadable: [] })
        expect(manifest.files.every((f) => /^[0-9a-f]{64}$/.test(f.sha256))).toBe(true)
    })

    it('says partial (exit 3) and names the live state it could not read', async () => {
        const { home, profile, transport } = machine()
        failPath = 'light/api/summary'
        const r = await runCheckpoint({ profile, why: 'test', transport, home })
        expect(r.code).toBe(3)
        expect(r.stderrTail).toMatch(/state light\/api\/summary unreadable/)
        expect(fs.readFileSync(path.join(r.folder, 'RESTORE.md'), 'utf8')).toMatch(/Unreadable live states: light\/api\/summary/)
    })

    it('refuses (exit 2) on a machine marked for another venue and writes nothing', async () => {
        const { home, profile, transport } = machine({ marker: 'venue-b' })
        const r = await runCheckpoint({ profile, why: 'test', transport, home })
        expect([r.code, r.folder]).toEqual([2, null])
        expect(r.stderrTail).toMatch(/marked "venue-b"/)
        expect(fs.existsSync(path.join(home, '.cache'))).toBe(false)
        expect(fs.existsSync(path.join(home, 'backups'))).toBe(false)
    })

    it('fails (exit 1) and keeps the reason when no version is running', async () => {
        const { home, profile, transport } = machine({ installed: false })
        const r = await runCheckpoint({ profile, why: 'test', transport, home })
        expect(r.code).toBe(1)
        expect(fs.readFileSync(path.join(r.folder, 'FAILED.txt'), 'utf8')).toMatch(/no running version/)
    })
})

describe('the probe (real bash, here)', () => {
    it('reads the marker, the pack, the pages, the states and this machine\'s sysfs', async () => {
        const { profile, transport } = machine()
        const res = await transport.run(probeScript(profile))
        expect(res.code, res.stderr).toBe(0)
        const r = parseProbe(res.stdout.toString('utf8'))
        expect(typeof r.now).toBe('number')
        expect([r.marker, r.version, r.patches]).toEqual(['venue-a', '9.9.9', ['ui.abc12345 2099-01-01']])
        expect(r.release.subject[0].digest.sha256).toBe('cd')
        expect(r.pages).toEqual({ 'laser/': 200, 'light/': 200, 'show/': 200 })
        expect(r.api.laser).toMatchObject({ code: 200, json: { cubes: [{ id: 'c1' }] } })
        expect(r.api.light.code).toBe(200)
        expect(Array.isArray(r.usb)).toBe(true)
        expect(typeof r.kernel.readable).toBe('boolean')
        expect(typeof r.journal.persistent).toBe('boolean')
    })
})
