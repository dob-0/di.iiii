// @vitest-environment node
//
// The dev channel: an install takes the build the hub is serving, verified.
import { afterEach, describe, expect, it } from 'vitest'
import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { parseArgs } from './args.mjs'
import { devRelease, hubCommit, hubUrl, isChannel } from './channels.mjs'
import { stageVersion } from './install.mjs'

const SHA_A = 'a'.repeat(8) + 'b'.repeat(32)
const SHA_B = 'c'.repeat(8) + 'd'.repeat(32)

const sums = (sha8) => `${'0'.repeat(64)}  di-runtime-0.4.16-dev.${sha8}.tar.gz\n`

// health from the hub; checksums from the public download URL. Any other URL
// (notably api.github.com) fails the test: the channel must not call the API.
const feed = (health, published = [], calls = []) => async (url) => {
    calls.push(String(url))
    if (String(url).includes('/serverXR/api/health')) return { ok: true, status: 200, json: async () => health }
    const m = /releases\/download\/dev-([0-9a-f]{8})\/checksums\.txt$/.exec(String(url))
    if (m) return published.includes(m[1]) ? { ok: true, status: 200, text: async () => sums(m[1]) } : { ok: false, status: 404 }
    throw new Error(`unexpected request ${url}`)
}

describe('channel names', () => {
    it('knows dev and stable and nothing else', () => {
        expect(isChannel('dev')).toBe(true)
        expect(isChannel('stable')).toBe(true)
        expect(isChannel('canary')).toBe(false)
        expect(isChannel('')).toBe(false)
    })
    it('takes --channel as a value flag', () => {
        expect(parseArgs(['update', '--channel', 'dev']).flags.channel).toBe('dev')
    })
    it('lets the environment point at another hub', () => {
        expect(hubUrl({}, {})).toBe('https://dev.diiii.xyz')
        expect(hubUrl({}, { DI_HUB: 'http://localhost:1/' })).toBe('http://localhost:1')
    })
})

describe('the dev pick is gated on the hub commit, and anonymous', () => {
    const A8 = 'a'.repeat(8)
    it('reads the hub commit from /serverXR/api/health', async () => {
        expect(await hubCommit({ hub: 'https://h', fetchImpl: feed({ release: { gitCommit: SHA_A.toUpperCase() } }) })).toBe(SHA_A)
    })
    it('fails loudly when the hub does not say which commit it runs', async () => {
        await expect(hubCommit({ hub: 'https://h', fetchImpl: feed({ release: {} }) })).rejects.toThrow(/does not say/)
    })
    it('installs the build of the hub commit, from public download URLs', async () => {
        const out = await devRelease({ hub: 'https://h', fetchImpl: feed({ release: { gitCommit: SHA_A } }, [A8, 'c'.repeat(8)]) })
        expect(out.release.version).toBe(`0.4.16-dev.${A8}`)
        expect(out.release.url).toBe(`https://github.com/dob-0/di.iiii/releases/download/dev-${A8}/di-runtime-0.4.16-dev.${A8}.tar.gz`)
        expect(out.release.checksumsUrl).toMatch(/dev-aaaaaaaa\/checksums\.txt$/)
    })
    it('waits (pending, not an error) when the hub is ahead of CI', async () => {
        const out = await devRelease({ hub: 'https://h', fetchImpl: feed({ release: { gitCommit: SHA_B } }, [A8]) })
        expect(out.release).toBeNull()
        expect(out.pending).toMatch(/no dev build of it is published yet/)
    })
    it('makes NO request to GitHub when already on the hub commit, and never uses the API or a token', async () => {
        const calls = []
        const out = await devRelease({ hub: 'https://h', installed: `0.4.16-dev.${A8}`, fetchImpl: feed({ release: { gitCommit: SHA_A } }, [A8], calls) })
        expect(out.current).toBe(true)
        expect(calls).toHaveLength(1)
        expect(calls.some(c => c.includes('api.github.com'))).toBe(false)
    })
    it('costs one anonymous download when the hub moved', async () => {
        const calls = []
        await devRelease({ hub: 'https://h', installed: `0.4.16-dev.${'c'.repeat(8)}`, fetchImpl: feed({ release: { gitCommit: SHA_A } }, [A8], calls) })
        expect(calls).toHaveLength(2)
        expect(calls.every(c => !c.includes('api.github.com'))).toBe(true)
    })
})

describe('the dev artifact is checksum-verified before anything is unpacked', () => {
    const dirs = []
    afterEach(async () => { while (dirs.length) await fsp.rm(dirs.pop(), { recursive: true, force: true }) })

    it('refuses an artifact whose sha256 does not match checksums.txt', async () => {
        const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'di-chan-'))
        dirs.push(dir)
        const name = 'di-runtime-0.4.16-dev.aaaaaaaa.tar.gz'
        await fsp.writeFile(path.join(dir, name), 'not the artifact the sums describe')
        await fsp.writeFile(path.join(dir, 'checksums.txt'), `${crypto.createHash('sha256').update('something else').digest('hex')}  ${name}\n`)
        const home = path.join(dir, 'home')
        await expect(stageVersion({
            home,
            release: {
                version: '0.4.16-dev.aaaaaaaa',
                url: pathToFileURL(path.join(dir, name)).href,
                checksumsUrl: pathToFileURL(path.join(dir, 'checksums.txt')).href
            }
        })).rejects.toThrow(/checksum mismatch — refusing to install/)
        expect(fs.existsSync(path.join(home, 'versions', '0.4.16-dev.aaaaaaaa'))).toBe(false)
    })
})
