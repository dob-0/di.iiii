// @vitest-environment node

import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { getSocketPath, applyFreshDbIdentity } = require('./socketHandlers.js')

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

// A socket's io.use middleware resolves authState once, at connect. HTTP
// requests re-check role/spaces/isUnrestricted against the DB on every
// request (readAuthSession -> getFreshDbIdentity); without this, an admin
// downgrading a user's role or revoking their space scope mid-session never
// reaches an already-open tab's live socket connection — it keeps
// broadcasting/receiving scene, cursor and chat events for a space it was
// just cut off from, for as long as the connection stays open.
describe('applyFreshDbIdentity', () => {
    it('overrides a stale session authState with the current DB role/spaces/isUnrestricted', () => {
        const stale = {
            authenticated: true,
            type: 'session',
            role: 'editor',
            subject: 'user-1',
            spaces: ['wcc'],
            isUnrestricted: false
        }
        const config = {
            getFreshDbIdentity: (subject) => {
                expect(subject).toBe('user-1')
                return { dbRole: 'viewer', dbSpaces: [], dbUnrestricted: false }
            }
        }
        const next = applyFreshDbIdentity(stale, config)
        expect(next.role).toBe('viewer')
        expect(next.spaces).toEqual([])
        expect(next.isUnrestricted).toBe(false)
    })

    it('leaves authState untouched when the DB has no row for the subject (guest/token identity)', () => {
        const stale = { authenticated: true, type: 'session', role: 'editor', subject: 'guest:abc', spaces: null }
        const config = { getFreshDbIdentity: () => null }
        expect(applyFreshDbIdentity(stale, config)).toBe(stale)
    })

    it('is a no-op when the connection config has no DB lookup wired up', () => {
        const stale = { authenticated: true, type: 'session', role: 'editor', subject: 'user-1', spaces: null }
        expect(applyFreshDbIdentity(stale, {})).toBe(stale)
    })
})
