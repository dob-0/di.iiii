const fs = require('node:fs')
const path = require('node:path')

const EMPTY_RELEASE_INFO = Object.freeze({
  deployEnv: null,
  sourceRef: null,
  gitCommit: null,
  releaseId: null,
  generatedAt: null,
  version: null,
  schemaVersion: null,
  packedAt: null,
  parts: Object.freeze([])
})

const normalizeString = (value) => {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized || null
}

// The per-part stamps the packer writes (scripts/partStamps.mjs): at most 32, each { id, commit, date },
// anything that is not a string becomes null, so a hand-edited file cannot put objects into the Monitor.
function normalizeParts(value) {
  if (!Array.isArray(value)) return []
  return value.slice(0, 32).map((part) => ({
    id: normalizeString(part?.id),
    commit: normalizeString(part?.commit),
    date: normalizeString(part?.date)
  })).filter((part) => part.id)
}

function normalizeReleaseInfo(manifest = null) {
  const source = manifest && typeof manifest === 'object' ? manifest : {}
  return {
    deployEnv: normalizeString(source.deployEnv),
    sourceRef: normalizeString(source.sourceRef || source.git?.branch),
    gitCommit: normalizeString(source.gitCommit || source.git?.commit),
    releaseId: normalizeString(source.releaseId),
    generatedAt: normalizeString(source.generatedAt),
    version: normalizeString(source.version),
    schemaVersion: Number.isFinite(Number(source.schemaVersion)) && source.schemaVersion !== null ? Number(source.schemaVersion) : null,
    packedAt: normalizeString(source.packedAt),
    parts: normalizeParts(source.parts)
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
