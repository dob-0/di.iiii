import { afterEach, describe, expect, it, vi } from 'vitest'
import { isGraphViewEnabled } from './graphViewFlag.js'

describe('isGraphViewEnabled', () => {
    afterEach(() => {
        vi.unstubAllEnvs()
    })

    it('is enabled under vitest (DEV mode)', () => {
        expect(isGraphViewEnabled()).toBe(true)
    })

    it('is disabled when DEV is false (production build)', () => {
        vi.stubEnv('DEV', false)
        expect(isGraphViewEnabled()).toBe(false)
    })
})
