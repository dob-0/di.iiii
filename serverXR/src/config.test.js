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

    it('internalApiToken: the server calls itself with the admin token when API_TOKEN is absent (the Docker case)', () => {
        withFreshConfig({ REQUIRE_AUTH: 'true', ADMIN_API_TOKEN: 'admin-secret-token', VIEWER_API_TOKEN: 'viewer-secret-token' }, (config) => {
            expect(config.internalApiToken).toBe('admin-secret-token')
        })
    })

    it('internalApiToken: prefers API_TOKEN when it is set, and never a lower-role token', () => {
        withFreshConfig({ REQUIRE_AUTH: 'true', API_TOKEN: 'legacy-admin-token', ADMIN_API_TOKEN: 'admin-secret-token' }, (config) => {
            expect(config.internalApiToken).toBe('legacy-admin-token')
        })
        withFreshConfig({ REQUIRE_AUTH: 'false', EDITOR_API_TOKEN: 'editor-secret-token' }, (config) => {
            expect(config.internalApiToken).toBe('')
        })
    })

    it('prefers AUTH_SESSION_SECRET over any token fallback', () => {
        withFreshConfig({ REQUIRE_AUTH: 'false', AUTH_SESSION_SECRET: 'dedicated-secret', ADMIN_API_TOKEN: 'admin-secret-token' }, (config) => {
            expect(config.auth.sessionSecret).toBe('dedicated-secret')
        })
    })
})

// Regression tests for audit finding #21: oauth.*.enabled only checks
// *_CLIENT_ID, so a half-set provider (ID present, secret missing — e.g.
// docker-compose.yml's ${VAR:-} silently defaulting just the secret half to
// empty) reports as enabled and only fails at actual login time with a
// confusing OAuth error, no signal at startup that anything's wrong.
describe('config: OAuth half-configured provider warning (2026-07-16 audit fix #21)', () => {
    const CONFIG_PATH = require.resolve('./config.js')
    const LOGGER_PATH = require.resolve('./logger.js')
    const ENV_KEYS = ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']
    let savedEnv

    const withFreshConfig = (env, fn) => {
        savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]))
        for (const key of ENV_KEYS) delete process.env[key]
        Object.assign(process.env, env)
        delete require.cache[CONFIG_PATH]
        const logger = require('./logger.js')
        const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {})
        try {
            fn(require('./config.js').config, warnSpy)
        } finally {
            warnSpy.mockRestore()
            for (const key of ENV_KEYS) {
                if (savedEnv[key] === undefined) delete process.env[key]
                else process.env[key] = savedEnv[key]
            }
            delete require.cache[CONFIG_PATH]
            delete require.cache[LOGGER_PATH]
        }
    }

    it('warns when a client id is set with no matching secret', () => {
        withFreshConfig({ GITHUB_CLIENT_ID: 'abc123' }, (config, warnSpy) => {
            expect(config.oauth.github.enabled).toBe(true)
            expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/GITHUB_CLIENT_ID.*GITHUB_CLIENT_SECRET/s))
        })
    })

    it('warns when a client secret is set with no matching id', () => {
        withFreshConfig({ GOOGLE_CLIENT_SECRET: 'shh' }, (config, warnSpy) => {
            expect(config.oauth.google.enabled).toBe(false)
            expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/GOOGLE_CLIENT_ID.*GOOGLE_CLIENT_SECRET/s))
        })
    })

    it('does not warn about OAuth when both id and secret are set', () => {
        withFreshConfig({ GITHUB_CLIENT_ID: 'abc123', GITHUB_CLIENT_SECRET: 'def456' }, (config, warnSpy) => {
            expect(config.oauth.github.enabled).toBe(true)
            expect(warnSpy).not.toHaveBeenCalledWith(expect.stringMatching(/GITHUB_CLIENT_ID.*GITHUB_CLIENT_SECRET/s))
        })
    })

    it('does not warn about OAuth when both id and secret are absent (provider simply disabled)', () => {
        withFreshConfig({}, (config, warnSpy) => {
            expect(config.oauth.github.enabled).toBe(false)
            expect(config.oauth.google.enabled).toBe(false)
            expect(warnSpy).not.toHaveBeenCalledWith(expect.stringMatching(/CLIENT_ID.*CLIENT_SECRET/s))
        })
    })
})

