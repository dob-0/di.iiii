// @vitest-environment node

// A .diiii for a space that already exists is a proposal (contentProposals.js).
// Real servers, a real bundle written by scripts/space-bundle.mjs, a fake inner
// bot on the loopback, and the real signed decision route: the file waits,
// Apply writes it with a restore point first and the space's own settings
// untouched, Reject writes nothing, and a space that moved on refuses.

import crypto from 'node:crypto'
import { execFile, spawn } from 'node:child_process'
import http from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.setConfig({ testTimeout: 90_000, hookTimeout: 40_000 })

const execFileAsync = promisify(execFile)
const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SERVER_ENTRY = path.join(SERVER_ROOT, 'src/index.js')
const BUNDLE_SCRIPT = path.resolve(SERVER_ROOT, '..', 'scripts/space-bundle.mjs')
const SECRET = 'proposal-contract-secret'

const cleanups = []
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const getFreePort = () => new Promise((resolve, reject) => {
    const server = net.createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
        const { port } = server.address()
        server.close(() => resolve(port))
    })
})

const makeTempDir = async (prefix) => {
    const dir = await mkdtemp(path.join(os.tmpdir(), prefix))
    cleanups.push(() => rm(dir, { recursive: true, force: true }))
    return dir
}

const startServer = async (dataRoot, extraEnv = {}) => {
    const port = await getFreePort()
    const child = spawn(process.execPath, [SERVER_ENTRY], {
        cwd: await makeTempDir('dii-proposal-cwd-'),
        env: { ...process.env, PORT: String(port), NODE_ENV: 'test', APP_BASE_PATH: '/serverXR', DATA_ROOT: dataRoot, API_TOKEN: 'test-token', REQUIRE_AUTH: '', CORS_ORIGINS: '*', ...extraEnv },
        stdio: ['ignore', 'pipe', 'pipe']
    })
    let logs = ''
    child.stdout.on('data', (c) => { logs += c })
    child.stderr.on('data', (c) => { logs += c })
    let exited = false
    child.once('exit', () => { exited = true })
    const stop = async () => {
        if (exited) return
        child.kill('SIGTERM')
        const done = await Promise.race([new Promise((r) => child.once('exit', () => r(true))), wait(3000).then(() => false)])
        if (!done && !exited) { child.kill('SIGKILL'); await new Promise((r) => child.once('exit', r)) }
    }
    cleanups.push(stop)
    const baseUrl = `http://127.0.0.1:${port}/serverXR`
    const deadline = Date.now() + 15000
    while (Date.now() < deadline) {
        if (exited) throw new Error(`server exited early\n${logs}`)
        try { if ((await fetch(`${baseUrl}/api/health`)).ok) return { baseUrl, stop, logs: () => logs } } catch { /* retry */ }
        await wait(200)
    }
    throw new Error(`server not healthy\n${logs}`)
}

