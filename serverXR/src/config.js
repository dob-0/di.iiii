const path = require('node:path')
const { URL } = require('node:url')
const { normalizeAuthRole, normalizeAuthScopeSpaces } = require('./authAccess')

const normalizeBasePath = (value) => {
  if (!value) return ''
  const trimmed = String(value).trim()
  if (!trimmed || trimmed === '/') return ''
  return `/${trimmed.replace(/^\/+|\/+$/g, '')}`
}

const parseList = (value) => {
  if (!value) return []
  return String(value)
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean)
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1'])

const expandLoopbackOrigins = (origins = []) => {
  const expanded = new Set()

  origins.forEach((origin) => {
    if (!origin) return
    expanded.add(origin)
    try {
      const url = new URL(origin)
      if (!LOOPBACK_HOSTS.has(url.hostname)) return
      const alternate = new URL(origin)
      alternate.hostname = url.hostname === 'localhost' ? '127.0.0.1' : 'localhost'
      expanded.add(alternate.origin)
    } catch {
      // Ignore malformed CORS origins and keep the configured value unchanged.
    }
  })

  return Array.from(expanded)
}

const parseBool = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback
  return String(value).toLowerCase() === 'true'
}

const isCorsOriginAllowed = (origin, corsOrigins = [], nodeEnv = process.env.NODE_ENV || '') => {
  if (!origin) return true
  if (corsOrigins.includes('*')) return true
  if (!corsOrigins.length) {
    return String(nodeEnv).toLowerCase() !== 'production'
  }
  return corsOrigins.includes(origin)
}

const buildCorsOriginHandler = (corsOrigins = [], nodeEnv = process.env.NODE_ENV || '') => {
  return (origin, callback) => {
    callback(null, isCorsOriginAllowed(origin, corsOrigins, nodeEnv))
  }
}

const parseNumber = (value, fallback) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

const parseJson = (value, fallback = null) => {
  if (!value) return fallback
  try {
    return JSON.parse(String(value))
  } catch {
    return fallback
  }
}

const resolveDir = (inputPath, fallback) => {
  if (!inputPath) return fallback
  if (path.isAbsolute(inputPath)) return inputPath
  return path.resolve(ROOT_DIR, inputPath)
}

const normalizeIdentityText = (value = '') => {
  const normalized = String(value || '').trim()
  return normalized || null
}

const buildAuthIdentity = (rawValue, {
  role = 'viewer',
  subject = '',
  label = '',
  spaces = undefined
} = {}) => {
  const raw = typeof rawValue === 'string'
    ? { token: rawValue }
    : (rawValue && typeof rawValue === 'object' ? rawValue : null)
  const token = String(raw?.token || '').trim()
  if (!token) return null
  const normalizedRole = normalizeAuthRole(raw?.role, role)
  const normalizedSubject = normalizeIdentityText(raw?.subject || raw?.id || subject || raw?.label || normalizedRole)
  const normalizedLabel = normalizeIdentityText(raw?.label || label || normalizedSubject)
  const normalizedSpaces = normalizeAuthScopeSpaces(
    raw?.spaces ?? raw?.spaceIds ?? raw?.allowedSpaces,
    spaces
  )
  return {
    token,
    role: normalizedRole,
    subject: normalizedSubject || normalizedRole,
    label: normalizedLabel,
    spaces: normalizedSpaces
  }
}

const pushAuthIdentity = (target, rawValue, fallback = {}) => {
  const identity = buildAuthIdentity(rawValue, fallback)
  if (!identity) return
  if (target.some(entry => entry.token === identity.token)) {
    return
  }
  target.push(identity)
}

const parseConfiguredAuthIdentities = (value) => {
  const parsed = parseJson(value, null)
  return Array.isArray(parsed) ? parsed : []
}

const ROOT_DIR = path.resolve(__dirname, '..')
const DEFAULT_DATA_DIR = path.join(ROOT_DIR, 'data')
const isProduction = (process.env.NODE_ENV || '').toLowerCase() === 'production'

