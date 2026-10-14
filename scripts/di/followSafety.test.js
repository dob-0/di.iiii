// @vitest-environment node
// Five findings of docs/ai/audits/follow-audit-2026-10-04.md: F5, F6, F15, F19, F20.
import fsp from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { followSpace, isTrustedCleartext } from './follow.mjs'
import { addFollow, FollowsCorruptError, removeFollow } from './follows.mjs'

const require = createRequire(import.meta.url)
const store = require('../../serverXR/src/follow/followStore.js')

const tmpDir = () => fsp.mkdtemp(path.join(os.tmpdir(), 'di-follow-safety-'))
const modeOf = async (file) => ((await fsp.stat(file)).mode & 0o777).toString(8)

describe('F6: a follows.json that does not parse is never written over', () => {
    const damage = async (dir) => {
        const file = path.join(dir, 'follows.json')
        const raw = await fsp.readFile(file, 'utf8')
        await fsp.writeFile(file, raw.slice(0, raw.length - 40)) // a crash mid-write
        return { file, damaged: raw.slice(0, raw.length - 40) }
    }

    it('CLI writer refuses, keeps the file, and leaves a .corrupt copy', async () => {
        const dir = await tmpDir()
        await addFollow(dir, 'one', { remote: 'https://a', token: 'dii_sync_x.y' })
        await addFollow(dir, 'two', { remote: 'https://b', token: 'dii_sync_z.w' })
        const { file, damaged } = await damage(dir)
        await expect(addFollow(dir, 'three', { remote: 'https://c', token: 'k' })).rejects.toBeInstanceOf(FollowsCorruptError)
        expect(await fsp.readFile(file, 'utf8')).toBe(damaged)
        const copies = (await fsp.readdir(dir)).filter((name) => name.startsWith('follows.json.corrupt-'))
        expect(copies).toHaveLength(1)
        expect(await fsp.readFile(path.join(dir, copies[0]), 'utf8')).toBe(damaged)
        await expect(removeFollow(dir, 'one')).rejects.toBeInstanceOf(FollowsCorruptError)
    })

    it('server writer refuses the same way', async () => {
        const dir = await tmpDir()
        await store.addFollow(dir, 'one', { remote: 'https://a', token: 'k1' })
        await store.addFollow(dir, 'two', { remote: 'https://b', token: 'k2' })
        const { file, damaged } = await damage(dir)
        await expect(store.addFollow(dir, 'three', { remote: 'https://c', token: 'k' })).rejects.toMatchObject({ code: 'FOLLOWS_CORRUPT' })
        expect(await fsp.readFile(file, 'utf8')).toBe(damaged)
    })

    it('writes through a temp file and leaves none behind', async () => {
        const dir = await tmpDir()
        await addFollow(dir, 'one', { remote: 'https://a', token: 'k' })
        await store.addFollow(dir, 'two', { remote: 'https://b', token: 'k' })
        expect((await fsp.readdir(dir)).sort()).toEqual(['follows.json'])
    })

    it('followSpace says "corrupt" before it changes anything', async () => {
        const home = await tmpDir()
        const data = path.join(home, 'data')
        await fsp.mkdir(data, { recursive: true })
        await fsp.writeFile(path.join(data, 'follows.json'), '{ "format": "di.follows", "follows": { "a"')
        const result = await followSpace({ home, spaceId: 'jam', from: 'http://127.0.0.1:9', key: 'k', port: 9 })
        expect(result).toEqual({ ok: false, reason: 'corrupt' })
    })
})

describe('F15: follows.json is 0600 after every write, not only when created', () => {
    it('tightens an existing 0644 file (CLI and server writers)', async () => {
        const dir = await tmpDir()
        const file = path.join(dir, 'follows.json')
        await addFollow(dir, 'one', { remote: 'https://a', token: 'secret' })
        await fsp.chmod(file, 0o644)
        await addFollow(dir, 'two', { remote: 'https://b', token: 'secret' })
        expect(await modeOf(file)).toBe('600')
        await fsp.chmod(file, 0o644)
        await store.addFollow(dir, 'three', { remote: 'https://c', token: 'secret' })
        expect(await modeOf(file)).toBe('600')
    })
})

