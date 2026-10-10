// @vitest-environment node
//
// The file `di login` keeps on a machine: ~/.config/di/credentials.json, the
// same file the SDK reads. It holds bearer tokens, so what is pinned here is
// what a careless version gets wrong: the modes (and that they are tightened on
// a REWRITE, since a file or folder that already existed keeps its old mode),
// a write that can never leave half a file, a corrupt file that is kept rather
// than destroyed, and — the guard that keeps the two sides honest — that the
// SDK's own resolver finds what this module wrote.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { TIERS, resolveToken } from '../../sdk/credentials.js'
import { SITES, credentialsFile, loginKeyFor, originOf, readLogin, removeLogin, writeLogin } from './loginStore.mjs'

let home
beforeEach(() => { home = fs.mkdtempSync(path.join(os.tmpdir(), 'di-loginstore-')) })
afterEach(() => { fs.rmSync(home, { recursive: true, force: true }) })

const mode = (target) => fs.statSync(target).mode & 0o777
const posix = process.platform !== 'win32'
const entry = (token, extra = {}) => ({
    token,
    base: 'https://dev.diiii.xyz/serverXR',
    site: 'https://dev.diiii.xyz',
    user: { id: 'u1', name: 'Taron' },
    expiresAt: 1799999999999,
    savedAt: '2026-10-07T12:00:00.000Z',
    ...extra
})
const file = () => credentialsFile(home)
const seed = (text) => {
    fs.mkdirSync(path.dirname(file()), { recursive: true })
    fs.writeFileSync(file(), text)
}

describe('loginKeyFor — where a login is filed', () => {
    it('names the key of a tier, and nothing for a tier that does not exist', () => {
        expect(loginKeyFor({ tier: 'dev' })).toBe('dev')
        expect(loginKeyFor({ tier: 'prod' })).toBe('prod')
        expect(loginKeyFor({ tier: 'local' })).toBe('local')
        expect(loginKeyFor({ tier: 'staging' })).toBeNull()
        expect(loginKeyFor({ tier: 'constructor' })).toBeNull()
    })

    it('files a URL that is a tier\'s own site under that tier — trailing slash, path, case and all', () => {
        expect(loginKeyFor({ to: 'https://dev.diiii.xyz' })).toBe('dev')
        expect(loginKeyFor({ to: 'https://dev.diiii.xyz/' })).toBe('dev')
        expect(loginKeyFor({ to: 'https://DEV.diiii.xyz/serverXR/' })).toBe('dev')
        expect(loginKeyFor({ to: 'https://di-studio.xyz/' })).toBe('prod')
        expect(loginKeyFor({ to: 'http://localhost:4000/' })).toBe('local')
    })

    it('files any other host under its origin: scheme, host and a port that is not the default', () => {
        expect(loginKeyFor({ to: 'https://example.org' })).toBe('https://example.org')
        expect(loginKeyFor({ to: 'https://example.org/' })).toBe('https://example.org')
        expect(loginKeyFor({ to: 'https://example.org:443/serverXR?x=1#y' })).toBe('https://example.org')
        expect(loginKeyFor({ to: 'https://example.org:8443/a/b' })).toBe('https://example.org:8443')
        expect(loginKeyFor({ to: 'http://127.0.0.1:5000/' })).toBe('http://127.0.0.1:5000')
        // not the local tier: the tier is exactly localhost:4000
        expect(loginKeyFor({ to: 'http://localhost:4100' })).toBe('http://localhost:4100')
    })

    it('has no key for something that is not an http(s) address', () => {
        for (const to of ['example.org', 'ftp://example.org', 'javascript:alert(1)', '', null, undefined]) {
            expect(loginKeyFor({ to }), String(to)).toBeNull()
        }
        expect(originOf('not a url')).toBeNull()
    })

    it('copies the three sites the SDK calls by name — and fails the day the two differ', () => {
        expect(SITES).toEqual(Object.fromEntries(Object.entries(TIERS).map(([name, tier]) => [name, tier.site])))
    })
})

