import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readToken } from './api.mjs'

// copy_project.mjs --to-token-key reads another tier's token by its own key (2026-10-15).
describe('readToken keys', () => {
    afterEach(() => vi.unstubAllEnvs())
    const envFile = () => {
        const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'read-token-')), 'env')
        fs.writeFileSync(file, 'LIVE_API_TOKEN=tier-token\n')
        return file
    }
    it('reads the key it is given from the token file', () => {
        vi.stubEnv('DI_API_TOKEN', '')
        expect(readToken(envFile(), ['LIVE_API_TOKEN'])).toBe('tier-token')
    })
    it('does not take another tier\'s key as the default token', () => {
        vi.stubEnv('DI_API_TOKEN', '')
        expect(readToken(envFile())).not.toBe('tier-token')
    })
})
