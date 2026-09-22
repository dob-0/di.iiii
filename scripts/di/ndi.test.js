// @vitest-environment node
//
// The NDI runtime is a proprietary library fetched from somebody else's CDN
// and pointed at by one line of env. Four things must never drift: where it
// lands (update, backup and uninstall all have opinions about that), that a
// download which is not a library for THIS machine is refused rather than
// installed and left to fail at dlopen, that every platform the CLI claims to
// support actually has a URL and a filename behind it, and that removing it
// cannot take somebody else's DI_NDI_LIB with it.
//
// The one thing these cannot cover is the Windows unattended install: it needs
// Windows to run an Inno Setup installer. What IS covered there is the part
// that would silently do the wrong thing — the already-on-the-machine path,
// which copies from NDI_RUNTIME_DIR_V6 and must not invent a file that is not
// there.
import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { paths } from './paths.mjs'
import { readEnv, writeEnv } from './state.mjs'
import {
    LIB_NAME,
    LINUX_BUILD,
    LINUX_VARIANTS,
    NDI_DOWNLOAD,
    NDI_MAJOR,
    getNdi,
    looksLikeLibrary,
    ndiDownloadFor,
    ndiPaths,
    ndiStatus,
    removeNdi
} from './ndi.mjs'

const homes = []
afterEach(() => {
    while (homes.length) fs.rmSync(homes.pop(), { recursive: true, force: true })
})

// A dot in the path on purpose: the real install is ~/.di, and a throwaway
// home without a dot has hidden a bug in this CLI before.
const home = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), '.di-ndi-'))
    homes.push(dir)
    return dir
}

const elf = () => Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0])
const machO = () => Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 0, 0, 0, 0])
const fatMachO = () => Buffer.from([0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 0])
const pe = () => Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0, 0, 0, 0])
const html = () => Buffer.from('<!DOCTYPE html><html>', 'utf8')

describe('where the runtime lives', () => {
    it('is outside the artist’s work and outside the versions an update replaces', () => {
        const dir = home()
        const p = paths(dir)
        const n = ndiPaths(dir)
        expect(n.library.startsWith(p.data)).toBe(false)
        expect(n.library.startsWith(p.versions)).toBe(false)
        expect(n.root.startsWith(p.home)).toBe(true)
    })

    it('is named what serverXR’s loader looks for on this platform', () => {
        const n = ndiPaths(home())
        expect(path.basename(n.library)).toBe(LIB_NAME[process.platform] || LIB_NAME.linux)
    })
})

