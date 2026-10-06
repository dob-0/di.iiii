import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const dir = path.dirname(fileURLToPath(import.meta.url))
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8')

// One variable, one tier: scripts that mean the dev tier read DEV_API_* first and
// keep LIVE_API_* only as the legacy alias, so an env file can migrate without a
// flag day. Source-level, same style as data-cleanup.test.js.
describe('dev-tier scripts read DEV_API_* before the legacy LIVE_API_* alias', () => {
    it.each([
        ['dev-stack.mjs', /env\.DEV_API_URL\s*\|\|\s*env\.LIVE_API_URL/],
        ['promote-space-projects.mjs', /getEnv\('DEV_API_URL'\)\s*\|\|\s*getEnv\('LIVE_API_URL'\)/],
        ['push-space-projects.mjs', /getEnv\('DEV_API_URL'\)\s*\|\|\s*getEnv\('LIVE_API_URL'\)/],
        ['local-mirror.mjs', /urlEnv: 'DEV_API_URL'.*legacyUrlEnv: 'LIVE_API_URL'/],
        ['data-inventory.mjs', /'DEV_API_URL', 'DEV_API_TOKEN'/],
    ])('%s', (file, pattern) => {
        expect(read(file)).toMatch(pattern)
    })
})
