const fs = require('node:fs')
const path = require('node:path')

const resolveSharedModulePath = (moduleName) => {
  const normalizedName = String(moduleName || '').replace(/^\/+/, '')
  const candidates = [
    process.env.SHARED_ROOT ? path.resolve(process.env.SHARED_ROOT, normalizedName) : null,
    path.resolve(__dirname, '../../shared', normalizedName)
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  return candidates[0] || candidates[candidates.length - 1]
}

const loadSharedModule = (moduleName) => {
  return require(resolveSharedModulePath(moduleName))
}

module.exports = {
  loadSharedModule,
  resolveSharedModulePath
}
