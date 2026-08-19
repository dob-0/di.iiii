import { getApiSession } from './apiClient.js'

// Any page that renders a live scene without going through AuthGate has no
// session cookie yet on first paint, so the first render kicks one off and
// every later caller shares it.
let guestSessionPromise = null

export const ensureGuestSession = () => {
    if (!guestSessionPromise) {
        // Only a *successful* attempt stays cached. Memoizing a failed one made
        // the "Couldn't load this space → Retry" button permanently useless:
        // every retry awaited the same already-resolved null promise and
        // proceeded without a session cookie, so an auth-required deployment
        // 401'd forever with no recovery short of a full page reload.
        guestSessionPromise = getApiSession().catch(() => {
            guestSessionPromise = null
            return null
        })
    }
    return guestSessionPromise
}

// Test seam only.
export const resetGuestSession = () => {
    guestSessionPromise = null
}
