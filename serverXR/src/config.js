const path = require('node:path')

const normalizeBasePath = (value) => {
  if (!value) return ''
  const trimmed = String(value).trim()
  if (!trimmed || trimmed === '/') return ''
  return `/${trimmed.replace(/^\/+|\/+$/g, '')}`
}

const resolveDir = (inputPath, fallback) => {
  if (!inputPath) return fallback
  if (path.isAbsolute(inputPath)) return inputPath
  return path.resolve(ROOT_DIR, inputPath)
}

const ROOT_DIR = path.resolve(__dirname, '..')
const DEFAULT_DATA_DIR = path.join(ROOT_DIR, 'data')
const DEFAULT_SPACES_DIR = path.join(DEFAULT_DATA_DIR, 'spaces')
const DEFAULT_UPLOADS_DIR = path.join(DEFAULT_DATA_DIR, 'uploads')

const basePath = normalizeBasePath(process.env.APP_BASE_PATH || process.env.BASE_PATH)

const config = {
  port: Number(process.env.PORT) || 4000,
  basePath,
  mountPath: basePath || '/',
  directories: {
    root: ROOT_DIR,
    publicDir: path.resolve(ROOT_DIR, 'public'),
    dataDir: resolveDir(process.env.DATA_ROOT, DEFAULT_DATA_DIR),
    spacesDir: resolveDir(process.env.SPACES_DIR, DEFAULT_SPACES_DIR),
    uploadsDir: resolveDir(process.env.UPLOADS_DIR, DEFAULT_UPLOADS_DIR)
  },
  defaultTtlMs: Number(process.env.SPACE_TTL_MS || 1000 * 60 * 60 * 24 * 30)
}

module.exports = { config, normalizeBasePath }
