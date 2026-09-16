import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT = path.join(ROOT_DIR, 'scripts', 'data-cleanup.mjs')
const source = fs.readFileSync(SCRIPT, 'utf8')

// This script deletes spaces and projects. The label in a plan file is not
// evidence of where the deletion lands: `LIVE_API_URL` means the dev tier in
// serverXR/.env.local but PRODUCTION to space-code-push.mjs and space-sync.mjs,
// so a plan saying "dev" could resolve to the live site and delete there —
// and the old confirmation gate keyed off the label, so it never fired.

describe('data-cleanup keys its production gate off the resolved host', () => {
    it('does not gate the apply path on the plan label alone', () => {
        // `if (apply && plan.env === 'prod')` was the whole guard. A plan
        // labelled "dev" that resolved to production skipped it entirely.
        expect(source).not.toMatch(/if\s*\(\s*apply\s*&&\s*plan\.env\s*===\s*'prod'\s*\)/)
    })

    it('derives the target from the URL that was actually resolved', () => {
        expect(source).toMatch(/new URL\(tgt\.base\)\.hostname/)
        expect(source).toMatch(/targetsProduction/)
        expect(source).toMatch(/if\s*\(\s*apply\s*&&\s*targetsProduction\s*\)/)
    })

    it('treats anything that is not localhost or a dev-tier host as production', () => {
        // Fail closed: an unrecognised host is production, not "probably fine".
        // The dev tier is dev.diiii.xyz exactly (not any dev.* host, and no
        // staging.* host — that name is switched off).
        expect(source).toMatch(/host === 'dev\.diiii\.xyz'/)
        expect(source).not.toMatch(/startsWith\('staging\.'\)/)
        expect(source).toMatch(/!isLocalHost\s*&&\s*!isDevTierHost/)
    })

    it('keys the dev tier "dev" and refuses the old "staging" plan env', () => {
        expect(source).toMatch(/^\s*dev: \{/m)
        expect(source).not.toMatch(/^\s*staging: \{/m)
        expect(source).toMatch(/plan\.env === 'staging'.*"staging" is now "dev"/)
    })

    it('prefers DEV_* over the ambiguous LIVE_* alias', () => {
        expect(source).toMatch(/env\.DEV_API_URL\s*\|\|\s*env\.LIVE_API_URL/)
        expect(source).toMatch(/env\.DEV_API_TOKEN\s*\|\|\s*env\.LIVE_API_TOKEN/)
    })
})
