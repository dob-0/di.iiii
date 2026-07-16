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

// config.js reads process.env at module-load time (top-level consts), so
// these tests mutate env, force a fresh require (bypassing require()'s
// module cache), and restore both afterward.
describe('config: auth session secret fallback (2026-07-16 audit fix #7)', () => {
    const CONFIG_PATH = require.resolve('./config.js')
    const ENV_KEYS = [
        'NODE_ENV', 'REQUIRE_AUTH', 'AUTH_SESSION_SECRET', 'API_TOKEN', 'SERVERXR_API_TOKEN',
        'ADMIN_API_TOKEN', 'EDITOR_API_TOKEN', 'VIEWER_API_TOKEN', 'AUTH_IDENTITIES'
    ]
    let savedEnv

    const withFreshConfig = (env, fn) => {
        savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]))
        for (const key of ENV_KEYS) delete process.env[key]
        Object.assign(process.env, env)
        delete require.cache[CONFIG_PATH]
        try {
            fn(require('./config.js').config)
        } finally {
            for (const key of ENV_KEYS) {
                if (savedEnv[key] === undefined) delete process.env[key]
                else process.env[key] = savedEnv[key]
            }
            delete require.cache[CONFIG_PATH]
        }
    }

    it('never uses a viewer-only token as the session-signing secret — a self-host with only VIEWER_API_TOKEN set gets no fallback at all', () => {
        withFreshConfig({ REQUIRE_AUTH: 'false', VIEWER_API_TOKEN: 'viewer-secret-token' }, (config) => {
            expect(config.auth.sessionSecret).not.toBe('viewer-secret-token')
            expect(config.auth.sessionSecret).toBe('')
        })
    })

    it('never uses an editor-only token as the session-signing secret either', () => {
        withFreshConfig({ REQUIRE_AUTH: 'false', EDITOR_API_TOKEN: 'editor-secret-token' }, (config) => {
            expect(config.auth.sessionSecret).not.toBe('editor-secret-token')
            expect(config.auth.sessionSecret).toBe('')
        })
    })

    it('falls back to an admin-role token when no AUTH_SESSION_SECRET/API_TOKEN is set', () => {
        withFreshConfig({ REQUIRE_AUTH: 'false', ADMIN_API_TOKEN: 'admin-secret-token', VIEWER_API_TOKEN: 'viewer-secret-token' }, (config) => {
            expect(config.auth.sessionSecret).toBe('admin-secret-token')
        })
    })

    it('prefers AUTH_SESSION_SECRET over any token fallback', () => {
        withFreshConfig({ REQUIRE_AUTH: 'false', AUTH_SESSION_SECRET: 'dedicated-secret', ADMIN_API_TOKEN: 'admin-secret-token' }, (config) => {
            expect(config.auth.sessionSecret).toBe('dedicated-secret')
        })
    })
})
