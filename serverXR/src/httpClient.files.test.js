// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createHash } from 'node:crypto'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import http from 'node:http'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { httpDownloadToFile, httpUploadFile } = require('./httpClient')

// The two calls that move a file between the wire and the disk (the follow's
// asset chase). Against a real node server: what is under test is the stream.
describe('httpClient files', () => {
    const bytes = Buffer.from(Array.from({ length: 200_000 }, (_, i) => (i * 13 + 5) % 256))
    let server = null
    let base = ''
    let dir = ''
    let received = null

    beforeAll(async () => {
        dir = await mkdtemp(path.join(os.tmpdir(), 'dii-httpclient-'))
        server = http.createServer((req, res) => {
            if (req.url === '/file') { res.writeHead(200, { 'Content-Length': bytes.length }); res.end(bytes); return }
            if (req.url === '/chunked') { res.writeHead(200); res.write(bytes.subarray(0, 1000)); res.end(bytes.subarray(1000)); return }
            if (req.url === '/cut') { res.writeHead(200, { 'Content-Length': bytes.length }); res.write(bytes.subarray(0, 1000)); setTimeout(() => res.destroy(), 20); return }
            if (req.url === '/missing') { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{"error":"no"}'); return }
            if (req.url.startsWith('/put')) {
                const chunks = []
                req.on('data', c => chunks.push(c))
                req.on('end', () => {
                    received = { method: req.method, auth: req.headers.authorization, body: Buffer.concat(chunks) }
                    res.writeHead(200, { 'Content-Type': 'application/json' })
                    res.end('{"ok":true}')
                })
                return
            }
            res.writeHead(500); res.end()
        })
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
        base = `http://127.0.0.1:${server.address().port}`
    })

    afterAll(async () => {
        await new Promise(resolve => server.close(resolve))
        await rm(dir, { recursive: true, force: true })
    })

    const gone = (file) => access(file).then(() => false, () => true)

    it('downloads a body to a file and reports the hash of exactly what it wrote', async () => {
        for (const route of ['/file', '/chunked']) {
            const destPath = path.join(dir, `got${route.slice(1)}`)
            const got = await httpDownloadToFile(`${base}${route}`, { destPath })
            expect(got).toMatchObject({ ok: true, status: 200, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
            expect((await readFile(destPath)).equals(bytes)).toBe(true)
        }
    })

    it('writes no file for an answer that is not the file', async () => {
        const destPath = path.join(dir, 'missing')
        const got = await httpDownloadToFile(`${base}/missing`, { destPath })
        expect(got).toMatchObject({ ok: false, status: 404, sha256: null })
        expect(await gone(destPath)).toBe(true)
    })

    it('refuses a body over the limit and leaves nothing behind, declared or not', async () => {
        for (const route of ['/file', '/chunked']) {
            const destPath = path.join(dir, `big${route.slice(1)}`)
            await expect(httpDownloadToFile(`${base}${route}`, { destPath, maxBytes: 5000 })).rejects.toMatchObject({ code: 'TOO_LARGE' })
            expect(await gone(destPath)).toBe(true)
        }
    })

    it('rejects a connection lost mid-file rather than handing back half of it', async () => {
        const destPath = path.join(dir, 'cut')
        await expect(httpDownloadToFile(`${base}/cut`, { destPath })).rejects.toThrow()
        expect(await gone(destPath)).toBe(true)
    })

    it('can be abandoned', async () => {
        const controller = new AbortController()
        controller.abort()
        await expect(httpDownloadToFile(`${base}/file`, { destPath: path.join(dir, 'aborted'), signal: controller.signal })).rejects.toThrow(/aborted/)
    })

    it('sends a file as the request body, byte for byte', async () => {
        const filePath = path.join(dir, 'to-send')
        await writeFile(filePath, bytes)
        const answer = await httpUploadFile(`${base}/put?name=a`, { filePath, headers: { Authorization: 'Bearer k', 'Content-Length': bytes.length } })
        expect(answer.ok).toBe(true)
        expect(answer.json()).toEqual({ ok: true })
        expect(received.method).toBe('PUT')
        expect(received.auth).toBe('Bearer k')
        expect(received.body.equals(bytes)).toBe(true)
    })

    it('rejects when the file to send is not there', async () => {
        await expect(httpUploadFile(`${base}/put`, { filePath: path.join(dir, 'nope') })).rejects.toThrow()
    })
})
