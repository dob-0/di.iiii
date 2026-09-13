// @vitest-environment node
//
// Two faults found following a space from asuz on aylmo, 2026-09-13: a follow
// written while the server ran did nothing until a restart, and an install with
// a certificate reached itself over http, where nothing answers.
import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { selfBase, startFollows, stopFollows } = require('./index.js')
const { writeFollows } = require('./followStore.js')

const quiet = { info() {}, warn() {} }
const dirs = []
afterEach(async () => {
    stopFollows()
    for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true })
})

describe('selfBase', () => {
    it('is http on a plain install and https when the server holds a certificate', () => {
        expect(selfBase(4000)).toBe('http://127.0.0.1:4000/serverXR')
        expect(selfBase(443, '/serverXR', 'local.thedi.studio')).toBe('https://127.0.0.1:443/serverXR')
    })
})

describe('startFollows', () => {
    it('picks up a new follow and drops a removed one when called again', async () => {
        const dataDir = await mkdtemp(path.join(os.tmpdir(), 'di-follows-'))
        dirs.push(dataDir)
        // Nothing listens on port 9: the followers only wait, which is all this needs.
        const entry = { remote: 'http://127.0.0.1:9/serverXR', token: null }

        await writeFollows(dataDir, { a: entry })
        expect([...startFollows({ dataDir, port: 9, log: quiet }).keys()]).toEqual(['a'])

        await writeFollows(dataDir, { b: entry })
        expect([...startFollows({ dataDir, port: 9, log: quiet }).keys()]).toEqual(['b'])
    })
})
