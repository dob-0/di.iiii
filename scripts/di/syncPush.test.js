import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { devBase, findTierSync, pushArgs, pushEnv, readAdminToken } from './syncPush.mjs'

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
