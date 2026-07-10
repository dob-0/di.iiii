const AUTH_ROLE_LEVELS = Object.freeze({
  guest: 0,
  viewer: 1,
  editor: 2,
  admin: 3
})

const DEFAULT_AUTH_ROLE = 'viewer'

const normalizeAuthRole = (value, fallback = DEFAULT_AUTH_ROLE) => {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized && Object.prototype.hasOwnProperty.call(AUTH_ROLE_LEVELS, normalized)) {
    return normalized
  }
  if (fallback === null) {
    return null
  }
  const normalizedFallback = String(fallback || '').trim().toLowerCase()
  if (normalizedFallback && Object.prototype.hasOwnProperty.call(AUTH_ROLE_LEVELS, normalizedFallback)) {
    return normalizedFallback
  }
  return DEFAULT_AUTH_ROLE
}

const getAuthRoleLevel = (value) => {
  const normalized = normalizeAuthRole(value, null)
  return normalized ? AUTH_ROLE_LEVELS[normalized] : 0
}

const hasRequiredAuthRole = (currentRole, requiredRole = DEFAULT_AUTH_ROLE) => {
  return getAuthRoleLevel(currentRole) >= getAuthRoleLevel(requiredRole)
}

const formatAuthRoleLabel = (value) => {
  const normalized = normalizeAuthRole(value, null)
  if (!normalized) return 'Unknown'
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

const normalizeAuthScopeSpaceId = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase()
  return normalized || ''
}

const normalizeAuthScopeSpaces = (value, fallback = null) => {
  if (value === undefined) return fallback
  if (value === null) return null
  if (Array.isArray(value)) {
    if (value.some(entry => String(entry || '').trim() === '*')) {
      return null
    }
    const normalized = Array.from(new Set(
      value
        .map(entry => normalizeAuthScopeSpaceId(entry))
        .filter(Boolean)
    ))
    return normalized
  }
  const raw = String(value || '').trim()
  if (!raw) return fallback
  if (raw === '*') return null
  return Array.from(new Set(
    raw
      .split(',')
      .map(entry => normalizeAuthScopeSpaceId(entry))
      .filter(Boolean)
  ))
}

const isAuthScopeAllowedForSpace = (spaces, spaceId) => {
  const normalizedSpaceId = normalizeAuthScopeSpaceId(spaceId)
  if (!normalizedSpaceId) return true
  const normalizedSpaces = normalizeAuthScopeSpaces(spaces, null)
  if (normalizedSpaces === null) return true
  return normalizedSpaces.includes(normalizedSpaceId)
}

// The communal open space: one shared world every authenticated session may
// enter and edit. Registered once at boot (and on admin config changes) so the
// grant lives here, next to the rest of the scope logic, instead of being
// minted into every cookie — existing long-lived sessions get it for free.
let communalSpaceId = null
const setCommunalSpaceId = (value) => {
  communalSpaceId = normalizeAuthScopeSpaceId(value) || null
}
const getCommunalSpaceId = () => communalSpaceId

// One sandbox per identity, derived from the subject the same way guest
// sandboxes always were — deterministic, so a returning user reuses the same
// space instead of minting a new one per visit.
const getOwnSandboxSpaceId = (subject) => {
  const cleaned = String(subject || '').replace(/[^a-z0-9]+/gi, '').toLowerCase().slice(0, 16)
  return cleaned ? `sandbox-${cleaned}` : null
}

// Single source of truth for "can this auth state touch this space", used by
// both the HTTP middleware (index.js) and the realtime socket handlers. Takes
// the whole auth-state object so scope logic lives in one place.
const canAccessSpace = (authState, spaceId) => {
  if (authState && authState.isUnrestricted) return true
  const normalizedSpaceId = normalizeAuthScopeSpaceId(spaceId)
  if (authState?.authenticated && normalizedSpaceId) {
    if (communalSpaceId && normalizedSpaceId === communalSpaceId) return true
    // Session identities (accounts and guests) always reach their own sandbox,
    // whether or not the cookie scope mentions it.
    if (authState.type === 'session' || authState.type === 'guest') {
      if (normalizedSpaceId === getOwnSandboxSpaceId(authState.subject)) return true
    }
  }
  const spaces = authState ? authState.spaces : null
  return isAuthScopeAllowedForSpace(spaces, spaceId)
}

// Guest identities live in session cookies like real accounts; the 'guest:'
// subject prefix is the single convention that tells them apart (the client's
// AccountButton relies on it too). Guests never count as owning accounts.
const isGuestSubject = (value) => String(value || '').startsWith('guest:')

const formatAuthScopeLabel = (spaces) => {
  const normalizedSpaces = normalizeAuthScopeSpaces(spaces, null)
  if (normalizedSpaces === null) return 'all spaces'
  if (!normalizedSpaces.length) return 'no spaces'
  return normalizedSpaces.join(', ')
}

module.exports = {
  AUTH_ROLE_LEVELS,
  DEFAULT_AUTH_ROLE,
  canAccessSpace,
  getCommunalSpaceId,
  getOwnSandboxSpaceId,
  setCommunalSpaceId,
  formatAuthScopeLabel,
  formatAuthRoleLabel,
  getAuthRoleLevel,
  hasRequiredAuthRole,
  isAuthScopeAllowedForSpace,
  isGuestSubject,
  normalizeAuthRole,
  normalizeAuthScopeSpaceId,
  normalizeAuthScopeSpaces
}
