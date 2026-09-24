import { execFile } from 'node:child_process'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { isProductionTarget } from './space-push.mjs'

const execFileAsync = promisify(execFile)
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT = path.join(ROOT_DIR, 'scripts', 'space-push.mjs')

// A tiny stand-in for a live server's scene endpoint — this is the "test with
// mocks" the task's constraints ask for in place of ever writing to a real
// dev/prod tier. `onScene` answers GET (?verbatim=1) with the current stored
// version; `onPut` answers PUT and decides ok/409.
const startFakeTier = ({ version, putStatus = 200, putBody = { ok: true } }) => {
    const server = http.createServer((req, res) => {
        res.setHeader('Content-Type', 'application/json')
        if (req.method === 'GET') {
            res.end(JSON.stringify({ scene: { objects: [], assets: [] }, version }))
            return
        }
        if (req.method === 'PUT') {
            req.resume()
            req.on('end', () => {
                res.statusCode = putStatus
                res.end(JSON.stringify(putBody))
            })
            return
        }
        res.statusCode = 404
        res.end('{}')
    })
    return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({
        server,
        url: `http://127.0.0.1:${server.address().port}`,
        close: () => server.close()
    })))
}

describe('space-push production guard', () => {
    // This script's built-in fallback IS production, and the root .env sets
    // LIVE_API_URL to production while .env.local overrides it to the dev tier. One
    // lost line in an untracked file turned a routine push into a live one, and
    // the only thing standing in the way was remembering to pass --dry-run.

    it('recognises the production host and nothing else', () => {
        expect(isProductionTarget('https://di-studio.xyz/serverXR')).toBe(true)
        expect(isProductionTarget('https://www.di-studio.xyz/serverXR')).toBe(true)
        expect(isProductionTarget('https://diiii.xyz/serverXR')).toBe(true)
        expect(isProductionTarget('https://dev.diiii.xyz/serverXR')).toBe(false)
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

    it('does not refuse the dev tier', async () => {
        const { stderr } = await execFileAsync(
            process.execPath,
            [SCRIPT, 'definitely-not-a-real-space', '--dry-run'],
            {
                cwd: ROOT_DIR,
                env: { ...process.env, LIVE_API_URL: 'https://dev.diiii.xyz/serverXR', LIVE_API_TOKEN: 'x' },
            }
        ).catch((e) => e)
        expect(stderr || '').not.toContain('Refusing to push to PRODUCTION')
    })
})

describe('space-push stale-destination guard', () => {
    // No spaces/<id>/scene.json exists for this made-up id, so the script
    // falls back to reading the scene (and its version) from a "local"
    // server — the --from tier here is a fake standing in for that, never a
    // real dev/prod tier.
    const run = (extraArgs, env) => execFileAsync(process.execPath,
        [SCRIPT, 'definitely-not-a-real-space', ...extraArgs],
        { cwd: ROOT_DIR, env: { ...process.env, ...env } })

    it('refuses when the destination has moved past the version this scene was based on', async () => {
        const local = await startFakeTier({ version: 3 })
        const dest = await startFakeTier({ version: 5 }) // someone else pushed since v3
        const err = await run(['--from', local.url, '--to', dest.url, '--token', 'x']).catch((e) => e)
        local.close(); dest.close()
        expect(err.code).toBe(1)
        expect(err.stderr).toContain('Refusing to push')
        expect(err.stderr).toContain('v5')
        expect(err.stderr).toContain('this scene is based on v3')
        expect(err.stderr).toContain('space-pull.mjs')
    })

    it('pushes when the destination is exactly where this scene left it', async () => {
        const local = await startFakeTier({ version: 3 })
        const dest = await startFakeTier({ version: 3 })
        const { stdout } = await run(['--from', local.url, '--to', dest.url, '--token', 'x'])
        local.close(); dest.close()
        expect(stdout).toContain('ok — scene pushed to live')
    })

    it('--force overwrites a destination that moved', async () => {
        const local = await startFakeTier({ version: 3 })
        const dest = await startFakeTier({ version: 5 })
        const { stdout, stderr } = await run(['--from', local.url, '--to', dest.url, '--token', 'x', '--force'])
        local.close(); dest.close()
        expect(stderr).toContain('--force: pushing anyway')
        expect(stdout).toContain('ok — scene pushed to live')
    })

    it('refuses on a 409 the server itself catches (a change landing mid-request)', async () => {
        const local = await startFakeTier({ version: 3 })
        const dest = await startFakeTier({ version: 3, putStatus: 409, putBody: { latestVersion: 9 } })
        const err = await run(['--from', local.url, '--to', dest.url, '--token', 'x']).catch((e) => e)
        local.close(); dest.close()
        expect(err.code).toBe(1)
        expect(err.stderr).toContain('destination moved to v9')
    })

    it('does not refuse a brand-new destination space (nothing to be stale relative to)', async () => {
        const local = await startFakeTier({ version: 0 })
        const server = http.createServer((req, res) => {
            if (req.method === 'GET') { res.statusCode = 404; res.end('{}'); return }
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true }))
        })
        await new Promise((r) => server.listen(0, '127.0.0.1', r))
        const destUrl = `http://127.0.0.1:${server.address().port}`
        const { stdout } = await run(['--from', local.url, '--to', destUrl, '--token', 'x'])
        local.close(); server.close()
        expect(stdout).toContain('ok — scene pushed to live')
    })
})
