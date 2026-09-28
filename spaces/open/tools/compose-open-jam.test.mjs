// @vitest-environment node
import http from 'node:http'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

// The Open Jam's `floor` layout, after the room had been a `wall` (2026-09-28):
// the server places every batch against the room as it stood BEFORE the batch, so
// turning build zones off inside the same batch as the moves was too late — every
// photo was snapped back onto the wall and no mosaic ever appeared. The script now
// turns placement off alone first, then sends the moves on the new version.
// Run for real against a recording server: the script is a child process.

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'compose-open-jam.mjs')

const photo = (i) => ({
    id: `ph${i}`, type: 'image', name: `photo ${i}`, parentId: null,
    components: { transform: { position: [0, 1.15, -7.5], rotation: [0, 0, 0], scale: [1, 1, 1] }, media: { assetId: `asset-${i}` } }
})

let server = null
afterEach(() => new Promise((done) => (server ? server.close(done) : done())))

const serve = (placementEnabled) => new Promise((ready) => {
    const posts = []
    let version = 5
    server = http.createServer((req, res) => {
        const send = (body) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(body)) }
        if (req.method === 'GET' && req.url === '/api/projects/open-jam') return send({ project: { id: 'open-jam', documentVersion: version } })
        if (req.method === 'GET' && req.url === '/api/projects/open-jam/document') {
            return send({ document: { worldState: { placement: { enabled: placementEnabled } }, entities: [photo(0), photo(1), photo(2)] } })
        }
        if (req.method === 'POST' && req.url === '/api/projects/open-jam/ops') {
            let raw = ''
            req.on('data', (c) => { raw += c })
            req.on('end', () => { posts.push(JSON.parse(raw)); version += 1; send({ ok: true, newVersion: version }) })
            return undefined
        }
        res.statusCode = 404; return send({ error: 'not here' })
    })
    server.listen(0, '127.0.0.1', () => ready({ base: `http://127.0.0.1:${server.address().port}`, posts }))
})

const run = (base, layout) => new Promise((done, fail) => {
    execFile(process.execPath, [SCRIPT, base, 'token', layout, '--apply'], { timeout: 20000 }, (error, stdout, stderr) => (error ? fail(new Error(stderr || error.message)) : done(stdout)))
})

describe('compose-open-jam floor', () => {
    it('turns build zones off ALONE before it moves anything, then moves on the new version', async () => {
        const { base, posts } = await serve(true)
        await run(base, 'floor')

        expect(posts).toHaveLength(2)
        expect(posts[0]).toEqual({ baseVersion: 5, ops: [{ type: 'setWorldState', payload: { patch: { placement: { enabled: false } } } }] })
        expect(posts[1].baseVersion).toBe(6)
        const moves = posts[1].ops.filter((op) => op.type === 'updateComponent' && op.payload.component === 'transform')
        expect(moves.map((op) => op.payload.entityId).sort()).toEqual(['ph0', 'ph1', 'ph2'])
        // on the floor, not on a wall
        for (const op of moves) expect(op.payload.patch.position[1]).toBeLessThan(0.1)
    })

    it('sends one batch when build zones are already off', async () => {
        const { base, posts } = await serve(false)
        await run(base, 'floor')
        expect(posts).toHaveLength(1)
        expect(posts[0].baseVersion).toBe(5)
    })
})