describe('the file', () => {
    it('is the shape the SDK reads: { <key>: { token, base, site, user, expiresAt, savedAt } }', () => {
        writeLogin({ home, key: 'dev', entry: entry('dii_cli_aaaaaaaaaaaaaaaa.s1') })
        expect(JSON.parse(fs.readFileSync(file(), 'utf8'))).toEqual({ dev: entry('dii_cli_aaaaaaaaaaaaaaaa.s1') })
        expect(readLogin({ home, key: 'dev' }).user).toEqual({ id: 'u1', name: 'Taron' })
        expect(file()).toBe(path.join(home, '.config', 'di', 'credentials.json'))
    })

    it.skipIf(!posix)('is 0600 in a 0700 folder', () => {
        writeLogin({ home, key: 'dev', entry: entry('dii_cli_t1') })
        expect(mode(file())).toBe(0o600)
        expect(mode(path.dirname(file()))).toBe(0o700)
    })

    it.skipIf(!posix)('tightens a file and a folder that were already looser — on every write, not only the first', () => {
        seed('{}')
        fs.chmodSync(path.dirname(file()), 0o755)
        fs.chmodSync(file(), 0o644)
        writeLogin({ home, key: 'dev', entry: entry('dii_cli_t2') })
        expect(mode(file())).toBe(0o600)
        expect(mode(path.dirname(file()))).toBe(0o700)
    })

    it('keeps every other entry, and anything else that was in the file, when one is written or removed', () => {
        seed(JSON.stringify({ prod: entry('dii_cli_prodprod'), somethingElse: { note: 'not ours' } }))
        writeLogin({ home, key: 'dev', entry: entry('dii_cli_devdev00') })
        writeLogin({ home, key: 'https://example.org', entry: entry('dii_cli_custom00') })
        const stored = JSON.parse(fs.readFileSync(file(), 'utf8'))
        expect(Object.keys(stored).sort()).toEqual(['dev', 'https://example.org', 'prod', 'somethingElse'])
        expect(removeLogin({ home, key: 'dev' })).toBe(true)
        expect(Object.keys(JSON.parse(fs.readFileSync(file(), 'utf8'))).sort()).toEqual(['https://example.org', 'prod', 'somethingElse'])
        expect(readLogin({ home, key: 'prod' }).token).toBe('dii_cli_prodprod')
    })

    it('reads a missing, empty, corrupt or not-an-object file as "no login", and never throws', () => {
        expect(readLogin({ home, key: 'dev' })).toBeNull()
        for (const text of ['', '   \n', '{broken', 'null', '[]', '"a string"', '42', '{"dev":"not an object"}', '{"dev":{"token":""}}']) {
            seed(text)
            expect(readLogin({ home, key: 'dev' }), JSON.stringify(text)).toBeNull()
        }
        // a key that is not one of ours is not looked up at all
        expect(readLogin({ home, key: '__proto__' })).toBeNull()
        expect(readLogin({ home, key: 'constructor' })).toBeNull()
    })

    it.skipIf(!posix)('keeps a corrupt file as credentials.json.corrupt-<time> (0600) before it replaces it', () => {
        seed('{broken, but it might be somebody\'s only copy')
        writeLogin({ home, key: 'dev', entry: entry('dii_cli_new00000'), now: () => Date.UTC(2026, 9, 7, 12, 30, 15, 123) })
        expect(readLogin({ home, key: 'dev' }).token).toBe('dii_cli_new00000')
        const kept = path.join(path.dirname(file()), 'credentials.json.corrupt-2026-10-07T12-30-15-123Z')
        expect(fs.readFileSync(kept, 'utf8')).toBe('{broken, but it might be somebody\'s only copy')
        expect(mode(kept)).toBe(0o600)
    })

    it('treats valid JSON that is not an object as corrupt too, and keeps it', () => {
        seed('[1, 2, 3]')
        writeLogin({ home, key: 'dev', entry: entry('dii_cli_new00001') })
        const copies = fs.readdirSync(path.dirname(file())).filter((name) => name.startsWith('credentials.json.corrupt-'))
        expect(copies).toHaveLength(1)
        expect(fs.readFileSync(path.join(path.dirname(file()), copies[0]), 'utf8')).toBe('[1, 2, 3]')
    })

    it('does NOT replace a corrupt file it could not keep a copy of', () => {
        seed('{broken')
        const fsImpl = { ...fs, copyFileSync: () => { throw Object.assign(new Error('disk full'), { code: 'ENOSPC' }) } }
        expect(() => writeLogin({ home, key: 'dev', entry: entry('dii_cli_new00002'), fsImpl })).toThrow(/left as it is/)
        expect(fs.readFileSync(file(), 'utf8')).toBe('{broken')
    })

    it('is atomic: a failing rename leaves the old file as it was, and no temp file behind', () => {
        writeLogin({ home, key: 'dev', entry: entry('dii_cli_old00000') })
        const before = fs.readFileSync(file(), 'utf8')
        const fsImpl = { ...fs, renameSync: () => { throw Object.assign(new Error('boom'), { code: 'EIO' }) } }
        expect(() => writeLogin({ home, key: 'dev', entry: entry('dii_cli_new00003'), fsImpl })).toThrow('boom')
        expect(fs.readFileSync(file(), 'utf8')).toBe(before)
        expect(readLogin({ home, key: 'dev' }).token).toBe('dii_cli_old00000')
        expect(fs.readdirSync(path.dirname(file()))).toEqual(['credentials.json'])
    })

    it('is atomic: the new text is written beside the file and renamed over it, never into it', () => {
        writeLogin({ home, key: 'dev', entry: entry('dii_cli_old00001') })
        const opened = []
        const renamed = []
        const fsImpl = {
            ...fs,
            openSync: (target, ...rest) => { opened.push(target); return fs.openSync(target, ...rest) },
            renameSync: (from, to) => { renamed.push([from, to]); return fs.renameSync(from, to) }
        }
        writeLogin({ home, key: 'dev', entry: entry('dii_cli_new00004'), fsImpl })
        expect(opened).toHaveLength(1)
        expect(opened[0]).not.toBe(file())
        expect(path.dirname(opened[0])).toBe(path.dirname(file()))
        expect(renamed).toEqual([[opened[0], file()]])
    })

    it('asks for nothing it cannot use: a key that is not a tier or an origin, an entry with no token', () => {
        for (const key of ['__proto__', 'constructor', 'staging', 'example.org', '', null]) {
            expect(() => writeLogin({ home, key, entry: entry('dii_cli_x') }), String(key)).toThrow(/cannot be filed/)
        }
        expect(() => writeLogin({ home, key: 'dev', entry: { user: {} } })).toThrow(/needs a token/)
        expect(fs.existsSync(file())).toBe(false)
    })

    it('removes nothing, and touches nothing, where there is no login — a corrupt file is left alone', () => {
        expect(removeLogin({ home, key: 'dev' })).toBe(false)
        expect(fs.existsSync(file())).toBe(false)
        seed('{broken')
        expect(removeLogin({ home, key: 'dev' })).toBe(false)
        expect(fs.readFileSync(file(), 'utf8')).toBe('{broken')
        expect(fs.readdirSync(path.dirname(file()))).toEqual(['credentials.json'])
    })

    it('ignores a chmod that fails on Windows — and only there', () => {
        const fsImpl = {
            ...fs,
            chmodSync: () => { throw Object.assign(new Error('EPERM'), { code: 'EPERM' }) },
            fchmodSync: () => { throw Object.assign(new Error('EPERM'), { code: 'EPERM' }) }
        }
        writeLogin({ home, key: 'dev', entry: entry('dii_cli_win00000'), fsImpl, platform: 'win32' })
        expect(readLogin({ home, key: 'dev' }).token).toBe('dii_cli_win00000')
        const second = fs.mkdtempSync(path.join(os.tmpdir(), 'di-loginstore-posix-'))
        try {
            expect(() => writeLogin({ home: second, key: 'dev', entry: entry('dii_cli_posix000'), fsImpl, platform: 'linux' })).toThrow('EPERM')
        } finally {
            fs.rmSync(second, { recursive: true, force: true })
        }
    })
})

