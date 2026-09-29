// @vitest-environment node

import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createSpaceStore } = require('./spaceStore.js')
const { initDb, closeDb } = require('./db.js')

// Security audit 2026-09-29, C1: a symlink planted under a space's assets
// (a crafted bundle did it) made the asset route serve the file it pointed
// at — the database, the env file. An asset is a regular file or it is missing.
let store
let tmpDir
let outside
let assetsDir

const fakeRes = () => {
    const res = new PassThrough()
    res.headers = {}
    res.statusCode = 200
    res.setHeader = (key, value) => { res.headers[key] = value }
    res.status = (code) => { res.statusCode = code; return res }
    return res
}

beforeEach(async () => {
    initDb(':memory:')
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacestore-symlink-'))
    outside = fs.mkdtempSync(path.join(os.tmpdir(), 'spacestore-outside-'))
    await fsp.writeFile(path.join(outside, 'secret.env'), 'SECRET=canary\n')
    store = createSpaceStore({ spacesDir: tmpDir, blankScene: { objects: [] } })
    await store.upsertSpaceMeta('gallery', { label: 'Gallery' })
    assetsDir = store.getSpacePaths('gallery').assetsDir
    await fsp.mkdir(assetsDir, { recursive: true })
    await fsp.symlink(path.join(outside, 'secret.env'), path.join(assetsDir, 'aaaaaaaa11111111'))
    await fsp.writeFile(path.join(assetsDir, 'aaaaaaaa11111111.json'), JSON.stringify({ mimeType: 'text/plain' }))
})

afterEach(() => {
    closeDb()
    fs.rmSync(tmpDir, { recursive: true, force: true })
    fs.rmSync(outside, { recursive: true, force: true })
})

describe('serveAsset never follows a symlink out of the data root', () => {
    it('answers a symlinked asset as missing (ENOENT → 404) and sends none of its bytes', async () => {
        const res = fakeRes()
        await expect(store.serveAsset('gallery', 'aaaaaaaa11111111', res, { req: { method: 'GET', headers: {} } }))
            .rejects.toMatchObject({ code: 'ENOENT' })
        expect(res.headers['Content-Type']).toBeUndefined()
    })

    it('does not thumbnail through a symlink either', async () => {
        await fsp.writeFile(path.join(assetsDir, 'aaaaaaaa11111111.json'), JSON.stringify({ mimeType: 'image/png' }))
        await expect(store.serveAsset('gallery', 'aaaaaaaa11111111', fakeRes(), { width: 64, req: { method: 'GET', headers: {} } }))
            .rejects.toMatchObject({ code: 'ENOENT' })
    })
})
