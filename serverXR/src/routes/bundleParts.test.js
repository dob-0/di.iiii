// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { registerBundleParts } from './bundleParts.js'

// Expiry: parts older than the TTL are removed by the sweep, younger ones stay.
let dir
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

describe('bundle parts expiry', () => {
    it('removes an upload older than the TTL and keeps a fresh one', async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'di-parts-ttl-'))
        const root = path.join(dir, 'bundle-parts')
        const old = 'a'.repeat(32)
        const fresh = 'b'.repeat(32)
        for (const id of [old, fresh]) { fs.mkdirSync(path.join(root, id), { recursive: true }); fs.writeFileSync(path.join(root, id, 'part-000001'), 'x') }
        const past = new Date(Date.now() - 25 * 3600 * 1000)
        fs.utimesSync(path.join(root, old), past, past)
        const router = { post() {}, put() {}, delete() {} }
        const { sweep } = registerBundleParts(router, {
            config: { directories: { uploadsDir: dir }, maxBundleBytes: 1 << 20, bundlePartBytes: 1024 },
            mayOpenAFile: () => true, importBundleFile: async () => {}, normalizeSpaceId: (x) => x
        })
        await sweep()
        expect(fs.existsSync(path.join(root, old))).toBe(false)
        expect(fs.existsSync(path.join(root, fresh))).toBe(true)
    })
})
