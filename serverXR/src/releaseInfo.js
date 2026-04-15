const fs = require('node:fs')
const path = require('node:path')

const EMPTY_RELEASE_INFO = Object.freeze({
  deployEnv: null,
  sourceRef: null,
  gitCommit: null,
  releaseId: null,
  generatedAt: null
})

const normalizeString = (value) => {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized || null
}

function normalizeReleaseInfo(manifest = null) {
  const source = manifest && typeof manifest === 'object' ? manifest : {}
  return {
    deployEnv: normalizeString(source.deployEnv),
    sourceRef: normalizeString(source.sourceRef || source.git?.branch),
    gitCommit: normalizeString(source.gitCommit || source.git?.commit),
    releaseId: normalizeString(source.releaseId),
    generatedAt: normalizeString(source.generatedAt)
  }
}

function resolveReleaseFilePath(runtimeRoot) {
  const override = normalizeString(process.env.SERVERXR_RELEASE_FILE)
  if (override) {
    return path.resolve(override)
  }
  return path.join(runtimeRoot, 'release.json')
}

function loadReleaseInfo(runtimeRoot) {
  const filePath = resolveReleaseFilePath(runtimeRoot)
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    return normalizeReleaseInfo(JSON.parse(raw))
  } catch {
    return { ...EMPTY_RELEASE_INFO }
  }
}

module.exports = {
  EMPTY_RELEASE_INFO,
  loadReleaseInfo,
  normalizeReleaseInfo,
  resolveReleaseFilePath
}
