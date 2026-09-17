// @vitest-environment node

import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createSpaceStore, parseByteRange } = require('./spaceStore.js')
const { initDb, closeDb } = require('./db.js')

let store
let tmpDir
let assetsDir

const CONTENT = Buffer.from('ABCDEFGHIJ') // 10 bytes, offsets 0-9

// A fake Express response: setHeader/status/end/write stubs on top of a real
// duplex stream, same shape as spaceStore.thumbnail.test.js's makeFakeRes —
// `stream.pipe(res)` in serveFile works against it unmodified. Extended here
// to also track statusCode and headersSent, which the Range/416/HEAD paths
// all set explicitly and the thumbnail tests never needed to check.
function makeFakeRes() {
    const stream = new PassThrough()
    const chunks = []
    stream.on('data', (chunk) => chunks.push(chunk))
    const res = stream
    res.headers = {}
    res.statusCode = 200
    res.headersSent = false
    res.setHeader = (key, value) => { res.headers[key] = value; res.headersSent = true }
    res.status = (code) => { res.statusCode = code; return res }
    const finished = new Promise((resolve) => stream.on('end', () => resolve(Buffer.concat(chunks))))
    return { res, finished }
}

beforeEach(async () => {
    initDb(':memory:')
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacestore-range-'))
    store = createSpaceStore({ spacesDir: tmpDir, blankScene: { objects: [] } })
    await store.upsertSpaceMeta('gallery', { label: 'Gallery' })
    assetsDir = store.getSpacePaths('gallery').assetsDir
    await fsp.mkdir(assetsDir, { recursive: true })
    await fsp.writeFile(path.join(assetsDir, 'clip-1'), CONTENT)
    await fsp.writeFile(path.join(assetsDir, 'clip-1.json'), JSON.stringify({ mimeType: 'video/mp4' }))
})

afterEach(() => {
    closeDb()
    fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('parseByteRange', () => {
    it('parses a start-end range', () => {
        expect(parseByteRange('bytes=2-5', 10)).toEqual({ start: 2, end: 5 })
    })

    it('parses an open-ended start- range', () => {
        expect(parseByteRange('bytes=5-', 10)).toEqual({ start: 5, end: 9 })
    })

    it('parses a suffix -N range', () => {
        expect(parseByteRange('bytes=-3', 10)).toEqual({ start: 7, end: 9 })
    })

    it('reports unsatisfiable when the start is past the end of the file', () => {
        expect(parseByteRange('bytes=100-200', 10)).toBe('unsatisfiable')
    })

    it('ignores multi-range requests (served as a full 200 instead)', () => {
        expect(parseByteRange('bytes=0-1,3-4', 10)).toBe(null)
    })

    it('ignores an absent or malformed header', () => {
        expect(parseByteRange(undefined, 10)).toBe(null)
        expect(parseByteRange('bytes=', 10)).toBe(null)
        expect(parseByteRange('items=0-1', 10)).toBe(null)
    })
})

describe('spaceStore Range support for asset streaming', () => {
    it('serves the full file with a 200 and Accept-Ranges/Content-Length when no Range header is sent', async () => {
        const { res, finished } = makeFakeRes()
        await store.serveAsset('gallery', 'clip-1', res, { req: { method: 'GET', headers: {} } })
        const body = await finished
        expect(res.statusCode).toBe(200)
        expect(res.headers['Accept-Ranges']).toBe('bytes')
        expect(res.headers['Content-Length']).toBe(10)
        expect(body.toString()).toBe('ABCDEFGHIJ')
    })

    it('serves a 206 for a start-end range', async () => {
        const { res, finished } = makeFakeRes()
        await store.serveAsset('gallery', 'clip-1', res, { req: { method: 'GET', headers: { range: 'bytes=2-5' } } })
        const body = await finished
        expect(res.statusCode).toBe(206)
        expect(res.headers['Content-Range']).toBe('bytes 2-5/10')
        expect(res.headers['Content-Length']).toBe(4)
        expect(body.toString()).toBe('CDEF')
    })

    it('serves a 206 for an open-ended start- range', async () => {
        const { res, finished } = makeFakeRes()
        await store.serveAsset('gallery', 'clip-1', res, { req: { method: 'GET', headers: { range: 'bytes=5-' } } })
        const body = await finished
        expect(res.statusCode).toBe(206)
        expect(res.headers['Content-Range']).toBe('bytes 5-9/10')
        expect(res.headers['Content-Length']).toBe(5)
        expect(body.toString()).toBe('FGHIJ')
    })

    it('serves a 206 for a suffix -N range', async () => {
        const { res, finished } = makeFakeRes()
        await store.serveAsset('gallery', 'clip-1', res, { req: { method: 'GET', headers: { range: 'bytes=-3' } } })
        const body = await finished
        expect(res.statusCode).toBe(206)
        expect(res.headers['Content-Range']).toBe('bytes 7-9/10')
        expect(res.headers['Content-Length']).toBe(3)
        expect(body.toString()).toBe('HIJ')
    })

    it('answers an unsatisfiable range with 416 and Content-Range: bytes */size, no body', async () => {
        const { res, finished } = makeFakeRes()
        await store.serveAsset('gallery', 'clip-1', res, { req: { method: 'GET', headers: { range: 'bytes=100-200' } } })
        const body = await finished
        expect(res.statusCode).toBe(416)
        expect(res.headers['Content-Range']).toBe('bytes */10')
        expect(body.length).toBe(0)
    })

    it('answers a multi-range request with the full 200 body (documented, not a 206)', async () => {
        const { res, finished } = makeFakeRes()
        await store.serveAsset('gallery', 'clip-1', res, { req: { method: 'GET', headers: { range: 'bytes=0-1,3-4' } } })
        const body = await finished
        expect(res.statusCode).toBe(200)
        expect(body.toString()).toBe('ABCDEFGHIJ')
    })

    it('answers HEAD with headers only (Content-Length, no body)', async () => {
        const { res, finished } = makeFakeRes()
        await store.serveAsset('gallery', 'clip-1', res, { req: { method: 'HEAD', headers: {} } })
        const body = await finished
        expect(res.statusCode).toBe(200)
        expect(res.headers['Content-Length']).toBe(10)
        expect(body.length).toBe(0)
    })

    it('answers HEAD + Range with 206 headers only (no body)', async () => {
        const { res, finished } = makeFakeRes()
        await store.serveAsset('gallery', 'clip-1', res, { req: { method: 'HEAD', headers: { range: 'bytes=2-5' } } })
        const body = await finished
        expect(res.statusCode).toBe(206)
        expect(res.headers['Content-Range']).toBe('bytes 2-5/10')
        expect(res.headers['Content-Length']).toBe(4)
        expect(body.length).toBe(0)
    })

    it('still works with no req at all (back-compat for callers that never pass one)', async () => {
        const { res, finished } = makeFakeRes()
        await store.serveAsset('gallery', 'clip-1', res, {})
        const body = await finished
        expect(res.statusCode).toBe(200)
        expect(body.toString()).toBe('ABCDEFGHIJ')
    })
})