describe('the SDK reads what is written here — the two halves of one file', () => {
    it('finds a tier\'s login by tier name', () => {
        writeLogin({ home, key: loginKeyFor({ tier: 'dev' }), entry: entry('dii_cli_sdkdev00') })
        expect(resolveToken({ tier: 'dev', env: {}, home })).toBe('dii_cli_sdkdev00')
        expect(resolveToken({ tier: 'prod', env: {}, home })).toBeNull()
    })

    it('finds a custom host\'s login by the origin of its base — path, slash and case ignored', () => {
        writeLogin({ home, key: loginKeyFor({ to: 'https://Example.org/' }), entry: entry('dii_cli_sdkorg00', { site: 'https://example.org', base: 'https://example.org/serverXR' }) })
        for (const base of ['https://example.org/serverXR', 'https://example.org/serverXR/', 'https://example.org', 'https://EXAMPLE.org/serverXR']) {
            expect(resolveToken({ env: {}, home, base }), base).toBe('dii_cli_sdkorg00')
        }
    })

    it('finds a tier\'s login by its site too, when only the base is given', () => {
        writeLogin({ home, key: loginKeyFor({ to: 'https://dev.diiii.xyz' }), entry: entry('dii_cli_sdkdev01') })
        expect(resolveToken({ env: {}, home, base: 'https://dev.diiii.xyz/serverXR' })).toBe('dii_cli_sdkdev01')
    })

    it('never offers one host\'s login to another host', () => {
        writeLogin({ home, key: 'https://example.org', entry: entry('dii_cli_sdkorg01') })
        writeLogin({ home, key: 'dev', entry: entry('dii_cli_sdkdev02') })
        expect(resolveToken({ env: {}, home, base: 'https://other.example/serverXR' })).toBeNull()
        expect(resolveToken({ env: {}, home, base: 'https://example.org:8443/serverXR' })).toBeNull()
        expect(resolveToken({ env: {}, home, base: 'http://dev.diiii.xyz/serverXR' })).toBeNull()
    })

    it('still lets DI_TOKEN, then the tier\'s variable, win over the file', () => {
        writeLogin({ home, key: 'https://example.org', entry: entry('dii_cli_sdkorg02') })
        writeLogin({ home, key: 'dev', entry: entry('dii_cli_sdkdev03') })
        expect(resolveToken({ tier: 'dev', env: { DI_TOKEN: 'ci' }, home })).toBe('ci')
        expect(resolveToken({ tier: 'dev', env: { DI_TOKEN_DEV: 'tier-var' }, home })).toBe('tier-var')
        expect(resolveToken({ env: { DI_TOKEN: 'ci' }, home, base: 'https://example.org/serverXR' })).toBe('ci')
        expect(resolveToken({ tier: 'dev', env: {}, token: 'explicit', home })).toBe('explicit')
    })
})
