// @vitest-environment node

import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import { PassThrough } from 'node:stream'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createSpaceStore } = require('./spaceStore.js')
const { initDb, closeDb } = require('./db.js')

let store
let tmpDir
let assetsDir

// A fake Express response: setHeader/status/end stubs on top of a real
// writable stream, so `stream.pipe(res)` in serveAsset works unmodified.
function makeFakeRes() {
    const stream = new PassThrough()
    const chunks = []
    stream.on('data', (chunk) => chunks.push(chunk))
    const res = stream
    res.headers = {}
    res.setHeader = (key, value) => { res.headers[key] = value }
    res.status = () => res
    const finished = new Promise((resolve) => stream.on('end', () => resolve(Buffer.concat(chunks))))
    return { res, finished }
}

beforeEach(async () => {
    initDb(':memory:')
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacestore-thumb-'))
    store = createSpaceStore({ spacesDir: tmpDir, blankScene: { objects: [] } })
    await store.upsertSpaceMeta('gallery', { label: 'Gallery' })
    assetsDir = store.getSpacePaths('gallery').assetsDir
    await fsp.mkdir(assetsDir, { recursive: true })
})

afterEach(() => {
    closeDb()
    fs.rmSync(tmpDir, { recursive: true, force: true })
})

async function writeImageAsset(assetId, { width = 800, height = 600 } = {}) {
    const filePath = path.join(assetsDir, assetId)
    await sharp({
        create: { width, height, channels: 3, background: { r: 100, g: 150, b: 200 } }
    }).png().toFile(filePath)
    await fsp.writeFile(path.join(assetsDir, `${assetId}.json`), JSON.stringify({ mimeType: 'image/png' }))
    return filePath
}

describe('spaceStore thumbnailing', () => {
    it('generates and caches a resized webp variant when width is requested', async () => {
        await writeImageAsset('img-1')
        const { res, finished } = makeFakeRes()
        await store.serveAsset('gallery', 'img-1', res, { width: 200 })
        const body = await finished
        expect(res.headers['Content-Type']).toBe('image/webp')
        expect(body.length).toBeGreaterThan(0)

        const cached = await fsp.access(path.join(assetsDir, 'img-1.thumb-200.webp')).then(() => true, () => false)
        expect(cached).toBe(true)

        const meta = await sharp(path.join(assetsDir, 'img-1.thumb-200.webp')).metadata()
        expect(meta.width).toBe(200)
    })

    it('reuses the cached thumbnail on a second request instead of regenerating', async () => {
        await writeImageAsset('img-2')
        const first = makeFakeRes()
        await store.serveAsset('gallery', 'img-2', first.res, { width: 150 })
        await first.finished
        const thumbPath = path.join(assetsDir, 'img-2.thumb-150.webp')
        const statBefore = await fsp.stat(thumbPath)

        await new Promise((r) => setTimeout(r, 5))
        const second = makeFakeRes()
        await store.serveAsset('gallery', 'img-2', second.res, { width: 150 })
        await second.finished
        const statAfter = await fsp.stat(thumbPath)
        expect(statAfter.mtimeMs).toBe(statBefore.mtimeMs)
    })

    it('clamps a requested width above the configured maximum', async () => {
        await writeImageAsset('img-3', { width: 2000, height: 1500 })
        const { res, finished } = makeFakeRes()
        await store.serveAsset('gallery', 'img-3', res, { width: 5000 })
        await finished
        const files = await fsp.readdir(assetsDir)
        const thumb = files.find((name) => name.startsWith('img-3.thumb-'))
        expect(thumb).toBe('img-3.thumb-640.webp')
    })

    it('serves the original file unchanged when no width is requested', async () => {
        const filePath = await writeImageAsset('img-4')
        const { res, finished } = makeFakeRes()
        await store.serveAsset('gallery', 'img-4', res, {})
        const body = await finished
        expect(res.headers['Content-Type']).toBe('image/png')
        expect(body.equals(await fsp.readFile(filePath))).toBe(true)
    })

    it('ignores the width param for a non-image asset', async () => {
        const filePath = path.join(assetsDir, 'doc-1')
        await fsp.writeFile(filePath, 'not an image')
        await fsp.writeFile(path.join(assetsDir, 'doc-1.json'), JSON.stringify({ mimeType: 'application/pdf' }))
        const { res, finished } = makeFakeRes()
        await store.serveAsset('gallery', 'doc-1', res, { width: 200 })
        const body = await finished
        expect(res.headers['Content-Type']).toBe('application/pdf')
        expect(body.toString()).toBe('not an image')
    })

    // Regression test for audit finding #14: two concurrent requests for the
    // same (assetId, width) both saw the thumbnail missing and both called
    // sharp(...).toFile(thumbPath) directly — writing to the same path
    // concurrently isn't atomic, so a third reader could get served a
    // truncated/corrupt file. The fix writes to a unique temp file first and
    // renames into place; this proves N concurrent requests always resolve
    // to one complete, valid webp file, never a corrupt one.
    it('produces a valid, complete thumbnail under real concurrent requests for the same width', async () => {
        await writeImageAsset('img-race', { width: 1200, height: 900 })

        const requests = Array.from({ length: 8 }, () => makeFakeRes())
        const results = await Promise.all(
            requests.map(({ res, finished }) =>
                store.serveAsset('gallery', 'img-race', res, { width: 250 }).then(() => finished)
            )
        )

        for (const body of results) {
            expect(body.length).toBeGreaterThan(0)
            // eslint-disable-next-line no-await-in-loop
            const meta = await sharp(body).metadata()
            expect(meta.width).toBe(250)
            expect(meta.format).toBe('webp')
        }

        const thumbPath = path.join(assetsDir, 'img-race.thumb-250.webp')
        const onDisk = await sharp(thumbPath).metadata()
        expect(onDisk.width).toBe(250)
        expect(onDisk.format).toBe('webp')

        // No leftover temp files from the losing writers.
        const files = await fsp.readdir(assetsDir)
        expect(files.some((name) => name.includes('.tmp'))).toBe(false)
    })

    it('removeAssetThumbnails deletes every cached variant for an asset', async () => {
        await writeImageAsset('img-5')
        const a = makeFakeRes()
        await store.serveAsset('gallery', 'img-5', a.res, { width: 100 })
        await a.finished
        const b = makeFakeRes()
        await store.serveAsset('gallery', 'img-5', b.res, { width: 300 })
        await b.finished

        let files = await fsp.readdir(assetsDir)
        expect(files.filter((n) => n.startsWith('img-5.thumb-'))).toHaveLength(2)

        await store.removeAssetThumbnails(assetsDir, 'img-5')
        files = await fsp.readdir(assetsDir)
        expect(files.filter((n) => n.startsWith('img-5.thumb-'))).toHaveLength(0)
    })
})
