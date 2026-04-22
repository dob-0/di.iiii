const AUTH_ROLE_LEVELS = Object.freeze({
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

const formatAuthScopeLabel = (spaces) => {
  const normalizedSpaces = normalizeAuthScopeSpaces(spaces, null)
  if (normalizedSpaces === null) return 'all spaces'
  if (!normalizedSpaces.length) return 'no spaces'
  return normalizedSpaces.join(', ')
}

module.exports = {
  AUTH_ROLE_LEVELS,
  DEFAULT_AUTH_ROLE,
  formatAuthScopeLabel,
  formatAuthRoleLabel,
  getAuthRoleLevel,
  hasRequiredAuthRole,
  isAuthScopeAllowedForSpace,
  normalizeAuthRole,
  normalizeAuthScopeSpaceId,
  normalizeAuthScopeSpaces
}
