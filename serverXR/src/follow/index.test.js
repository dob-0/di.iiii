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

    // Found on the owner's install 2026-10-05: `di follow … --key -` on a follow that
    // already existed wrote the new key to follows.json, and the running server went on
    // using the old one (11 of 15 spaces). A restart was only ever triggered by a new
    // direction. This fails without keying the running follower on its whole entry.
    it('restarts a running follower when its key, remote or address changes, and only then', async () => {
        const dataDir = await mkdtemp(path.join(os.tmpdir(), 'di-follows-'))
        dirs.push(dataDir)
        const started = []
        const stopped = []
        const starter = ({ remote }) => {
            const index = started.length
            started.push({ token: remote.token, base: remote.base, address: remote.address })
            return { stop: () => stopped.push(index), state: {}, wake() {} }
        }
        const entry = { remote: 'http://127.0.0.1:9/serverXR', token: 'old-key' }
        const call = () => startFollows({ dataDir, port: 9, log: quiet, starter })

        await writeFollows(dataDir, { a: entry })
        call()
        expect(started.map(s => s.token)).toEqual(['old-key'])

        // The file is touched, nothing in the entry changed: the follower is left alone.
        await writeFollows(dataDir, { a: { ...entry, followedAt: 'later' } })
        call()
        expect(started).toHaveLength(1)

        await writeFollows(dataDir, { a: { ...entry, token: 'new-key' } })
        call()
        expect(started.map(s => s.token)).toEqual(['old-key', 'new-key'])
        expect(stopped).toEqual([0])

        await writeFollows(dataDir, { a: { ...entry, token: 'new-key', address: '100.64.0.2' } })
        call()
        expect(started.at(-1)).toMatchObject({ token: 'new-key', address: '100.64.0.2' })
        expect(stopped).toEqual([0, 1])

        await writeFollows(dataDir, { a: { ...entry, token: 'new-key', address: '100.64.0.2', remote: 'http://127.0.0.1:9/other' } })
        call()
        expect(started.at(-1).base).toBe('http://127.0.0.1:9/other')
        expect(stopped).toEqual([0, 1, 2])
    })
})
