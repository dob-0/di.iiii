// @vitest-environment node

import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { buildAuthUrl, DRIVE_SCOPE } = require('./googleOAuth.js')

describe('buildAuthUrl', () => {
    it('requests offline Drive consent with the right params', () => {
        const url = new URL(buildAuthUrl({
            clientId: 'cid.apps.googleusercontent.com',
            redirectUri: 'https://di-studio.xyz/serverXR/api/integrations/google-drive/callback',
            state: 'signed-state'
        }))
        const p = url.searchParams
        expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
        expect(p.get('client_id')).toBe('cid.apps.googleusercontent.com')
        expect(p.get('response_type')).toBe('code')
        expect(p.get('access_type')).toBe('offline')
        expect(p.get('prompt')).toBe('consent')
        expect(p.get('state')).toBe('signed-state')
        expect(p.get('scope')).toContain(DRIVE_SCOPE)
        expect(p.get('redirect_uri')).toContain('/api/integrations/google-drive/callback')
    })
})