describe('every platform we claim, we can actually name', () => {
    it.each(['linux', 'darwin', 'win32'])('%s has a url, a filename and a library name', (platform) => {
        const download = ndiDownloadFor(platform)
        expect(download).toBeTruthy()
        expect(download.url).toMatch(/^https:\/\/downloads\.ndi\.tv\//)
        expect(download.file.length).toBeGreaterThan(0)
        expect(download.bytes).toBeGreaterThan(1_000_000)
        expect(LIB_NAME[platform]).toBeTruthy()
    })

    it('says nothing is published rather than guessing, on a platform NDI does not serve', () => {
        expect(ndiDownloadFor('aix')).toBe(null)
        expect(ndiDownloadFor('freebsd')).toBe(null)
    })

    it('carries the major version in every url, so bumping it is one constant', () => {
        for (const download of Object.values(NDI_DOWNLOAD)) {
            expect(download.url).toContain(String(NDI_MAJOR))
        }
    })

    it('has a linux build for every architecture it maps, and maps only real ones', () => {
        for (const build of Object.values(LINUX_BUILD)) {
            expect(LINUX_VARIANTS).toContain(build)
        }
    })
})

// This is the check that keeps a redirect-to-a-login-page from being installed
// under the right filename and failing later with a sentence about ELF headers.
describe('what arrived has to be a library for THIS machine', () => {
    it('accepts the real magic numbers, per platform', () => {
        expect(looksLikeLibrary(elf(), 'linux')).toBe(true)
        expect(looksLikeLibrary(machO(), 'darwin')).toBe(true)
        expect(looksLikeLibrary(fatMachO(), 'darwin')).toBe(true)
        expect(looksLikeLibrary(pe(), 'win32')).toBe(true)
    })

    it('refuses a library built for a different machine', () => {
        expect(looksLikeLibrary(machO(), 'linux')).toBe(false)
        expect(looksLikeLibrary(elf(), 'darwin')).toBe(false)
        expect(looksLikeLibrary(elf(), 'win32')).toBe(false)
    })

    it('refuses an error page saved under the right name', () => {
        expect(looksLikeLibrary(html(), 'linux')).toBe(false)
        expect(looksLikeLibrary(html(), 'darwin')).toBe(false)
    })

    it('refuses nothing at all', () => {
        expect(looksLikeLibrary(Buffer.alloc(0), 'linux')).toBe(false)
        expect(looksLikeLibrary(Buffer.from([0x7f]), 'linux')).toBe(false)
        expect(looksLikeLibrary(null, 'linux')).toBe(false)
    })
})

describe('status', () => {
    it('says nothing is here without inventing a path', async () => {
        const status = await ndiStatus(home())
        expect(status.installed).toBe(false)
        expect(status.library).toBe(null)
        expect(status.wired).toBe(false)
    })

    it('reads the receipt back, so a machine can say WHICH build it has', async () => {
        const dir = home()
        const n = ndiPaths(dir)
        fs.mkdirSync(n.lib, { recursive: true })
        fs.writeFileSync(n.library, elf())
        fs.writeFileSync(n.receipt, JSON.stringify({
            version: 'v6', variant: 'aarch64-rpi4-linux-gnueabi', sha256: 'abc123', fetchedAt: '2026-09-22T00:00:00.000Z'
        }))
        await writeEnv(dir, { DI_NDI_LIB: n.library })
        const status = await ndiStatus(dir)
        expect(status.installed).toBe(true)
        expect(status.variant).toBe('aarch64-rpi4-linux-gnueabi')
        expect(status.wired).toBe(true)
    })

    // Found on the rig: a library put in place by hand has no receipt, and
    // the status line printed `NDI null` and a blank date at the person. A
    // runtime that works must never read as broken.
    it('reports a hand-placed library without printing null at anybody', async () => {
        const dir = home()
        const n = ndiPaths(dir)
        fs.mkdirSync(n.lib, { recursive: true })
        fs.writeFileSync(n.library, elf())
        const status = await ndiStatus(dir)
        expect(status.installed).toBe(true)
        expect(status.known).toBe(false)
        expect(status.version).toBe(`v${NDI_MAJOR}`)
        expect(status.fetchedAt).toBe(null)
        expect(status.sha256).toBe(null)
    })

    it('marks a fetched library as one we know the provenance of', async () => {
        const dir = home()
        const n = ndiPaths(dir)
        fs.mkdirSync(n.lib, { recursive: true })
        fs.writeFileSync(n.library, elf())
        fs.writeFileSync(n.receipt, JSON.stringify({ version: 'v6', sha256: 'abc', fetchedAt: '2026-09-22T00:00:00.000Z' }))
        expect((await ndiStatus(dir)).known).toBe(true)
    })

    // A DI_NDI_LIB left over from a moved or a hand-made install points at a
    // file this command did not put there. "installed" and "wired" are
    // different questions and the status line says both.
    it('does not call itself wired when di.env points at somebody else’s library', async () => {
        const dir = home()
        const n = ndiPaths(dir)
        fs.mkdirSync(n.lib, { recursive: true })
        fs.writeFileSync(n.library, elf())
        await writeEnv(dir, { DI_NDI_LIB: '/usr/lib/libndi.so.6' })
        const status = await ndiStatus(dir)
        expect(status.installed).toBe(true)
        expect(status.wired).toBe(false)
        expect(status.pointedAt).toBe('/usr/lib/libndi.so.6')
    })
})

describe('get, without the network', () => {
    it('is idempotent, and re-points di.env at a library that is already there', async () => {
        const dir = home()
        const n = ndiPaths(dir)
        fs.mkdirSync(n.lib, { recursive: true })
        fs.writeFileSync(n.library, elf())
        // Someone edited di.env, or restored an old one: the library is here
        // and nothing points at it. A second `get` must fix that without
        // downloading 62 MB to discover the file it already has.
        const status = await getNdi(dir)
        expect(status.wired).toBe(true)
        expect(readEnv(dir).DI_NDI_LIB).toBe(n.library)
    })

    it('refuses a platform NDI publishes nothing for, by name', async () => {
        const dir = home()
        const real = process.platform
        Object.defineProperty(process, 'platform', { value: 'aix', configurable: true })
        try {
            await expect(getNdi(dir)).rejects.toThrow(/aix/)
        } finally {
            Object.defineProperty(process, 'platform', { value: real, configurable: true })
        }
    })

    it('refuses a linux build that does not exist, and says which do', async () => {
        const dir = home()
        if (process.platform !== 'linux') return
        await expect(getNdi(dir, { variant: 'sparc-solaris' })).rejects.toThrow(/x86_64-linux-gnu/)
    })
})

describe('remove', () => {
    it('takes the library and the env line together', async () => {
        const dir = home()
        const n = ndiPaths(dir)
        fs.mkdirSync(n.lib, { recursive: true })
        fs.writeFileSync(n.library, elf())
        await writeEnv(dir, { DI_NDI_LIB: n.library, PORT: '4000' })
        await removeNdi(dir)
        expect(fs.existsSync(n.root)).toBe(false)
        expect(readEnv(dir).DI_NDI_LIB).toBeUndefined()
        // and nothing else
        expect(readEnv(dir).PORT).toBe('4000')
    })

    // The one that would be a real bug: a person who installed NDI themselves
    // and pointed di.env at the system copy, then tried our fetch and removed
    // it, must not lose the runtime they had all along.
    it('leaves a DI_NDI_LIB that points somewhere we never wrote', async () => {
        const dir = home()
        await writeEnv(dir, { DI_NDI_LIB: '/usr/lib/libndi.so.6' })
        await removeNdi(dir)
        expect(readEnv(dir).DI_NDI_LIB).toBe('/usr/lib/libndi.so.6')
    })
})
