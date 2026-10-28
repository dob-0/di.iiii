/**
 * stageVersion's integrity rule: a release from the network is installed only
 * against its checksums.txt. A file: release (`di update --from`) has no feed
 * to compare against and still installs; a checksums file that is given is
 * still enforced.
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { stageVersion } from './install.mjs'

const dirs = []
afterEach(async () => {
    vi.restoreAllMocks()
    while (dirs.length) await fsp.rm(dirs.pop(), { recursive: true, force: true })
})

const tempDir = async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'di-stage-'))
    dirs.push(dir)
    return dir
}

// The smallest runtime stageVersion can unpack and `npm ci --omit=dev`:
// a top folder holding serverXR/ with a package.json and a lockfile with no deps.
const makeRuntime = async (dir, version) => {
    const top = path.join(dir, 'src', `di-runtime-${version}`)
    await fsp.mkdir(path.join(top, 'serverXR'), { recursive: true })
    await fsp.mkdir(path.join(top, 'dist'), { recursive: true })
    await fsp.writeFile(path.join(top, 'serverXR', 'package.json'), JSON.stringify({ name: 'stub', version: '0.0.0' }))
    await fsp.writeFile(path.join(top, 'serverXR', 'package-lock.json'), JSON.stringify({
        name: 'stub', version: '0.0.0', lockfileVersion: 3, requires: true,
        packages: { '': { name: 'stub', version: '0.0.0' } }
    }))
    const name = `di-runtime-${version}.tar.gz`
    const tar = spawnSync('tar', ['-czf', path.join(dir, name), '-C', path.join(dir, 'src'), `di-runtime-${version}`])
    if (tar.status !== 0) throw new Error(`tar failed: ${tar.stderr}`)
    return path.join(dir, name)
}

const sha256 = async (file) => crypto.createHash('sha256').update(await fsp.readFile(file)).digest('hex')

describe('stageVersion refuses a network release without checksums.txt', () => {
    it('rejects before any download, naming checksums.txt and the version', async () => {
        const dir = await tempDir()
        const home = path.join(dir, 'home')
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('fetch must not be called'))
        await expect(stageVersion({
            home,
            release: {
                version: '9.9.9',
                url: 'https://github.com/example/releases/download/v9.9.9/di-runtime-9.9.9.tar.gz',
                checksumsUrl: null
            }
        })).rejects.toThrow('release 9.9.9 has no checksums.txt, so it cannot be verified — refusing to install it')
        expect(fetchSpy).not.toHaveBeenCalled()
        expect(fs.existsSync(path.join(home, 'versions', '9.9.9'))).toBe(false)
        expect(fs.existsSync(path.join(home, 'versions', '9.9.9.partial'))).toBe(false)
    })
})

describe('stageVersion with a file: release', () => {
    it('installs a tarball whose checksums file matches', async () => {
        const dir = await tempDir()
        const archive = await makeRuntime(dir, '1.0.0')
        await fsp.writeFile(path.join(dir, 'checksums.txt'), `${await sha256(archive)}  ${path.basename(archive)}\n`)
        const { partialDir } = await stageVersion({
            home: path.join(dir, 'home'),
            release: {
                version: '1.0.0',
                url: pathToFileURL(archive).href,
                checksumsUrl: pathToFileURL(path.join(dir, 'checksums.txt')).href
            }
        })
        expect(fs.existsSync(path.join(partialDir, 'serverXR', 'package.json'))).toBe(true)
    }, 60_000)

    it('refuses a tarball whose checksum does not match', async () => {
        const dir = await tempDir()
        const archive = await makeRuntime(dir, '1.0.1')
        await fsp.writeFile(path.join(dir, 'checksums.txt'), `${'0'.repeat(64)}  ${path.basename(archive)}\n`)
        await expect(stageVersion({
            home: path.join(dir, 'home'),
            release: {
                version: '1.0.1',
                url: pathToFileURL(archive).href,
                checksumsUrl: pathToFileURL(path.join(dir, 'checksums.txt')).href
            }
        })).rejects.toThrow(/checksum mismatch — refusing to install/)
    })

    it('installs without a checksums file (di update --from)', async () => {
        const dir = await tempDir()
        const archive = await makeRuntime(dir, '1.0.2')
        const { partialDir } = await stageVersion({
            home: path.join(dir, 'home'),
            release: { version: '1.0.2', url: pathToFileURL(archive).href, checksumsUrl: null }
        })
        expect(fs.existsSync(path.join(partialDir, 'serverXR', 'package.json'))).toBe(true)
    }, 60_000)
})
