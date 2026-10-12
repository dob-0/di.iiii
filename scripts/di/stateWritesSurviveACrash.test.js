/**
 * A write that dies half-way must leave the OLD file whole.
 *
 * The files under DI_HOME that a rebooted install cannot do without — di.env (session secret, admin token, port),
 * state.json, credentials.json (the sync keys; a key is shown once and cannot be read back from the host) and the
 * sync ledgers — were written with a plain writeFile, which truncates the target first. A freeze, a power cut or a
 * full disk between the truncate and the last byte leaves an empty or half file; every reader here degrades a bad
 * file to "nothing", and the next write then saves that nothing over the only copy. This laptop hard-locks, so it
 * is not an academic case. Method: fault injection at the write call (a write that lands half its bytes, then
 * throws ENOSPC) — the standard way to test crash consistency without a real crash — plus the temp + fsync +
 * rename pattern that scripts/di/follows.mjs already uses for follows.json.
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { writeFileAtomic, writeFileAtomicSync } from './atomicWrite.mjs'
import { readLink, writeLink } from './credentialsStore.mjs'
import { createLedger, ledgerPath, readLedger, writeLedger } from './ledger.mjs'
import { paths } from './paths.mjs'
import { readEnv, readState, writeEnv, writeState } from './state.mjs'

let home
beforeEach(() => { home = fs.mkdtempSync(path.join(os.tmpdir(), 'di-crash-')) })
afterEach(() => {
    vi.restoreAllMocks()
    fs.rmSync(home, { recursive: true, force: true })
})

const ENOSPC = () => Object.assign(new Error('ENOSPC: no space left on device, write'), { code: 'ENOSPC' })

const firstHalf = (data) => {
    if (typeof data === 'string') return data.slice(0, Math.ceil(data.length / 2))
    const bytes = Buffer.from(data)
    return bytes.subarray(0, Math.ceil(bytes.length / 2))
}

/**
 * Every way a file's bytes can be written: the first half of the bytes reaches the file the call was aimed at
 * (so a plain writeFile has already truncated its target), then the call throws. An atomic writer aims at a temp
 * file, so only the temp file ever sees the half write.
 */
const interruptEveryWrite = async () => {
    const real = {
        writeFileSync: fs.writeFileSync,
        writeSync: fs.writeSync,
        writeFile: fsp.writeFile
    }
    const probe = await fsp.open(os.devNull, 'w')
    const handleProto = Object.getPrototypeOf(probe)
    await probe.close()
    const realHandleWriteFile = handleProto.writeFile
    const realHandleWrite = handleProto.write

    vi.spyOn(fs, 'writeFileSync').mockImplementation((target, data, options) => {
        real.writeFileSync(target, firstHalf(data), options)
        throw ENOSPC()
    })
    vi.spyOn(fs, 'writeSync').mockImplementation((fd, data, ...rest) => {
        const half = typeof data === 'string' ? firstHalf(data) : firstHalf(data)
        real.writeSync(fd, half)
        void rest
        throw ENOSPC()
    })
    vi.spyOn(fsp, 'writeFile').mockImplementation(async (target, data, options) => {
        await real.writeFile(target, firstHalf(data), options)
        throw ENOSPC()
    })
    vi.spyOn(handleProto, 'writeFile').mockImplementation(async function interrupted(data, options) {
        await realHandleWriteFile.call(this, firstHalf(data), options)
        throw ENOSPC()
    })
    vi.spyOn(handleProto, 'write').mockImplementation(async function interrupted(data, ...rest) {
        void rest
        await realHandleWrite.call(this, firstHalf(data))
        throw ENOSPC()
    })
}

const strays = (dir) => fs.readdirSync(dir, { recursive: true }).map(String).filter((name) => /\.tmp$/.test(name))

describe('a write that dies half-way leaves the old file whole', () => {
    it('di.env keeps its secrets (session secret, admin token, port)', async () => {
        await writeEnv(home, { PORT: '443', AUTH_SESSION_SECRET: 'a'.repeat(64), ADMIN_API_TOKEN: 'b'.repeat(48) })
        const file = paths(home).env
        const before = fs.readFileSync(file)

        await interruptEveryWrite()
        await expect(writeEnv(home, { PORT: '4000', DI_LAN: '1' })).rejects.toThrow(/ENOSPC/)
        vi.restoreAllMocks()

        expect(fs.readFileSync(file).equals(before)).toBe(true)
        expect(readEnv(home).AUTH_SESSION_SECRET).toBe('a'.repeat(64))
        expect(readEnv(home).PORT).toBe('443')
        expect(strays(home)).toEqual([])
    })

    it('state.json keeps what is installed', async () => {
        await writeState(home, { version: '0.4.16-test', channel: 'dev' })
        const file = paths(home).state
        const before = fs.readFileSync(file)

        await interruptEveryWrite()
        await expect(writeState(home, { version: '0.4.17-test' })).rejects.toThrow(/ENOSPC/)
        vi.restoreAllMocks()

        expect(fs.readFileSync(file).equals(before)).toBe(true)
        expect(readState(home).version).toBe('0.4.16-test')
        expect(strays(home)).toEqual([])
    })

    it('credentials.json keeps every sync key when one more link is interrupted', async () => {
        writeLink(home, 'open', { remote: 'https://dev.diiii.xyz/serverXR', key: 'dii_sync_a.s1' })
        writeLink(home, 'wcc', { remote: 'https://di-studio.xyz/serverXR', key: 'dii_sync_b.s2' })
        const before = fs.readFileSync(paths(home).credentials)

        await interruptEveryWrite()
        expect(() => writeLink(home, 'moxir', { remote: 'https://dev.diiii.xyz/serverXR', key: 'dii_sync_c.s3' })).toThrow(/ENOSPC/)
        vi.restoreAllMocks()

        expect(fs.readFileSync(paths(home).credentials).equals(before)).toBe(true)
        expect(readLink(home, 'open').key).toBe('dii_sync_a.s1')
        expect(readLink(home, 'wcc').key).toBe('dii_sync_b.s2')
        expect(strays(home)).toEqual([])
    })

    it('a sync ledger keeps its baseline', async () => {
        const remote = 'https://dev.diiii.xyz/serverXR'
        writeLedger(home, remote, 'open', createLedger({ installId: 'x', remote, spaceId: 'open' }))
        const before = fs.readFileSync(ledgerPath(home, remote, 'open'))

        await interruptEveryWrite()
        expect(() => writeLedger(home, remote, 'open', { ...readLedger(home, remote, 'open'), cursor: 99 })).toThrow(/ENOSPC/)
        vi.restoreAllMocks()

        expect(fs.readFileSync(ledgerPath(home, remote, 'open')).equals(before)).toBe(true)
        expect(readLedger(home, remote, 'open')).not.toBe(null)
        expect(strays(home)).toEqual([])
    })
})