const basePath = normalizeBasePath(process.env.APP_BASE_PATH || process.env.BASE_PATH)
const apiToken = (process.env.API_TOKEN || process.env.SERVERXR_API_TOKEN || '').trim()
const requireAuth = parseBool(process.env.REQUIRE_AUTH, isProduction)
const corsOrigins = expandLoopbackOrigins(parseList(process.env.CORS_ORIGINS))
const maxUploadMb = parseNumber(process.env.MAX_UPLOAD_MB, 100)
const maxUploadBytes = Math.max(1, maxUploadMb) * 1024 * 1024
const dataDir = resolveDir(process.env.DATA_ROOT, DEFAULT_DATA_DIR)
const spacesDir = resolveDir(process.env.SPACES_DIR, path.join(dataDir, 'spaces'))
const uploadsDir = resolveDir(process.env.UPLOADS_DIR, path.join(dataDir, 'uploads'))
const authSessionTtlMs = parseNumber(process.env.AUTH_SESSION_TTL_MS, 1000 * 60 * 60 * 12)
const authSessionCookieName = (process.env.AUTH_SESSION_COOKIE_NAME || 'dii_serverxr_session').trim()
const authSessionCookieSecure = parseBool(process.env.AUTH_SESSION_COOKIE_SECURE, isProduction)
const authIdentities = []

parseConfiguredAuthIdentities(process.env.AUTH_IDENTITIES).forEach(entry => {
  pushAuthIdentity(authIdentities, entry)
})
pushAuthIdentity(authIdentities, process.env.ADMIN_API_TOKEN, {
  role: 'admin',
  subject: process.env.ADMIN_API_SUBJECT || 'admin',
  label: process.env.ADMIN_API_LABEL || 'Admin',
  spaces: normalizeAuthScopeSpaces(process.env.ADMIN_ALLOWED_SPACES, null)
})
pushAuthIdentity(authIdentities, process.env.EDITOR_API_TOKEN, {
  role: 'editor',
  subject: process.env.EDITOR_API_SUBJECT || 'editor',
  label: process.env.EDITOR_API_LABEL || 'Editor',
  spaces: normalizeAuthScopeSpaces(process.env.EDITOR_ALLOWED_SPACES, null)
})
pushAuthIdentity(authIdentities, process.env.VIEWER_API_TOKEN, {
  role: 'viewer',
  subject: process.env.VIEWER_API_SUBJECT || 'viewer',
  label: process.env.VIEWER_API_LABEL || 'Viewer',
  spaces: normalizeAuthScopeSpaces(process.env.VIEWER_ALLOWED_SPACES, null)
})
pushAuthIdentity(authIdentities, apiToken, {
  role: 'admin',
  subject: process.env.API_TOKEN_SUBJECT || 'legacy-admin',
  label: process.env.API_TOKEN_LABEL || 'Legacy Admin',
  spaces: normalizeAuthScopeSpaces(process.env.API_TOKEN_ALLOWED_SPACES, null)
})

const authIdentityLookup = new Map(authIdentities.map(identity => [identity.token, identity]))
const authSessionSecret = (process.env.AUTH_SESSION_SECRET || apiToken || authIdentities[0]?.token || '').trim()

if (requireAuth && !authIdentities.length) {
  throw new Error('At least one auth token is required when REQUIRE_AUTH is enabled.')
}

if (requireAuth && !authSessionSecret) {
  throw new Error('AUTH_SESSION_SECRET or an auth token is required when REQUIRE_AUTH is enabled.')
}

const config = {
  port: Number(process.env.PORT) || 4000,
  basePath,
  mountPath: basePath || '/',
  apiToken,
  requireAuth,
  corsOrigins,
  maxUploadBytes,
  authSession: {
    cookieName: authSessionCookieName || 'dii_serverxr_session',
    cookiePath: basePath || '/',
    cookieSecure: authSessionCookieSecure,
    ttlMs: authSessionTtlMs
  },
  auth: {
    identities: authIdentities.map(({ token, ...identity }) => ({ ...identity })),
    resolveIdentity: (token = '') => authIdentityLookup.get(String(token || '').trim()) || null,
    sessionSecret: authSessionSecret
  },
  directories: {
    root: ROOT_DIR,
    publicDir: path.resolve(ROOT_DIR, 'public'),
    dataDir,
    spacesDir,
    uploadsDir
  },
  defaultTtlMs: Number(process.env.SPACE_TTL_MS || 1000 * 60 * 60 * 24 * 30)
}

module.exports = { config, normalizeBasePath, isCorsOriginAllowed, buildCorsOriginHandler }
