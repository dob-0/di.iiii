// @vitest-environment node

import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SERVER_ENTRY = path.join(SERVER_ROOT, 'src/index.js')

const activeServers = []

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms))

const getFreePort = async () => {
    return new Promise((resolve, reject) => {
        const server = net.createServer()
        server.on('error', reject)
        server.listen(0, '127.0.0.1', () => {
            const address = server.address()
            const port = typeof address === 'object' && address ? address.port : 0
            server.close((error) => {
                if (error) reject(error)
                else resolve(port)
            })
        })
    })
}

const waitForHealth = async ({ url, child, getLogs }) => {
    const deadline = Date.now() + 15000
    while (Date.now() < deadline) {
        if (child.exitCode !== null) {
            throw new Error(`Server exited early.\n${getLogs()}`)
        }
        try {
            const response = await fetch(url)
            if (response.ok) return
        } catch {
            // retry
        }
        await wait(200)
    }
    throw new Error(`Server did not become healthy in time.\n${getLogs()}`)
}

const startServer = async () => {
    const sandboxCwd = await mkdtemp(path.join(os.tmpdir(), 'dii-project-server-cwd-'))
    const sandboxDataRoot = await mkdtemp(path.join(os.tmpdir(), 'dii-project-server-data-'))
    const port = await getFreePort()
    const child = spawn(process.execPath, [SERVER_ENTRY], {
        cwd: sandboxCwd,
        env: {
            ...process.env,
            PORT: String(port),
            NODE_ENV: 'test',
            APP_BASE_PATH: '/serverXR',
            DATA_ROOT: sandboxDataRoot,
            API_TOKEN: 'test-token',
            REQUIRE_AUTH: '',
            CORS_ORIGINS: '*'
        },
        stdio: ['ignore', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })

    const baseUrl = `http://127.0.0.1:${port}/serverXR`

    const stop = async () => {
        if (child.exitCode === null) {
            child.kill('SIGTERM')
            const exited = await Promise.race([
                new Promise(resolve => child.once('exit', resolve)),
                wait(3000).then(() => false)
            ])
            if (exited === false && child.exitCode === null) {
                child.kill('SIGKILL')
                await new Promise(resolve => child.once('exit', resolve))
            }
        }
        await rm(sandboxCwd, { recursive: true, force: true })
        await rm(sandboxDataRoot, { recursive: true, force: true })
    }

    await waitForHealth({
        url: `${baseUrl}/api/health`,
        child,
        getLogs: () => `STDOUT:\n${stdout}\nSTDERR:\n${stderr}`
    })

    const handle = { baseUrl, dataRoot: sandboxDataRoot, stop }
    activeServers.push(handle)
    return handle
}

afterEach(async () => {
    await Promise.all(activeServers.splice(0).map(server => server.stop()))
})

describe('project contracts', () => {
    it('creates a project inside a space and updates its document via ops', async () => {
        const server = await startServer()

        const createResponse = await fetch(`${server.baseUrl}/api/spaces/main/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'Studio Contracts Project', slug: 'studio-contracts-project', source: 'studio-v3' })
        })
        expect(createResponse.status).toBe(201)
        const created = await createResponse.json()
        expect(created.project.id).toBe('studio-contracts-project')
        expect(created.project.source).toBe('studio-v3')

        const submitResponse = await fetch(`${server.baseUrl}/api/projects/studio-contracts-project/ops`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                baseVersion: 0,
                ops: [{
                    type: 'createEntity',
                    payload: {
                        entity: {
                            id: 'entity-1',
                            type: 'box',
                            name: 'Shared Box'
                        }
                    }
                }]
            })
        })
        expect(submitResponse.status).toBe(200)
        const submitted = await submitResponse.json()
        expect(submitted.newVersion).toBe(1)

        const documentResponse = await fetch(`${server.baseUrl}/api/projects/studio-contracts-project/document`)
        expect(documentResponse.status).toBe(200)
        const documentPayload = await documentResponse.json()
        expect(documentPayload.document.entities).toEqual([
            expect.objectContaining({ id: 'entity-1', name: 'Shared Box' })
        ])
        expect(documentPayload.document.projectMeta.source).toBe('studio-v3')

        const opsResponse = await fetch(`${server.baseUrl}/api/projects/studio-contracts-project/ops?since=0`)
        expect(opsResponse.status).toBe(200)
        const opsPayload = await opsResponse.json()
        expect(opsPayload.ops).toHaveLength(1)
        expect(opsPayload.latestVersion).toBe(1)
    })

    it('rejects stale project ops with 409 and does not mutate the document', async () => {
        const server = await startServer()

        const createResponse = await fetch(`${server.baseUrl}/api/spaces/main/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'Conflict Project', slug: 'conflict-project', source: 'studio-v3' })
        })
        expect(createResponse.status).toBe(201)

        const firstWrite = await fetch(`${server.baseUrl}/api/projects/conflict-project/ops`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                baseVersion: 0,
                ops: [{
                    type: 'createEntity',
                    payload: {
                        entity: {
                            id: 'entity-1',
                            type: 'box',
                            name: 'First Entity'
                        }
                    }
                }]
            })
        })
        expect(firstWrite.status).toBe(200)

        const staleWrite = await fetch(`${server.baseUrl}/api/projects/conflict-project/ops`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                baseVersion: 0,
                ops: [{
                    type: 'createEntity',
                    payload: {
                        entity: {
                            id: 'entity-2',
                            type: 'box',
                            name: 'Stale Entity'
                        }
                    }
                }]
            })
        })
        expect(staleWrite.status).toBe(409)
        await expect(staleWrite.json()).resolves.toMatchObject({
            latestVersion: 1,
            pendingOps: [
                expect.objectContaining({ version: 1, type: 'createEntity' })
            ]
        })

        const documentResponse = await fetch(`${server.baseUrl}/api/projects/conflict-project/document`)
        expect(documentResponse.status).toBe(200)
        const documentPayload = await documentResponse.json()
        expect(documentPayload.version).toBe(1)
        expect(documentPayload.document.entities).toEqual([
            expect.objectContaining({ id: 'entity-1', name: 'First Entity' })
        ])
    })

    // Regression test for a real lost-update race (docs/ai/known-fixes.md,
    // 2026-07-16 audit): two requests at the same baseVersion, fired truly
    // concurrently (not sequentially like the test above), used to both pass
    // the conflict check and both write — one silently clobbering the
    // other's op while both callers got 200. The fix serializes the
    // check-then-write per project (serverXR/src/asyncLock.js); this test
    // asserts exactly one of the two now wins with a 200 and the other gets a
    // real 409, and the surviving entity set matches whichever one actually won.
    it('serializes two truly concurrent ops requests at the same baseVersion — exactly one wins, the other gets 409', async () => {
        const server = await startServer()

        const createResponse = await fetch(`${server.baseUrl}/api/spaces/main/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'Race Project', slug: 'race-project', source: 'studio-v3' })
        })
        expect(createResponse.status).toBe(201)

        const makeRequest = (entityId) => fetch(`${server.baseUrl}/api/projects/race-project/ops`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                baseVersion: 0,
                ops: [{
                    type: 'createEntity',
                    payload: { entity: { id: entityId, type: 'box', name: entityId } }
                }]
            })
        })

        const [responseA, responseB] = await Promise.all([
            makeRequest('entity-a'),
            makeRequest('entity-b')
        ])
        const statuses = [responseA.status, responseB.status].sort()
        expect(statuses).toEqual([200, 409])

        const winner = responseA.status === 200 ? responseA : responseB
        const winnerBody = await winner.json()
        expect(winnerBody.newVersion).toBe(1)

        // The document must reflect exactly the winner's entity — not both
        // (which would mean the loser's write silently landed too, the
        // exact corruption this test guards against) and not neither.
        const documentResponse = await fetch(`${server.baseUrl}/api/projects/race-project/document`)
        const documentPayload = await documentResponse.json()
        expect(documentPayload.version).toBe(1)
        expect(documentPayload.document.entities).toHaveLength(1)

        // The op log must have exactly one version-1 row (the DB-level
        // UNIQUE index on (project_id, version) is the last line of defense
        // if the lock were ever bypassed) — no duplicate-version rows.
        const opsResponse = await fetch(`${server.baseUrl}/api/projects/race-project/ops`)
        const opsPayload = await opsResponse.json()
        expect(opsPayload.ops.filter(op => op.version === 1)).toHaveLength(1)
    })

    it('uploads and serves project assets from the hybrid project container', async () => {
        const server = await startServer()

        const createResponse = await fetch(`${server.baseUrl}/api/spaces/main/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'Asset Project', slug: 'asset-project' })
        })
        expect(createResponse.status).toBe(201)

        const formData = new FormData()
        formData.append('asset', new Blob(['beta-asset'], { type: 'text/plain' }), 'asset.txt')
        const uploadResponse = await fetch(`${server.baseUrl}/api/projects/asset-project/assets`, {
            method: 'POST',
            body: formData
        })
        expect(uploadResponse.status).toBe(200)
        const uploaded = await uploadResponse.json()
        expect(uploaded.asset.url).toMatch(/\/api\/projects\/asset-project\/assets\//)

        const assetResponse = await fetch(new URL(uploaded.asset.url, server.baseUrl))
        expect(assetResponse.status).toBe(200)
        expect(await assetResponse.text()).toBe('beta-asset')

        const deleteResponse = await fetch(new URL(uploaded.asset.url, server.baseUrl), { method: 'DELETE' })
        expect(deleteResponse.status).toBe(200)
        expect((await deleteResponse.json()).ok).toBe(true)

        const goneResponse = await fetch(new URL(uploaded.asset.url, server.baseUrl))
        expect(goneResponse.status).toBe(404)

        const repeatDelete = await fetch(new URL(uploaded.asset.url, server.baseUrl), { method: 'DELETE' })
        expect(repeatDelete.status).toBe(404)
    })

    it('content-addresses project assets: verifies supplied sha256 ids and exposes a meta check', async () => {
        const server = await startServer()

        await fetch(`${server.baseUrl}/api/spaces/main/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'CAS Project', slug: 'cas-project' })
        })

        const bytes = 'content-addressed-bytes'
        const { createHash } = await import('node:crypto')
        const expectedId = createHash('sha256').update(bytes).digest('hex')

        // no assetId supplied → server assigns the content hash
        const formData = new FormData()
        formData.append('asset', new Blob([bytes], { type: 'text/plain' }), 'cas.txt')
        const uploadResponse = await fetch(`${server.baseUrl}/api/projects/cas-project/assets`, {
            method: 'POST',
            body: formData
        })
        expect(uploadResponse.status).toBe(200)
        const uploaded = await uploadResponse.json()
        expect(uploaded.asset.id).toBe(expectedId)

        // meta check: 200 for existing content, 404 for unknown content
        const metaResponse = await fetch(`${server.baseUrl}/api/projects/cas-project/assets/${expectedId}/meta`)
        expect(metaResponse.status).toBe(200)
        const meta = await metaResponse.json()
        expect(meta.asset).toMatchObject({ id: expectedId })
        expect(meta.asset.url).toMatch(new RegExp(`/assets/${expectedId}$`))

        const missingId = expectedId.replace(/^./, expectedId[0] === '0' ? '1' : '0')
        const missingMeta = await fetch(`${server.baseUrl}/api/projects/cas-project/assets/${missingId}/meta`)
        expect(missingMeta.status).toBe(404)

        // supplied sha256 id that does not match the bytes → rejected, asset untouched
        const forged = new FormData()
        forged.append('assetId', expectedId)
        forged.append('asset', new Blob(['tampered-bytes'], { type: 'text/plain' }), 'cas.txt')
        const forgedResponse = await fetch(`${server.baseUrl}/api/projects/cas-project/assets`, {
            method: 'POST',
            body: forged
        })
        expect(forgedResponse.status).toBe(400)
        await expect(forgedResponse.json()).resolves.toMatchObject({
            error: 'Asset id does not match file content.'
        })
        const survivor = await fetch(new URL(uploaded.asset.url, server.baseUrl))
        expect(await survivor.text()).toBe(bytes)

        // supplied sha256 id that matches → accepted
        const honest = new FormData()
        honest.append('assetId', expectedId.toUpperCase())
        honest.append('asset', new Blob([bytes], { type: 'text/plain' }), 'cas.txt')
        const honestResponse = await fetch(`${server.baseUrl}/api/projects/cas-project/assets`, {
            method: 'POST',
            body: honest
        })
        expect(honestResponse.status).toBe(200)
        expect((await honestResponse.json()).asset.id).toBe(expectedId)
    })

    // Regression test for audit finding #11: a supplied assetId that ISN'T
    // sha256-shaped (the legacy uuid-style migration path) had no integrity
    // check at all — any writer could silently overwrite an existing legacy
    // asset's bytes under the same id, poisoning whatever already referenced
    // it. Fixed by requiring a content match for any *existing* id; a
    // brand-new legacy id is still accepted as-is (the migration case this
    // path exists for).
    it('protects legacy (non-sha256) asset ids from being silently overwritten with different content', async () => {
        const server = await startServer()

        await fetch(`${server.baseUrl}/api/spaces/main/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'Legacy Asset Project', slug: 'legacy-asset-project' })
        })

        const legacyId = '11111111-2222-4333-8444-555555555555'

        const first = new FormData()
        first.append('assetId', legacyId)
        first.append('asset', new Blob(['original-legacy-bytes'], { type: 'text/plain' }), 'legacy.txt')
        const firstResponse = await fetch(`${server.baseUrl}/api/projects/legacy-asset-project/assets`, {
            method: 'POST',
            body: first
        })
        expect(firstResponse.status).toBe(200)
        const firstAsset = await firstResponse.json()
        expect(firstAsset.asset.id).toBe(legacyId)

        // A second upload under the SAME legacy id with DIFFERENT bytes must
        // be rejected — this is the exact overwrite/poisoning this fix closes.
        const poison = new FormData()
        poison.append('assetId', legacyId)
        poison.append('asset', new Blob(['attacker-controlled-bytes'], { type: 'text/plain' }), 'legacy.txt')
        const poisonResponse = await fetch(`${server.baseUrl}/api/projects/legacy-asset-project/assets`, {
            method: 'POST',
            body: poison
        })
        expect(poisonResponse.status).toBe(409)

        const survivor = await fetch(new URL(firstAsset.asset.url, server.baseUrl))
        expect(await survivor.text()).toBe('original-legacy-bytes')

        // The SAME bytes re-uploaded under the same legacy id is a harmless
        // no-op, not an error (re-imports of the same export must not fail).
        const identical = new FormData()
        identical.append('assetId', legacyId)
        identical.append('asset', new Blob(['original-legacy-bytes'], { type: 'text/plain' }), 'legacy.txt')
        const identicalResponse = await fetch(`${server.baseUrl}/api/projects/legacy-asset-project/assets`, {
            method: 'POST',
            body: identical
        })
        expect(identicalResponse.status).toBe(200)
    })

    it('stores identical bytes once per space (blob store) with reference-safe deletes and GC', async () => {
        const server = await startServer()
        const { createHash } = await import('node:crypto')
        const { readdir, writeFile: writeFsFile, mkdir } = await import('node:fs/promises')
        const { execFile } = await import('node:child_process')
        const { promisify } = await import('node:util')

        const bytes = 'shared-space-bytes'
        const hash = createHash('sha256').update(bytes).digest('hex')
        const spaceDir = path.join(server.dataRoot, 'spaces', 'main')

        for (const slug of ['cas-a', 'cas-b']) {
            await fetch(`${server.baseUrl}/api/spaces/main/projects`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: slug, slug })
            })
            const formData = new FormData()
            formData.append('asset', new Blob([bytes], { type: 'text/plain' }), 'shared.txt')
            const upload = await fetch(`${server.baseUrl}/api/projects/${slug}/assets`, {
                method: 'POST',
                body: formData
            })
            expect(upload.status).toBe(200)
            expect((await upload.json()).asset.id).toBe(hash)
        }

        // bytes live once in the space blob store; projects hold only meta refs
        await expect(readdir(path.join(spaceDir, 'blobs'))).resolves.toEqual([hash])
        for (const slug of ['cas-a', 'cas-b']) {
            const entries = await readdir(path.join(spaceDir, 'projects', slug, 'assets'))
            expect(entries).toEqual([`${hash}.json`])
            const served = await fetch(`${server.baseUrl}/api/projects/${slug}/assets/${hash}`)
            expect(await served.text()).toBe(bytes)
        }

        // deleting in one project must not break the other
        expect((await fetch(`${server.baseUrl}/api/projects/cas-a/assets/${hash}`, { method: 'DELETE' })).status).toBe(200)
        expect((await fetch(`${server.baseUrl}/api/projects/cas-a/assets/${hash}`)).status).toBe(404)
        expect((await fetch(`${server.baseUrl}/api/projects/cas-a/assets/${hash}/meta`)).status).toBe(404)
        const survivor = await fetch(`${server.baseUrl}/api/projects/cas-b/assets/${hash}`)
        expect(survivor.status).toBe(200)
        expect(await survivor.text()).toBe(bytes)
        expect((await fetch(`${server.baseUrl}/api/projects/cas-b/assets/${hash}/meta`)).status).toBe(200)

        // legacy project-local binaries (pre-blob layout) still serve and delete
        const legacyBytes = 'legacy-local-bytes'
        const legacyHash = createHash('sha256').update(legacyBytes).digest('hex')
        const legacyAssetsDir = path.join(spaceDir, 'projects', 'cas-b', 'assets')
        await mkdir(legacyAssetsDir, { recursive: true })
        await writeFsFile(path.join(legacyAssetsDir, legacyHash), legacyBytes)
        const legacyServed = await fetch(`${server.baseUrl}/api/projects/cas-b/assets/${legacyHash}`)
        expect(legacyServed.status).toBe(200)
        expect(await legacyServed.text()).toBe(legacyBytes)
        expect((await fetch(`${server.baseUrl}/api/projects/cas-b/assets/${legacyHash}`, { method: 'DELETE' })).status).toBe(200)

        // GC: blob survives while cas-b references it, is removed once orphaned
        const gcScript = path.join(SERVER_ROOT, '..', 'scripts', 'gc-space-blobs.mjs')
        const runGc = promisify(execFile)
        const spacesDir = path.join(server.dataRoot, 'spaces')
        await runGc('node', [gcScript, '--spaces-dir', spacesDir, '--apply'])
        await expect(readdir(path.join(spaceDir, 'blobs'))).resolves.toEqual([hash])

        expect((await fetch(`${server.baseUrl}/api/projects/cas-b/assets/${hash}`, { method: 'DELETE' })).status).toBe(200)
        await runGc('node', [gcScript, '--spaces-dir', spacesDir, '--apply'])
        await expect(readdir(path.join(spaceDir, 'blobs'))).resolves.toEqual([])
    })

    it('recovers a corrupted project document by trimming trailing garbage', async () => {
        const server = await startServer()

        await fetch(`${server.baseUrl}/api/spaces/main/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'Recovery Project', slug: 'recovery-project' })
        })

        const documentPath = path.join(
            server.dataRoot,
            'spaces',
            'main',
            'projects',
            'recovery-project',
            'document.json'
        )
        const original = await readFile(documentPath, 'utf8')
        await writeFile(documentPath, `${original}}`)

        const documentResponse = await fetch(`${server.baseUrl}/api/projects/recovery-project/document`)
        expect(documentResponse.status).toBe(200)
        const payload = await documentResponse.json()
        expect(payload.document.projectMeta.id).toBe('recovery-project')

        const repaired = await readFile(documentPath, 'utf8')
        expect(() => JSON.parse(repaired)).not.toThrow()
    })

    // Regression test for audit finding #13: the global error handler
    // forwarded err.message unconditionally for ANY uncaught exception,
    // including raw internal errors (e.g. a JSON parse failure, or an fs
    // error that embeds an absolute server path) that never set an explicit
    // err.status. Unrecoverable JSON (not just truncated — real garbage with
    // no parseable brace/bracket prefix at all) makes readJson re-throw the
    // raw SyntaxError uncaught; this proves the client now gets a generic
    // message instead of that internal detail.
    it('does not leak an internal error message to the client when a document is unrecoverably corrupted', async () => {
        const server = await startServer()

        await fetch(`${server.baseUrl}/api/spaces/main/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'Unrecoverable Project', slug: 'unrecoverable-project' })
        })

        const documentPath = path.join(
            server.dataRoot,
            'spaces',
            'main',
            'projects',
            'unrecoverable-project',
            'document.json'
        )
        // No '{'/'}'/'['/']' anywhere — tryRecoverJson's truncate-to-last-
        // brace strategy has nothing to recover, so readJson re-throws.
        await writeFile(documentPath, 'not json at all, no braces or brackets here')

        const documentResponse = await fetch(`${server.baseUrl}/api/projects/unrecoverable-project/document`)
        expect(documentResponse.status).toBe(500)
        const payload = await documentResponse.json()
        expect(payload.error).not.toMatch(/json|token|unexpected|position/i)
        expect(payload.error).not.toContain(documentPath)
        expect(payload.error).not.toContain(server.dataRoot)
    })

    it('repairs non-main project documents whose embedded space drifts back to main', async () => {
        const server = await startServer()

        const createSpaceResponse = await fetch(`${server.baseUrl}/api/spaces`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label: 'Gallery', slug: 'gallery' })
        })
        expect(createSpaceResponse.status).toBe(201)

        const createProjectResponse = await fetch(`${server.baseUrl}/api/spaces/gallery/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'Gallery Project', slug: 'gallery-project' })
        })
        expect(createProjectResponse.status).toBe(201)

        const documentPath = path.join(
            server.dataRoot,
            'spaces',
            'gallery',
            'projects',
            'gallery-project',
            'document.json'
        )
        const original = JSON.parse(await readFile(documentPath, 'utf8'))
        original.projectMeta = {
            ...original.projectMeta,
            spaceId: 'main'
        }
        await writeFile(documentPath, JSON.stringify(original, null, 2))

        const documentResponse = await fetch(`${server.baseUrl}/api/projects/gallery-project/document`)
        expect(documentResponse.status).toBe(200)
        const payload = await documentResponse.json()
        expect(payload.document.projectMeta.id).toBe('gallery-project')
        expect(payload.document.projectMeta.spaceId).toBe('gallery')

        const repaired = JSON.parse(await readFile(documentPath, 'utf8'))
        expect(repaired.projectMeta.spaceId).toBe('gallery')
    })

    // Regression test for audit finding #16: a client retry (e.g. the
    // response to a successful commit never arrived) resent the same batch
    // by opId, and the server had no way to recognize it — the retry got
    // treated as brand-new ops, reapplied and given a fresh version number,
    // inflating the op-log with duplicate history entries for one logical
    // edit. Simulates the retry directly: submit at baseVersion N, then
    // resubmit the identical (same-opId) ops at baseVersion N+1 (as if the
    // client had caught up via the normal conflict/catch-up path first).
    it('does not reapply or re-version an ops batch whose opId was already committed', async () => {
        const server = await startServer()

        await fetch(`${server.baseUrl}/api/spaces/main/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'Idempotency Project', slug: 'idempotency-project' })
        })

        const retriedOp = {
            opId: 'retry-op-fixed-id',
            type: 'createEntity',
            payload: { entity: { id: 'entity-retry', type: 'box', name: 'Retry Entity' } }
        }

        const first = await fetch(`${server.baseUrl}/api/projects/idempotency-project/ops`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ baseVersion: 0, ops: [retriedOp] })
        })
        expect(first.status).toBe(200)
        const firstBody = await first.json()
        expect(firstBody.newVersion).toBe(1)

        // Resend the SAME opId, at the now-current baseVersion — exactly
        // what a client does after a 409 catch-up reveals its own retried op
        // already landed.
        const retry = await fetch(`${server.baseUrl}/api/projects/idempotency-project/ops`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ baseVersion: 1, ops: [retriedOp] })
        })
        expect(retry.status).toBe(200)
        const retryBody = await retry.json()
        // No new version, no new ops — this was recognized as already done.
        expect(retryBody.newVersion).toBe(1)
        expect(retryBody.ops).toEqual([])

        const documentResponse = await fetch(`${server.baseUrl}/api/projects/idempotency-project/document`)
        const documentPayload = await documentResponse.json()
        expect(documentPayload.version).toBe(1)
        expect(documentPayload.document.entities).toHaveLength(1)

        const opsResponse = await fetch(`${server.baseUrl}/api/projects/idempotency-project/ops`)
        const opsPayload = await opsResponse.json()
        expect(opsPayload.ops.filter((op) => op.opId === 'retry-op-fixed-id')).toHaveLength(1)
    })
})