describe('a corrupt credentials file is kept, not written over', () => {
    it('copies the unreadable file aside (0600) before the next link is saved', () => {
        const file = paths(home).credentials
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(file, '{"links":{"open":{"remote":"https://dev.diiii.xyz/serverXR","key":"dii_sync_a.s')

        writeLink(home, 'wcc', { remote: 'https://di-studio.xyz/serverXR', key: 'dii_sync_b.s2' })

        const kept = fs.readdirSync(path.dirname(file)).filter((name) => name.startsWith('credentials.json.corrupt-'))
        expect(kept).toHaveLength(1)
        expect(fs.readFileSync(path.join(path.dirname(file), kept[0]), 'utf8')).toContain('dii_sync_a.s')
        if (process.platform !== 'win32') expect(fs.statSync(path.join(path.dirname(file), kept[0])).mode & 0o777).toBe(0o600)
        expect(readLink(home, 'wcc').key).toBe('dii_sync_b.s2')
    })
})

describe('atomicWrite', () => {
    const modeOf = (file) => fs.statSync(file).mode & 0o777
    const posix = it.skipIf(process.platform === 'win32')

    it('writes the bytes, async and sync, and leaves no temp file behind', async () => {
        const file = path.join(home, 'a', 'one.json')
        fs.mkdirSync(path.dirname(file), { recursive: true })
        await writeFileAtomic(file, 'first\n')
        expect(fs.readFileSync(file, 'utf8')).toBe('first\n')
        writeFileAtomicSync(file, 'second\n')
        expect(fs.readFileSync(file, 'utf8')).toBe('second\n')
        expect(strays(home)).toEqual([])
    })

    posix('applies an explicit mode on every write, over an older looser file', async () => {
        const file = path.join(home, 'secret.env')
        fs.writeFileSync(file, 'old\n', { mode: 0o644 })
        fs.chmodSync(file, 0o644)
        await writeFileAtomic(file, 'new\n', { mode: 0o600 })
        expect(modeOf(file)).toBe(0o600)
        fs.chmodSync(file, 0o644)
        writeFileAtomicSync(file, 'newer\n', { mode: 0o600 })
        expect(modeOf(file)).toBe(0o600)
    })

    posix('without a mode, an existing file keeps its own', async () => {
        const file = path.join(home, 'shared.json')
        fs.writeFileSync(file, 'x')
        fs.chmodSync(file, 0o640)
        await writeFileAtomic(file, 'y')
        expect(modeOf(file)).toBe(0o640)
        writeFileAtomicSync(file, 'z')
        expect(modeOf(file)).toBe(0o640)
    })

    it('does not leave a half-written temp file when the write fails', async () => {
        const file = path.join(home, 'two.json')
        fs.writeFileSync(file, 'keep me')
        await interruptEveryWrite()
        await expect(writeFileAtomic(file, 'a much longer replacement')).rejects.toThrow(/ENOSPC/)
        expect(() => writeFileAtomicSync(file, 'another replacement')).toThrow(/ENOSPC/)
        vi.restoreAllMocks()
        expect(fs.readFileSync(file, 'utf8')).toBe('keep me')
        expect(strays(home)).toEqual([])
    })

    it('rides out a rename that is briefly refused (antivirus, indexer) and gives up on a real error', async () => {
        const file = path.join(home, 'three.json')
        fs.writeFileSync(file, 'old')
        const busy = () => Object.assign(new Error('EPERM: operation not permitted, rename'), { code: 'EPERM' })

        let refusals = 2
        const realRename = fsp.rename
        vi.spyOn(fsp, 'rename').mockImplementation(async (from, to) => {
            if (refusals-- > 0) throw busy()
            return realRename(from, to)
        })
        await writeFileAtomic(file, 'async new')
        expect(fs.readFileSync(file, 'utf8')).toBe('async new')

        let syncRefusals = 2
        const realRenameSync = fs.renameSync
        vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
            if (syncRefusals-- > 0) throw busy()
            return realRenameSync(from, to)
        })
        writeFileAtomicSync(file, 'sync new')
        expect(fs.readFileSync(file, 'utf8')).toBe('sync new')
        vi.restoreAllMocks()

        vi.spyOn(fsp, 'rename').mockRejectedValue(Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' }))
        await expect(writeFileAtomic(file, 'never lands')).rejects.toThrow(/ENOENT/)
        vi.restoreAllMocks()
        expect(fs.readFileSync(file, 'utf8')).toBe('sync new')
        expect(strays(home)).toEqual([])
    })
})
