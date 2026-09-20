// The CLI writes follows.json and the server reads it. They are two modules by
// necessity — the packed artifact puts them at different depths — so this is
// the test that keeps them one format.
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

import { describe, expect, it } from 'vitest'

import { addFollow, readFollows as readByCli, removeFollow } from './follows.mjs'

const require = createRequire(import.meta.url)
const { readFollows: readByServer } = require('../../serverXR/src/follow/followStore.js')

const tmpDir = async () => fsp.mkdtemp(path.join(os.tmpdir(), 'di-follows-'))

describe('follows.json', () => {
    it('is written by the CLI and read by the server, byte for byte the same thing', async () => {
        const dir = await tmpDir()
        await addFollow(dir, 'jam', { remote: 'https://local.thedi.studio/serverXR', token: 'dii_sync_x.y' })
        expect(readByServer(dir).jam).toMatchObject({
            remote: 'https://local.thedi.studio/serverXR',
            token: 'dii_sync_x.y'
        })
        expect(Object.keys(readByCli(dir))).toEqual(['jam'])
    })

    it('holds a key, so it is written for the owner only', async () => {
        const dir = await tmpDir()
        await addFollow(dir, 'jam', { remote: 'https://x/serverXR', token: 'secret' })
        const mode = (await fsp.stat(path.join(dir, 'follows.json'))).mode & 0o777
        expect(mode).toBe(0o600)
    })

    it('unfollowing removes only that space, and says whether it did anything', async () => {
        const dir = await tmpDir()
        await addFollow(dir, 'jam', { remote: 'https://x/serverXR', token: 't' })
        await addFollow(dir, 'other', { remote: 'https://y/serverXR', token: 't' })
        expect((await removeFollow(dir, 'jam')).removed).toBe(true)
        expect(Object.keys(readByServer(dir))).toEqual(['other'])
        expect((await removeFollow(dir, 'jam')).removed).toBe(false)
    })

    it('reads an absent or corrupt file as following nothing, never as a crash', async () => {
        const dir = await tmpDir()
        expect(readByServer(dir)).toEqual({})
        await fsp.writeFile(path.join(dir, 'follows.json'), '{ not json')
        expect(readByServer(dir)).toEqual({})
        expect(readByCli(dir)).toEqual({})
    })

    describe('the ADDRESS PIN', () => {
        it('is carried by the CLI writer and read back by the server, byte for byte', async () => {
            const dir = await tmpDir()
            await addFollow(dir, 'jam', { remote: 'https://local.thedi.studio/serverXR', token: 't', address: '100.87.4.12' })
            expect(readByServer(dir).jam).toMatchObject({ address: '100.87.4.12' })
            expect(readByCli(dir).jam).toMatchObject({ address: '100.87.4.12' })
        })

        it('a record written with no pin is byte-identical to one written before the pin existed', async () => {
            const dir = await tmpDir()
            await addFollow(dir, 'jam', { remote: 'https://x/serverXR', token: 't' })
            const withoutPin = await fsp.readFile(path.join(dir, 'follows.json'), 'utf8')

            const dir2 = await tmpDir()
            await addFollow(dir2, 'jam', { remote: 'https://x/serverXR', token: 't', address: null })
            const withNullPin = await fsp.readFile(path.join(dir2, 'follows.json'), 'utf8')

            // `followedAt` is never the same twice — strip it out before the
            // byte comparison, which is what "byte-identical" is really about
            // here: the SHAPE of the record, not this millisecond's clock.
            const stripStamp = (text) => text.replace(/"followedAt": "[^"]*"/, '"followedAt": "STAMP"')
            expect(stripStamp(withNullPin)).toBe(stripStamp(withoutPin))
            expect(JSON.parse(withoutPin).follows.jam).not.toHaveProperty('address')
        })

        it('the server-side writer follows the same rule, kept in step by this same test', async () => {
            const require = createRequire(import.meta.url)
            const { addFollow: addByServer } = require('../../serverXR/src/follow/followStore.js')

            const dir = await tmpDir()
            await addByServer(dir, 'jam', { remote: 'https://x/serverXR', token: 't', address: '100.87.4.12' })
            expect(readByCli(dir).jam).toMatchObject({ address: '100.87.4.12' })

            const dir2 = await tmpDir()
            await addByServer(dir2, 'jam', { remote: 'https://x/serverXR', token: 't' })
            expect(readByCli(dir2).jam).not.toHaveProperty('address')
        })
    })
})
