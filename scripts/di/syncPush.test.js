import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { devHostAllowed as storedAllowed } from '../stored-login.mjs'
import { assertDevHost, devHostAllowed, runSyncPush, devBase, findTierSync, pushArgs, pushEnv, readAdminToken } from './syncPush.mjs'

describe('syncPush', () => {
    it('devBase accepts the plain host, a trailing slash and an existing /serverXR', () => {
        expect(devBase('https://dev.diiii.xyz')).toBe('https://dev.diiii.xyz/serverXR')
        expect(devBase('https://dev.diiii.xyz/')).toBe('https://dev.diiii.xyz/serverXR')
        expect(devBase('https://dev.diiii.xyz/serverXR/')).toBe('https://dev.diiii.xyz/serverXR')
        expect(devBase(undefined)).toBe('https://dev.diiii.xyz/serverXR')
    })
    it('is a dry-run unless apply, and passes skip through', () => {
        expect(pushArgs({ spaceId: 's' })).toEqual(['--from', 'local', '--to', 'dev', '--space', 's', '--dry-run'])
        expect(pushArgs({ spaceId: 's', apply: true, skip: 's/p' })).toEqual(['--from', 'local', '--to', 'dev', '--space', 's', '--skip', 's/p'])
    })
    it('reads the admin token for the child env only, and an explicit DI_DEV_BASE wins', () => {
        const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-push-'))
        fs.writeFileSync(path.join(home, 'di.env'), 'PORT=1\nADMIN_API_TOKEN=abc123\n')
        expect(readAdminToken(home)).toBe('abc123')
        const env = pushEnv({ env: {}, home, localBase: 'http://127.0.0.1:4000', remote: 'https://dev.diiii.xyz' })
        expect(env).toMatchObject({ LOCAL_API_URL: 'http://127.0.0.1:4000', API_TOKEN: 'abc123', DI_DEV_BASE: 'https://dev.diiii.xyz/serverXR' })
        expect(pushEnv({ env: { DI_DEV_BASE: 'http://127.0.0.1:18081/serverXR' }, home, localBase: 'x', remote: 'x' }).DI_DEV_BASE).toBe('http://127.0.0.1:18081/serverXR')
        expect(JSON.stringify(pushArgs({ spaceId: 's', apply: true }))).not.toContain('abc123')
        fs.rmSync(home, { recursive: true, force: true })
    })
    it('finds tier-sync in a checkout and returns null when absent', () => {
        const here = path.resolve(path.dirname(new URL(import.meta.url).pathname))
        expect(findTierSync({ here, installedDir: null })).toMatch(/tier-sync\.mjs$/)
        expect(findTierSync({ here: '/nonexistent/a/b', installedDir: '/nonexistent' })).toBeNull()
    })
})

describe('syncPush dev host allowlist', () => {
    const ok = ['https://dev.diiii.xyz', 'https://dev.diiii.xyz/serverXR', 'http://127.0.0.1:18081/serverXR', 'http://localhost:8081', 'http://[::1]:8081', 'http://diiii.localhost', 'https://x-test.diiii.localhost/a']
    const bad = ['https://diiii.xyz', 'https://prod.diiii.xyz/serverXR', 'https://evil.example.com', 'https://dev.diiii.xyz.evil.com', 'http://dev.diiii.xyz', 'https://dev.diiii.xyz@evil.com', 'https://user:pw@dev.diiii.xyz', 'http://notdiiii.localhost', 'ftp://127.0.0.1', 'not a url', '']
    it('allows dev and loopback only', () => { for (const u of ok) expect(devHostAllowed(u), u).toBe(true) })
    it('refuses prod, foreign hosts and lookalikes', () => { for (const u of bad) expect(devHostAllowed(u), u).toBe(false) })
    it('devBase and pushEnv throw for a foreign remote or DI_DEV_BASE, without the token in the message', () => {
        expect(() => devBase('https://evil.example.com')).toThrow(/refusing dev base/)
        expect(() => devBase('https://prod.diiii.xyz')).toThrow(/refusing/)
        expect(() => assertDevHost('https://u:SECRET@evil.example.com')).toThrow(/^(?!.*SECRET)/)
        expect(() => pushEnv({ env: { DI_DEV_BASE: 'https://evil.example.com/serverXR' }, home: os.tmpdir(), localBase: 'x', remote: 'https://dev.diiii.xyz' })).toThrow(/refusing/)
    })
    it('the CLI copy and stored-login.mjs agree', () => {
        for (const u of [...ok, ...bad]) expect(storedAllowed(u), u).toBe(devHostAllowed(u))
    })
    it('runSyncPush resolves 1 when the child cannot start', async () => {
        const code = await runSyncPush({ entry: '/x', spaceId: 's', apply: false, home: os.tmpdir(), localBase: 'http://127.0.0.1:1', remote: 'https://dev.diiii.xyz', spawnFn: () => { const c = new EventEmitter(); setImmediate(() => c.emit('error', new Error('spawn ENOENT'))); return c } })
        expect(code).toBe(1)
    })
})
