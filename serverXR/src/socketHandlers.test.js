// @vitest-environment node

import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { getSocketPath } = require('./socketHandlers.js')

describe('getSocketPath', () => {
    it('returns the root socket path when base path is empty', () => {
        expect(getSocketPath('')).toBe('/socket.io')
        expect(getSocketPath('/')).toBe('/socket.io')
    })

    it('appends socket.io to normalized base paths', () => {
        expect(getSocketPath('/serverXR')).toBe('/serverXR/socket.io')
        expect(getSocketPath('custom')).toBe('/custom/socket.io')
        expect(getSocketPath('/nested/app/')).toBe('/nested/app/socket.io')
    })
})
