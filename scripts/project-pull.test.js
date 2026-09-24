// @vitest-environment node
//
// project-pull.mjs against two loopback "tiers", spawned as the real process —
// the same path the 2026-09-18 carry took (`--force` onto a project that
// already exists). Nothing here reaches a real tier.

import { execFile } from 'node:child_process'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT = path.join(ROOT_DIR, 'scripts', 'project-pull.mjs')
const PID = 'main-dii-project'

const hex = (n) => n.toString(16).padStart(64, '0')
const image = (i) => ({ id: `slide-${i}`, type: 'image', name: `Slide ${i}`, components: { media: { assetId: hex(i + 1) } } })
const other = (i) => ({ id: `text-${i}`, type: 'text', name: `Text ${i}`, components: {} })
const nine = Array.from({ length: 9 }, (_, i) => other(i))
// prod: the portfolio deck (76 slides) and nine other things. dev: the nine.
const PROD_DOC = { projectMeta: { id: PID, spaceId: 'main', title: 'Front room' }, entities: [...Array.from({ length: 76 }, (_, i) => image(i)), ...nine], assets: [] }
const DEV_DOC = { projectMeta: { id: PID, spaceId: 'main', title: 'Front room' }, entities: nine, assets: [] }

const servers = []
afterEach(async () => {
    for (const s of servers.splice(0)) await new Promise((r) => s.close(r))
})

// One loopback server playing both tiers: /dev/… is the source, /prod/… the target.
const startTiers = async ({ targetDoc = PROD_DOC } = {}) => {
    const writes = []
    const server = http.createServer((req, res) => {
        const chunks = []
        req.on('data', (c) => chunks.push(c))
        req.on('end', () => {
            const send = (status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)) }
            const url = req.url
            if (req.method === 'GET' && url === `/dev/serverXR/api/projects/${PID}/document`) return send(200, { document: DEV_DOC, version: 3 })
            if (req.method === 'GET' && url === `/prod/serverXR/api/projects/${PID}/document`) {
                return targetDoc ? send(200, { document: targetDoc, version: 9 }) : send(404, { error: 'Project not found.' })
            }
            if (req.method === 'GET' && url === '/prod/serverXR/api/spaces/main') return send(200, { space: { id: 'main' } })
            if (req.method === 'POST' && url === '/prod/serverXR/api/spaces/main/projects') {
                writes.push({ method: req.method, url })
                return targetDoc ? send(409, { error: 'exists' }) : send(201, { project: { id: PID } })
            }
            if (url.startsWith('/prod/')) {
                writes.push({ method: req.method, url, body: Buffer.concat(chunks).toString('utf8') })
                return send(200, { ok: true })
            }
            send(404, { error: 'no route' })
        })
    })
    await new Promise((r) => server.listen(0, '127.0.0.1', r))
    servers.push(server)
    const base = `http://127.0.0.1:${server.address().port}`
    return { from: `${base}/dev/serverXR`, to: `${base}/prod/serverXR`, writes }
}

const pull = (tiers, extra = []) => execFileAsync(process.execPath, [
    SCRIPT, PID, '--from', tiers.from, '--to', tiers.to, '--token', 't', '--to-token', 't', '--no-assets', ...extra
], { cwd: ROOT_DIR, env: { ...process.env, LIVE_API_URL: '', LOCAL_API_URL: '' } })

const documentWrites = (tiers) => tiers.writes.filter((w) => w.method === 'PUT' && w.url.endsWith('/document'))

describe('project-pull says what a replace removes, and refuses media loss it was not told to accept', () => {
    it('the incident: --force over 85 items with 9 is REFUSED, and nothing is written', async () => {
        const tiers = await startTiers()
        const err = await pull(tiers, ['--force']).catch((e) => e)
        expect(err.code).toBe(1)
        expect(err.stdout + err.stderr).toContain('this replace REMOVES 76 of 85 items — 76 image (media)')
        expect(err.stderr).toContain('--accept-loss 76')
        expect(tiers.writes).toEqual([])
    })

    it('a wrong number is refused again', async () => {
        const tiers = await startTiers()
        const err = await pull(tiers, ['--force', '--accept-loss', '75']).catch((e) => e)
        expect(err.code).toBe(1)
        expect(err.stderr).toContain('does not match the 76')
        expect(tiers.writes).toEqual([])
    })

    it('the exact number carries it out', async () => {
        const tiers = await startTiers()
        const { stdout } = await pull(tiers, ['--force', '--accept-loss', '76'])
        expect(stdout).toContain('REMOVES 76 of 85')
        const puts = documentWrites(tiers)
        expect(puts).toHaveLength(1)
        expect(JSON.parse(puts[0].body).entities).toHaveLength(9)
    })

    it('--dry-run prints the summary and writes nothing', async () => {
        const tiers = await startTiers()
        const { stdout } = await pull(tiers, ['--force', '--dry-run'])
        expect(stdout).toContain('this replace REMOVES 76 of 85 items — 76 image (media)')
        expect(tiers.writes).toEqual([])
    })

    it('a project the target does not have yet loses nothing and needs no acknowledgement', async () => {
        const tiers = await startTiers({ targetDoc: null })
        const { stdout } = await pull(tiers)
        expect(stdout).toContain('nothing is removed')
        expect(documentWrites(tiers)).toHaveLength(1)
    })
})
