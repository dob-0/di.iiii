// "Is this space inside this session's scope?" — the browser's reading of the
// server's rule, and it must be the SAME rule. Scope only: like the server's
// guards, a caller that means "can work here" also checks the session is
// signed in (and its role) before asking this.
//
// The server decides in serverXR/src/authAccess.js `canAccessSpace`, and that
// rule has two grants that never appear in the cookie's space list: the
// communal open space (any signed-in session) and the session's own sandbox
// (derived from its subject). The session reply sends them as `openSpaceId`
// and `sandboxSpaceId` instead. A guest's list happens to contain both, so a
// gate that only read `spaces.includes(id)` looked right for guests — and
// locked every brand-new account (spaces: []) out of the sandbox its guest
// work had just been carried into, and out of the Open Space, while the
// server answered 200 to both.
//
// sessionScope.test.js runs this against the server's own function over the
// same states, so the two cannot drift apart again. Nothing here may be wider
// than the server: a gate that opens where the server refuses is an editor
// that fails on every save.
const normalizeId = (value) => String(value || '').trim().toLowerCase()

export const isSpaceInSessionScope = (session, spaceId) => {
    const id = normalizeId(spaceId)
    if (!id) return true
    if (session?.isUnrestricted) return true
    if (session?.authenticated) {
        if (session.openSpaceId && id === normalizeId(session.openSpaceId)) return true
        // The server only reports a sandbox for guest and account sessions —
        // the same two types its own-sandbox grant covers.
        if (session.sandboxSpaceId && id === normalizeId(session.sandboxSpaceId)) return true
    }
    // Same shapes the server's normalizeAuthScopeSpaces accepts: an array, or a
    // comma-separated string. No list at all is the server's "every space" (an
    // unrestricted token), and so is a '*' entry.
    const raw = session?.spaces
    const spaces = typeof raw === 'string' && raw.trim() ? raw.split(',') : raw
    if (!Array.isArray(spaces)) return true
    if (spaces.some((entry) => String(entry || '').trim() === '*')) return true
    return spaces.some((entry) => normalizeId(entry) === id)
}