// The inner bot, as far as di.iiii can tell: it takes POST /approvals and says 200.
const startFakeBot = async () => {
    const received = []
    const server = http.createServer((req, res) => {
        const chunks = []
        req.on('data', (c) => chunks.push(c))
        req.on('end', () => {
            received.push({ url: req.url, headers: req.headers, body: JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') })
            res.writeHead(200, { 'content-type': 'application/json' })
            res.end('{"ok":true}')
        })
    })
    const port = await getFreePort()
    await new Promise((r) => server.listen(port, '127.0.0.1', r))
    cleanups.push(() => new Promise((r) => server.close(r)))
    return { url: `http://127.0.0.1:${port}`, received }
}

afterEach(async () => {
    for (const fn of cleanups.splice(0).reverse()) await fn()
}, 30000)

const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const entity = (id) => ({ id, type: 'text', name: id, components: { transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } } })
const runBundle = (args, dataRoot) => execFileAsync(process.execPath, [BUNDLE_SCRIPT, ...args], { env: { ...process.env, DATA_ROOT: dataRoot } })

// PUT document takes its title from the document, so the title rides along.
const putDocument = async (server, projectId, ids) => {
    const title = projectId === 'extra' ? 'Extra' : 'Page'
    const r = await fetch(`${server.baseUrl}/api/projects/${projectId}/document`, json('PUT', { projectMeta: { title }, entities: ids.map(entity) }))
    expect(r.status).toBe(200)
}
const documentOf = async (server, projectId) => {
    const r = await fetch(`${server.baseUrl}/api/projects/${projectId}/document`)
    const body = await r.json()
    if (!body.document) throw new Error(`no document for ${projectId}: ${r.status} ${JSON.stringify(body).slice(0, 300)}`)
    return body.document
}

const propose = async (server, file, fields = {}) => {
    const { readFile } = await import('node:fs/promises')
    const form = new FormData()
    for (const [k, v] of Object.entries(fields)) form.append(k, v)
    form.append('bundle', new Blob([await readFile(file)]), 'wcc.diiii')
    const r = await fetch(`${server.baseUrl}/api/spaces/wcc/proposals`, { method: 'POST', body: form })
    return { status: r.status, body: await r.json() }
}

const decide = async (server, pending, decision) => {
    const raw = JSON.stringify({ id: pending.id, intentHash: pending.intentHash, decisionToken: pending.decisionToken, decision, decidedBy: 'test' })
    const ts = String(Date.now())
    const sig = crypto.createHmac('sha256', SECRET).update(`${ts}.${raw}`).digest('hex')
    const r = await fetch(`${server.baseUrl}/api/approvals/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-DII-Timestamp': ts, 'X-DII-Signature': `sha256=${sig}` },
        body: raw
    })
    return { status: r.status, body: await r.json() }
}

describe('a file for an existing space is a proposal', () => {
    it('waits for Apply, applies with a restore point, keeps the space settings; refuses a stale file; Reject writes nothing', async () => {
        // The collaborator's copy: WCC with one project, one item.
        const srcRoot = await makeTempDir('dii-proposal-src-')
        let src = await startServer(srcRoot)
        expect((await fetch(`${src.baseUrl}/api/spaces`, json('POST', { slug: 'wcc', label: 'WCC' }))).status).toBe(201)
        const page = (await (await fetch(`${src.baseUrl}/api/spaces/wcc/projects`, json('POST', { title: 'Page', slug: 'page' }))).json()).project.id
        await putDocument(src, page, ['e1'])

        await src.stop()
        const out = await makeTempDir('dii-proposal-out-')
        const fileA = path.join(out, 'a.diiii')
        await runBundle(['export', 'wcc', '--out', fileA], srcRoot)
        src = await startServer(srcRoot)

        // The owner's tier starts from that copy…
        const tgtRoot = await makeTempDir('dii-proposal-tgt-')
        await runBundle(['import', fileA], tgtRoot)

        // …and the collaborator keeps working: two more items, a new project, a file.
        await putDocument(src, page, ['e1', 'e2', 'e3'])
        // No approval bot on this server: a proposal is refused, never applied.
        const noBot = await propose(src, fileA, { mode: 'propose', overwriteNewer: 'true' })
        expect(noBot.status).toBe(503)
        expect((await documentOf(src, page)).entities).toHaveLength(3)
        const extra = (await (await fetch(`${src.baseUrl}/api/spaces/wcc/projects`, json('POST', { title: 'Extra', slug: 'extra' }))).json()).project.id
        await putDocument(src, extra, ['x1'])
        const assetForm = new FormData()
        assetForm.append('asset', new Blob([Buffer.from('proposal-bytes')], { type: 'application/octet-stream' }), 'blob.bin')
        const uploaded = await (await fetch(`${src.baseUrl}/api/projects/${extra}/assets`, { method: 'POST', body: assetForm })).json()
        const assetId = (uploaded.asset ?? uploaded).id ?? (uploaded.asset ?? uploaded).assetId
        await src.stop()
        await wait(20)
        const fileB = path.join(out, 'b.diiii')
        await runBundle(['export', 'wcc', '--out', fileB], srcRoot)

        const bot = await startFakeBot()
        const tgt = await startServer(tgtRoot, {
            APPROVAL_BOT_URL: bot.url,
            APPROVAL_SHARED_SECRET: SECRET,
            APPROVAL_CALLBACK_URL: 'https://dev.example.test/serverXR'
        })
        expect((await fetch(`${tgt.baseUrl}/api/spaces/wcc`, json('PATCH', { label: 'WCC (owner)' }))).status).toBe(200)

        // The summary, before anything exists.
        const dry = await propose(tgt, fileB, { dryRun: 'true' })
        expect(dry.status).toBe(200)
        expect(dry.body.status).toBe('dry_run')
        expect(dry.body.text).toContain('Page — changed: 1 → 3 items')
        expect(dry.body.text).toContain('Extra — added: new, 1 item')
        expect(dry.body.text).toMatch(/Files: \+\d+ new file/)
        expect(bot.received).toHaveLength(0)

        // The same summary through the CLI door, pointed at this server as `local`.
        const cli = await execFileAsync(process.execPath, [BUNDLE_SCRIPT, 'propose', fileB, '--tier', 'local', '--dry-run'], {
            env: { ...process.env, LOCAL_API_URL: tgt.baseUrl, API_TOKEN: 'test-token' }
        })
        expect(cli.stdout).toContain('Page — changed: 1 → 3 items')
        expect(cli.stdout).toContain('dry run: nothing was created')
        expect(bot.received).toHaveLength(0)

        // A proposal: nothing written, one message to the bot.
        const sent = await propose(tgt, fileB, { mode: 'propose', from: 'Emilya' })
        expect(sent.status).toBe(202)
        expect(sent.body.status).toBe('pending_approval')
        expect(bot.received).toHaveLength(1)
        const pending = bot.received[0].body
        expect(bot.received[0].url).toBe('/approvals')
        expect(pending).toMatchObject({ kind: 'content.apply', id: sent.body.approvalId, server: 'https://dev.example.test/serverXR' })
        expect(pending.summary).toContain('From: Emilya')
        expect((await documentOf(tgt, page)).entities).toHaveLength(1)
        expect((await fetch(`${tgt.baseUrl}/api/projects/${extra}`)).status).toBe(404)

        // Apply.
        const applied = await decide(tgt, pending, 'approve')
        expect(applied.body).toMatchObject({ status: 'approved', executed: true })
        expect((await documentOf(tgt, page)).entities.map((e) => e.id)).toEqual(['e1', 'e2', 'e3'])
        expect((await documentOf(tgt, extra)).entities.map((e) => e.id)).toEqual(['x1'])
        const bytes = Buffer.from(await (await fetch(`${tgt.baseUrl}/api/projects/${extra}/assets/${assetId}`)).arrayBuffer())
        expect(bytes.toString()).toBe('proposal-bytes')
        const meta = (await (await fetch(`${tgt.baseUrl}/api/spaces/wcc`)).json()).space
        expect(meta.label).toBe('WCC (owner)')
        const snapshots = (await (await fetch(`${tgt.baseUrl}/api/spaces/wcc/snapshots`)).json()).snapshots
        expect(snapshots.some((s) => s.reason === 'before-proposal-apply')).toBe(true)

        // The old file is now older than the space: refused, with what would be lost.
        const stale = await propose(tgt, fileA, { mode: 'propose' })
        expect(stale.status).toBe(409)
        expect(stale.body.code).toBe('target_newer')
        expect(stale.body.text).toContain('Newer here than the file')

        // Proposed anyway, then the space moves before Apply: Apply refuses.
        const again = await propose(tgt, fileA, { mode: 'propose', overwriteNewer: 'true' })
        expect(again.status).toBe(202)
        await wait(5)
        await putDocument(tgt, page, ['e1', 'e2', 'e3', 'owner-edit'])
        const late = await decide(tgt, bot.received[1].body, 'approve')
        expect(late.body).toMatchObject({ status: 'approved', executed: false })
        expect(late.body.error).toContain('changed after this proposal')
        expect((await documentOf(tgt, page)).entities).toHaveLength(4)

        // Reject writes nothing.
        const third = await propose(tgt, fileA, { mode: 'propose', overwriteNewer: 'true' })
        expect(third.status).toBe(202)
        const denied = await decide(tgt, bot.received[2].body, 'deny')
        expect(denied.body.status).toBe('denied')
        expect((await documentOf(tgt, page)).entities).toHaveLength(4)
    })

    it('applies directly for a trusted person, but not over work the file never saw', async () => {
        const srcRoot = await makeTempDir('dii-proposal-src2-')
        let src = await startServer(srcRoot)
        await fetch(`${src.baseUrl}/api/spaces`, json('POST', { slug: 'wcc', label: 'WCC' }))
        const page = (await (await fetch(`${src.baseUrl}/api/spaces/wcc/projects`, json('POST', { title: 'Page', slug: 'page' }))).json()).project.id
        await putDocument(src, page, ['e1'])
        await src.stop()
        const out = await makeTempDir('dii-proposal-out2-')
        const fileA = path.join(out, 'a.diiii')
        await runBundle(['export', 'wcc', '--out', fileA], srcRoot)
        const tgtRoot = await makeTempDir('dii-proposal-tgt2-')
        await runBundle(['import', fileA], tgtRoot)

        // The owner edits BEFORE the collaborator exports: the file's export
        // time says nothing is newer here, its op history says otherwise.
        const tgt = await startServer(tgtRoot)
        await putDocument(tgt, page, ['e1', 'owner'])
        src = await startServer(srcRoot)
        await putDocument(src, page, ['e1', 'e2'])
        await src.stop()
        await wait(20)
        const fileB = path.join(out, 'b.diiii')
        await runBundle(['export', 'wcc', '--out', fileB], srcRoot)

        const diverged = await propose(tgt, fileB)
        expect(diverged.status).toBe(409)
        expect(diverged.body.code).toBe('target_newer')
        expect(diverged.body.text).toContain("changed here after the file's author last pulled: Page")
        expect((await documentOf(tgt, page)).entities.map((e) => e.id)).toEqual(['e1', 'owner'])

        // Auth off = unrestricted = trusted: applied at once, with a restore point.
        const result = await propose(tgt, fileB, { overwriteNewer: 'true' })
        expect(result.status).toBe(200)
        expect(result.body.status).toBe('applied')
        expect(result.body.result.restorePoint).toBeTruthy()
        expect((await documentOf(tgt, page)).entities.map((e) => e.id)).toEqual(['e1', 'e2'])

        const same = await propose(tgt, fileB)
        expect(same.body.status).toBe('nothing_to_apply')
    })
})