describe('F19: unfollow drops the follower\'s saved place', () => {
    it('CLI removeFollow removes follow-state/<space>.json', async () => {
        const dir = await tmpDir()
        await addFollow(dir, 'jam', { remote: 'https://a', token: 'k' })
        await store.writeFollowState(dir, 'jam', { cursors: 7 })
        expect(store.readFollowState(dir, 'jam')).toEqual({ cursors: 7 })
        await removeFollow(dir, 'jam')
        expect(store.readFollowState(dir, 'jam')).toBeNull()
    })

    it('a running follower cannot bring the state back after the follow is gone', async () => {
        const dir = await tmpDir()
        await addFollow(dir, 'jam', { remote: 'https://a', token: 'k' })
        await removeFollow(dir, 'jam')
        await store.writeFollowState(dir, 'jam', { cursors: 99 }) // the late save()
        expect(store.readFollowState(dir, 'jam')).toBeNull()
    })
})

describe('F20: a key does not travel in clear to a public host', () => {
    it('classifies addresses', () => {
        for (const ok of ['https://example.com', 'http://localhost:4000', 'http://127.0.0.1:4000', 'http://192.168.1.4:4000',
            'http://10.0.0.2', 'http://172.20.1.1', 'http://100.87.4.12:4000', 'http://aylmo.local', 'http://[::1]:4000']) {
            expect(isTrustedCleartext(ok), ok).toBe(true)
        }
        for (const bad of ['http://example.com', 'http://8.8.8.8', 'http://172.32.0.1', 'http://100.128.0.1', 'ftp://x']) {
            expect(isTrustedCleartext(bad), bad).toBe(false)
        }
        // a public name pinned to a Tailscale address is the documented `--at` case
        expect(isTrustedCleartext('http://local.thedi.studio', '100.87.4.12')).toBe(true)
    })

    it('followSpace refuses http to a public host, writes nothing, unless --insecure', async () => {
        const home = await tmpDir()
        const result = await followSpace({ home, spaceId: 'jam', from: 'http://example.com', key: 'k', port: 9 })
        expect(result).toEqual({ ok: false, reason: 'cleartext' })
        await expect(fsp.stat(path.join(home, 'data', 'follows.json'))).rejects.toThrow()
    })
})

describe('F5: the merge refusal holds while the install is stopped', () => {
    let host
    let hostUrl
    beforeAll(async () => {
        host = http.createServer((req, res) => {
            res.setHeader('Content-Type', 'application/json')
            if (req.url.startsWith('/api/health')) return res.end(JSON.stringify({ ok: true, startedAt: 1, port: 1 }))
            if (req.url.startsWith('/api/spaces/')) return res.end(JSON.stringify({ latestVersion: 0 }))
            res.statusCode = 404
            return res.end('{}')
        })
        await new Promise((resolve) => host.listen(0, '127.0.0.1', resolve))
        hostUrl = `http://127.0.0.1:${host.address().port}`
    })
    afterAll(() => new Promise((resolve) => host.close(resolve)))

    const homeWithSpaces = async (ids) => {
        const home = await tmpDir()
        const data = path.join(home, 'data')
        await fsp.mkdir(data, { recursive: true })
        const db = new DatabaseSync(path.join(data, 'di.db'))
        db.exec('CREATE TABLE spaces (id TEXT PRIMARY KEY, label TEXT)')
        for (const id of ids) db.prepare('INSERT INTO spaces (id, label) VALUES (?, ?)').run(id, id)
        db.close()
        return home
    }

    it('refuses an existing space without --into, and writes no follow', async () => {
        const home = await homeWithSpaces(['main'])
        const result = await followSpace({ home, spaceId: 'main', from: hostUrl, key: 'k', port: 9 })
        expect(result).toEqual({ ok: false, reason: 'merge' })
        await expect(fsp.stat(path.join(home, 'data', 'follows.json'))).rejects.toThrow()
    })

    it('lets --into through, and a new name through without it', async () => {
        const home = await homeWithSpaces(['main'])
        expect((await followSpace({ home, spaceId: 'main', from: hostUrl, key: 'k', into: 'main', port: 9 })).ok).toBe(true)
        expect((await followSpace({ home, spaceId: 'jam', from: hostUrl, key: 'k', port: 9 })).ok).toBe(true)
    })

    it('a fresh data folder (no database yet) follows without --into', async () => {
        const home = await tmpDir()
        expect((await followSpace({ home, spaceId: 'main', from: hostUrl, key: 'k', port: 9 })).ok).toBe(true)
    })
})
