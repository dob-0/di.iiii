import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { SPACE_BLURB_MAX } from './spaceBlurb.js'

const server = createRequire(import.meta.url)('../../../shared/spaceBlurb.cjs')

describe('the blurb limit', () => {
    it('is the same number in the browser and on the server', () => {
        expect(SPACE_BLURB_MAX).toBe(server.SPACE_BLURB_MAX)
    })
})
