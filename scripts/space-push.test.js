import { execFile } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { isProductionTarget } from './space-push.mjs'

const execFileAsync = promisify(execFile)
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT = path.join(ROOT_DIR, 'scripts', 'space-push.mjs')

describe('space-push production guard', () => {
    // This script's built-in fallback IS production, and the root .env sets
    // LIVE_API_URL to production while .env.local overrides it to staging. One
    // lost line in an untracked file turned a routine push into a live one, and
    // the only thing standing in the way was remembering to pass --dry-run.

    it('recognises the production host and nothing else', () => {
        expect(isProductionTarget('https://di-studio.xyz/serverXR')).toBe(true)
        expect(isProductionTarget('https://www.di-studio.xyz/serverXR')).toBe(true)
        expect(isProductionTarget('https://staging.di-studio.xyz/serverXR')).toBe(false)
        expect(isProductionTarget('http://localhost:4000/serverXR')).toBe(false)
        expect(isProductionTarget('not-a-url')).toBe(false)
    })

    it('refuses a production target inherited from the environment', async () => {
        const run = execFileAsync(process.execPath, [SCRIPT, 'wcc'], {
            cwd: ROOT_DIR,
            env: { ...process.env, LIVE_API_URL: 'https://di-studio.xyz/serverXR', LIVE_API_TOKEN: 'x' },
        })
        await expect(run).rejects.toMatchObject({ code: 1 })
        const { stderr } = await run.catch((e) => e)
        expect(stderr).toContain('Refusing to push to PRODUCTION')
        expect(stderr).toContain('Nothing was read or written')
    })

    it('allows production when it is named on the command line', async () => {
        // --to is the person saying it out loud. The push still fails later
        // (no such local scene / no real token), which is fine — what matters
        // is that it got past the guard rather than being refused by it.
        const { stderr } = await execFileAsync(
            process.execPath,
            [SCRIPT, 'definitely-not-a-real-space', '--to', 'https://di-studio.xyz/serverXR', '--dry-run'],
            { cwd: ROOT_DIR, env: { ...process.env, LIVE_API_TOKEN: 'x' } }
        ).catch((e) => e)
        expect(stderr || '').not.toContain('Refusing to push to PRODUCTION')
    })

    it('does not refuse staging', async () => {
        const { stderr } = await execFileAsync(
            process.execPath,
            [SCRIPT, 'definitely-not-a-real-space', '--dry-run'],
            {
                cwd: ROOT_DIR,
                env: { ...process.env, LIVE_API_URL: 'https://staging.di-studio.xyz/serverXR', LIVE_API_TOKEN: 'x' },
            }
        ).catch((e) => e)
        expect(stderr || '').not.toContain('Refusing to push to PRODUCTION')
    })
})