// Regression test for the 2026-07-17 audit: requireAuth/cookieSecure both
// silently default to off unless NODE_ENV is exactly 'production' — a real
// deploy with NODE_ENV merely unset (not misconfigured, just absent) runs
// fully open with no signal at startup. This test only checks the warning
// fires (and doesn't fire when it shouldn't) -- it's not a behavior change.
describe('config: insecure-default warning when NODE_ENV/REQUIRE_AUTH are unset (audit 2026-07-17)', () => {
    const CONFIG_PATH = require.resolve('./config.js')
    const LOGGER_PATH = require.resolve('./logger.js')
    const ENV_KEYS = ['NODE_ENV', 'REQUIRE_AUTH', 'AUTH_SESSION_SECRET', 'ADMIN_API_TOKEN']
    let savedEnv

    const withFreshConfig = (env, fn) => {
        savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]))
        for (const key of ENV_KEYS) delete process.env[key]
        Object.assign(process.env, env)
        delete require.cache[CONFIG_PATH]
        const logger = require('./logger.js')
        const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {})
        try {
            fn(require('./config.js').config, warnSpy)
        } finally {
            warnSpy.mockRestore()
            for (const key of ENV_KEYS) {
                if (savedEnv[key] === undefined) delete process.env[key]
                else process.env[key] = savedEnv[key]
            }
            delete require.cache[CONFIG_PATH]
            delete require.cache[LOGGER_PATH]
        }
    }

    it('warns when NODE_ENV and REQUIRE_AUTH are both unset', () => {
        withFreshConfig({}, (config, warnSpy) => {
            expect(config.requireAuth).toBe(false)
            expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/REQUIRE_AUTH is unset/))
        })
    })

    it('does not warn when REQUIRE_AUTH is explicitly set to false', () => {
        withFreshConfig({ REQUIRE_AUTH: 'false' }, (config, warnSpy) => {
            expect(config.requireAuth).toBe(false)
            expect(warnSpy).not.toHaveBeenCalledWith(expect.stringMatching(/REQUIRE_AUTH is unset/))
        })
    })

    it('does not warn when NODE_ENV=production (requireAuth resolves true)', () => {
        withFreshConfig({ NODE_ENV: 'production', AUTH_SESSION_SECRET: 'dedicated-secret', ADMIN_API_TOKEN: 'admin-secret-token' }, (config, warnSpy) => {
            expect(config.requireAuth).toBe(true)
            expect(warnSpy).not.toHaveBeenCalledWith(expect.stringMatching(/REQUIRE_AUTH is unset/))
        })
    })
})

// A hardened production deploy must not boot with an API bearer token
// standing in as the session-cookie signing key (same weak-fallback class as
// the recurring "value silently degrades instead of failing loudly" bug —
// see docs/ai/known-fixes.md). Non-production keeps the existing warn-only
// behavior so self-host/dev setups aren't broken by this change.
describe('config: hard-fails in production when AUTH_SESSION_SECRET falls back to an API token', () => {
    const CONFIG_PATH = require.resolve('./config.js')
    const LOGGER_PATH = require.resolve('./logger.js')
    const ENV_KEYS = ['NODE_ENV', 'REQUIRE_AUTH', 'AUTH_SESSION_SECRET', 'ADMIN_API_TOKEN']
    let savedEnv

    const withFreshRequire = (env, fn) => {
        savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]))
        for (const key of ENV_KEYS) delete process.env[key]
        Object.assign(process.env, env)
        delete require.cache[CONFIG_PATH]
        const logger = require('./logger.js')
        const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {})
        try {
            fn(warnSpy)
        } finally {
            warnSpy.mockRestore()
            for (const key of ENV_KEYS) {
                if (savedEnv[key] === undefined) delete process.env[key]
                else process.env[key] = savedEnv[key]
            }
            delete require.cache[CONFIG_PATH]
            delete require.cache[LOGGER_PATH]
        }
    }

    it('throws at boot in production when only an API token backs the session secret', () => {
        withFreshRequire({ NODE_ENV: 'production', ADMIN_API_TOKEN: 'admin-secret-token' }, () => {
            expect(() => require('./config.js')).toThrow(/AUTH_SESSION_SECRET is not set/)
        })
    })

    it('still only warns (does not throw) outside production', () => {
        withFreshRequire({ NODE_ENV: 'development', REQUIRE_AUTH: 'true', ADMIN_API_TOKEN: 'admin-secret-token' }, (warnSpy) => {
            expect(() => require('./config.js')).not.toThrow()
            expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/AUTH_SESSION_SECRET is not set/))
        })
    })

    it('does not throw in production when a dedicated AUTH_SESSION_SECRET is set', () => {
        withFreshRequire({ NODE_ENV: 'production', AUTH_SESSION_SECRET: 'dedicated-secret', ADMIN_API_TOKEN: 'admin-secret-token' }, (warnSpy) => {
            expect(() => require('./config.js')).not.toThrow()
            expect(warnSpy).not.toHaveBeenCalledWith(expect.stringMatching(/AUTH_SESSION_SECRET is not set/))
        })
    })
})
