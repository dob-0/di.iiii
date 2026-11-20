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
// Past versions of one part (scripts/partStamps.mjs): newest first, at most 12, each { commit, date, title, pr }.
function normalizeHistory(value) {
  if (!Array.isArray(value)) return []
  return value.slice(0, 12).map((h) => ({
    commit: /^[0-9a-f]{7,40}$/.test(String(h?.commit || '')) ? h.commit : null,
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(h?.date || '')) ? h.date : null,
    title: typeof h?.title === 'string' ? h.title.trim().slice(0, 140) : '',
    pr: Number.isInteger(h?.pr) && h.pr > 0 ? h.pr : null
  })).filter((h) => h.commit)
}

function normalizeParts(value) {
  if (!Array.isArray(value)) return []
  return value.slice(0, 32).map((part) => ({
    id: normalizeString(part?.id),
    commit: /^[0-9a-f]{7,40}$/.test(String(part?.commit || '')) ? part.commit : null,
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(part?.date || '')) ? part.date : null,
    history: normalizeHistory(part?.history)
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
    schemaVersion: Number.isInteger(source.schemaVersion) ? source.schemaVersion : null,
    packedAt: normalizeString(source.packedAt),
    parts: normalizeParts(source.parts)
  }
}

function resolveReleaseFilePath(runtimeRoot) {
  const override = normalizeString(process.env.SERVERXR_RELEASE_FILE)
  if (override) {
    return path.resolve(override)
  }
  const here = path.join(runtimeRoot, 'release.json')
  // A packed install keeps release.json at ITS root (scripts/pack-runtime.mjs), one folder above serverXR/,
  // which is the runtime root. Before this, an installed server read nothing and the Monitor said "commit unknown".
  const packed = path.join(runtimeRoot, '..', 'release.json')
  if (!fs.existsSync(here) && fs.existsSync(packed)) return path.resolve(packed)
  return here
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
