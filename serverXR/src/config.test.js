// @vitest-environment node

import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { isCorsOriginAllowed } = require('./config.js')

describe('isCorsOriginAllowed', () => {
    it('allows any origin when wildcard is configured', () => {
        expect(isCorsOriginAllowed('http://localhost:5173', ['*'], 'development')).toBe(true)
        expect(isCorsOriginAllowed('https://example.com', ['*'], 'production')).toBe(true)
    })

    it('allows explicit configured origins', () => {
        expect(
            isCorsOriginAllowed(
                'http://localhost:5173',
                ['http://localhost:5173', 'http://127.0.0.1:5173'],
                'development'
            )
        ).toBe(true)
        expect(
            isCorsOriginAllowed(
                'http://localhost:4173',
                ['http://localhost:5173', 'http://127.0.0.1:5173'],
                'development'
            )
        ).toBe(false)
    })

    it('allows any origin in non-production when no allowlist is configured', () => {
        expect(isCorsOriginAllowed('http://localhost:5173', [], 'development')).toBe(true)
    })

    it('blocks foreign origins in production when no allowlist is configured', () => {
        expect(isCorsOriginAllowed('http://localhost:5173', [], 'production')).toBe(false)
    })
})
