const path = require('node:path')
const { URL } = require('node:url')

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

const resolveDir = (inputPath, fallback) => {
  if (!inputPath) return fallback
  if (path.isAbsolute(inputPath)) return inputPath
  return path.resolve(ROOT_DIR, inputPath)
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

if (requireAuth && !apiToken) {
  throw new Error('API_TOKEN is required when REQUIRE_AUTH is enabled.')
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
