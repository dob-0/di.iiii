// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { isSpaceInSessionScope } from './sessionScope.js'

// The server's own rule, not a copy of it.
const require = createRequire(import.meta.url)
const {
    canAccessSpace,
    getOwnSandboxSpaceId,
    setCommunalSpaceId,
    getCommunalSpaceId
} = require('../../serverXR/src/authAccess.js')

// What GET /api/auth/session sends the browser for a given server auth state
// (serverXR/src/index.js): the scope list as-is, plus the two implicit grants
// as separate fields — the sandbox only for guest and account sessions.
const sessionReplyFor = (state) => ({
    authenticated: Boolean(state.authenticated),
    type: state.type,
    spaces: state.spaces,
    isUnrestricted: Boolean(state.isUnrestricted),
    openSpaceId: getCommunalSpaceId(),
    sandboxSpaceId: state.authenticated && (state.type === 'guest' || state.type === 'session')
        ? getOwnSandboxSpaceId(state.subject)
        : null
})

const ACCOUNT_ID = '22b50e95-3822-40d7-99c2-3535f92123be'
const GUEST_ID = 'guest:b7230000-1111-2222-3333-444455556666'

const STATES = {
    // The bug: a brand-new account is scoped to nothing.
    freshAccount: { authenticated: true, type: 'session', role: 'editor', subject: ACCOUNT_ID, spaces: [] },
    scopedAccount: { authenticated: true, type: 'session', role: 'editor', subject: ACCOUNT_ID, spaces: ['main', 'imported'] },
    guest: {
        authenticated: true, type: 'guest', role: 'editor', subject: GUEST_ID,
        spaces: ['open', getOwnSandboxSpaceId(GUEST_ID)]
    },
    unrestricted: { authenticated: true, type: 'session', role: 'admin', subject: 'admin-1', spaces: null, isUnrestricted: true },
    wildcardToken: { authenticated: true, type: 'token', role: 'editor', subject: 'editor-token', spaces: ['*'] },
    scopedToken: { authenticated: true, type: 'token', role: 'editor', subject: 'editor-token', spaces: ['main'] },
    signedOut: { authenticated: false, type: null, role: null, subject: null, spaces: [] }
}

const SPACE_IDS = [
    'open',
    'main',
    'imported',
    'secret',
    getOwnSandboxSpaceId(ACCOUNT_ID),
    getOwnSandboxSpaceId(GUEST_ID),
    getOwnSandboxSpaceId('someone-else-entirely'),
    'sandbox-editortoken'
]

describe('the browser reads space scope exactly the way the server does', () => {
    setCommunalSpaceId('open')

    for (const [name, state] of Object.entries(STATES)) {
        it(`agrees with canAccessSpace for ${name}`, () => {
            const reply = sessionReplyFor(state)
            for (const spaceId of SPACE_IDS) {
                expect(
                    { spaceId, client: isSpaceInSessionScope(reply, spaceId) },
                    `${name} → ${spaceId}`
                ).toEqual({ spaceId, client: canAccessSpace(state, spaceId) })
            }
        })
    }

    it('lets a brand-new account into its own sandbox and the Open Space, and nowhere else', () => {
        const reply = sessionReplyFor(STATES.freshAccount)
        expect(isSpaceInSessionScope(reply, getOwnSandboxSpaceId(ACCOUNT_ID))).toBe(true)
        expect(isSpaceInSessionScope(reply, 'open')).toBe(true)
        expect(isSpaceInSessionScope(reply, 'main')).toBe(false)
        // The guest sandbox it came from is not its own any more.
        expect(isSpaceInSessionScope(reply, getOwnSandboxSpaceId(GUEST_ID))).toBe(false)
        expect(isSpaceInSessionScope(reply, getOwnSandboxSpaceId('someone-else-entirely'))).toBe(false)
    })
})
