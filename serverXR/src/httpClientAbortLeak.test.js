// @vitest-environment node
//
// Leak hypothesis H1 (di-health/leak-2026-10-08): a follow keeps ONE
// AbortController for its whole life and passes its signal to every request.
// httpClient used to add an 'abort' listener per request and never remove it
// ({ once: true } only removes on abort), so the listeners — each closing over
// its request — piled up for the life of the process.
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { getEventListeners } from 'node:events'
import { createRequire } from 'node:module'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { httpRequest, httpDownloadToFile } = require('./httpClient.js')

const N = 10000
let server, base, dir
beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'abort-leak-'))
    server = http.createServer((req, res) => { res.writeHead(200); res.end('ok') })
    await new Promise((r) => server.listen(0, '127.0.0.1', r))
    base = `http://127.0.0.1:${server.address().port}/`
})
afterAll(async () => {
    await new Promise((r) => server.close(r))
    fs.rmSync(dir, { recursive: true, force: true })
})

const inBatches = async (n, size, fn) => {
    for (let i = 0; i < n; i += size) {
        await Promise.all(Array.from({ length: Math.min(size, n - i) }, (_, k) => fn(i + k)))
    }
}

describe('a shared AbortSignal does not collect a listener per finished request', () => {
    it(`httpRequest x ${N}`, async () => {
        const ac = new AbortController()
        await inBatches(N, 100, () => httpRequest(base, { signal: ac.signal }))
        const left = getEventListeners(ac.signal, 'abort').length
        console.log(`httpRequest: abort listeners after ${N} requests = ${left}`)
        expect(left).toBeLessThanOrEqual(10)
    }, 120000)

    it(`httpDownloadToFile x ${N}`, async () => {
        const ac = new AbortController()
        await inBatches(N, 100, (i) => httpDownloadToFile(base, { destPath: path.join(dir, `f${i % 100}`), signal: ac.signal }))
        const left = getEventListeners(ac.signal, 'abort').length
        console.log(`httpDownloadToFile: abort listeners after ${N} requests = ${left}`)
        expect(left).toBeLessThanOrEqual(10)
    }, 120000)

    it('aborting the shared signal still cancels an in-flight request', async () => {
        const slow = http.createServer(() => {})
        await new Promise((r) => slow.listen(0, '127.0.0.1', r))
        const ac = new AbortController()
        const p = httpRequest(`http://127.0.0.1:${slow.address().port}/`, { signal: ac.signal })
        setTimeout(() => ac.abort(), 50)
        await expect(p).rejects.toThrow(/aborted/)
        slow.closeAllConnections?.()
        await new Promise((r) => slow.close(r))
    })
})
