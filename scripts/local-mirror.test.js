import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseArgs, isSandbox, loadEnvFile, SPACE_FIELDS, TIERS } from './local-mirror.mjs'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MIRROR = fs.readFileSync(path.join(ROOT_DIR, 'scripts', 'local-mirror.mjs'), 'utf8')
const PROJECT_PULL = fs.readFileSync(path.join(ROOT_DIR, 'scripts', 'project-pull.mjs'), 'utf8')

describe('local-mirror', () => {
    // Every guard below is a failure that actually happened while the dev box
    // sat five spaces behind production.

    it('does not mirror kind or permanent', () => {
        // Production reports the open space as kind "normal" while a local
        // install builds it as "global" at boot. Copying prod's value across
        // demotes the local open space to fix drift that belongs to the other
        // tier. Structure is each install's own; content is what we mirror.
        expect(SPACE_FIELDS).not.toContain('kind')
        expect(SPACE_FIELDS).not.toContain('permanent')
    })

    it('mirrors isPublic', () => {
        // POST /api/spaces cannot set it, so a space created without the
        // follow-up PATCH exists in the DB and appears to nobody — which is
        // indistinguishable from the bug this script exists to end.
        expect(SPACE_FIELDS).toContain('isPublic')
    })

    it('keeps existing local projects unless --force', () => {
        expect(parseArgs([]).force).toBe(false)
        expect(parseArgs(['--force']).force).toBe(true)
    })

    it('never deletes', () => {
        expect(/method:\s*'DELETE'/.test(MIRROR)).toBe(false)
    })

    it('skips sandboxes', () => {
        // Per-identity scratch space, provisioned lazily per session; another
        // install's sandbox means nothing here.
        expect(isSandbox('sandbox-d5e851f9d8284645')).toBe(true)
        expect(isSandbox('main')).toBe(false)
    })

    it('walks both tiers by default, production first', () => {
        // `dilijan` was built on staging and never promoted. A prod-only
        // mirror leaves it out and nothing reports the miss — the space simply
        // is not there, which reads as "the tool worked".
        expect(parseArgs([]).tier).toBe('all')
        expect(Object.keys(TIERS)).toEqual(['prod', 'dev'])
    })

    it('names the dev tier dev and refuses the old staging key', () => {
        expect(parseArgs(['--tier', 'dev']).tier).toBe('dev')
        expect(() => parseArgs(['--tier', 'staging'])).toThrow('"staging" is now "dev"')
        expect(parseArgs(['--tier', 'prod']).tier).toBe('prod')
        expect(TIERS.dev.fallbackUrl).toBe('https://dev.diiii.xyz/serverXR')
    })

    it('ignores empty env assignments so a placeholder cannot blank a real token', () => {
        // The root .env carries `LIVE_API_TOKEN=` with nothing after it and is
        // merged last. Honouring it wiped the real token from
        // serverXR/.env.local, and the only symptom was staging answering with
        // public spaces only — no error, just less.
        const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-env-')), '.env')
        fs.writeFileSync(file, 'REAL=value\nBLANK=\nQUOTED="v2"\n')
        const env = loadEnvFile(file)
        return env.then((parsed) => {
            expect(parsed.REAL).toBe('value')
            expect(parsed.QUOTED).toBe('v2')
            expect('BLANK' in parsed).toBe(false)
        })
    })

    it('reports a failed pull from stderr, not from progress chatter', () => {
        // project-pull prints its progress on stdout and its errors on stderr.
        // Reading the last stdout line reported a 401 as "0 objects, 0 assets".
        expect(MIRROR).toMatch(/error\.stderr/)
    })
})

describe('project-pull local authentication', () => {
    it('has no unauthenticated call to the local server', () => {
        // REQUIRE_AUTH=true is normal on a dev box, and every local call here
        // used to go out with no Authorization header — so each write 401'd
        // and the space existence check could not tell "not here yet" from
        // "here but private".
        const localCalls = PROJECT_PULL.split('\n').filter((line) => line.includes('${toBase}'))
        expect(localCalls.length).toBeGreaterThan(0)
        expect(PROJECT_PULL).not.toMatch(/headers:\s*buildHeaders\(\),/)
    })

    it('reads API_TOKEN from serverXR/.env.local', () => {
        // The root env files carry live-tier settings only; the local server's
        // own token lives with the server.
        expect(PROJECT_PULL).toMatch(/serverXR', '\.env\.local'/)
        expect(PROJECT_PULL).toMatch(/getEnv\('API_TOKEN'\)/)
    })

    it('merges serverXR/.env.local LAST in every script that reads the root .env too', () => {
        // The root .env is general and can go stale: on 2026-09-21 it carried
        // LOCAL_API_URL=http://localhost:4000/serverXR on a machine whose install
        // answered on https://local.thedi.studio. Five scripts merged it AFTER
        // serverXR/.env.local, so the stale line won, and start-check reported the
        // content line as "not checked" for a week while looking healthy. The
        // empty-value guard above cannot catch a wrong NON-empty value; only the
        // order can. Most specific file wins.
        for (const name of ['start-check', 'local-mirror', 'project-pull', 'space-push', 'space-pull']) {
            const source = fs.readFileSync(path.join(ROOT_DIR, 'scripts', `${name}.mjs`), 'utf8')
            const rootEnv = source.indexOf("path.join(ROOT_DIR, '.env')")
            const serverLocal = source.indexOf("path.join(ROOT_DIR, 'serverXR', '.env.local')")
            expect(rootEnv, `${name}: root .env read`).toBeGreaterThan(-1)
            expect(serverLocal, `${name}: serverXR/.env.local read`).toBeGreaterThan(-1)
            expect(serverLocal, `${name}: serverXR/.env.local must merge after root .env`).toBeGreaterThan(rootEnv)
        }
    })
})
