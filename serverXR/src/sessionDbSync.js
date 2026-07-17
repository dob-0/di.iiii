// Session role/scope was previously trusted straight from the signed cookie
// on every gated request -- a DB-side role/space revocation only took effect
// once the client happened to hit GET /api/auth/session (which already did
// this exact re-sync, just there only). Re-checking the DB on literally
// every request would be wasteful (findUserById is a real query, even
// though node:sqlite makes it synchronous); this caches the DB identity per
// subject for `recheckMs` so a revocation propagates within that window
// instead of only at next full cookie refresh (audit 2026-07-17).
function createSessionDbSync({ findUserById, normalizeAuthRole, recheckMs = 60_000, now = () => Date.now() }) {
  const cache = new Map()

  const getFreshDbIdentity = (subject) => {
    const cached = cache.get(subject)
    if (cached && now() - cached.checkedAt < recheckMs) return cached.fresh

    let fresh = null
    try {
      const dbUser = findUserById(subject)
      if (dbUser) {
        fresh = {
          dbRole: normalizeAuthRole(dbUser.role, null),
          dbSpaces: Array.isArray(dbUser.spaces) ? dbUser.spaces : [],
          dbUnrestricted: Boolean(dbUser.isUnrestricted)
        }
      }
    } catch { /* non-fatal — keep serving the cookie's own state */ }
    // Cache even a miss (fresh === null) so a guest/legacy subject with no
    // DB row doesn't re-query on every request either -- just no override.
    cache.set(subject, { fresh, checkedAt: now() })
    return fresh
  }

  return { getFreshDbIdentity }
}

module.exports = { createSessionDbSync }
