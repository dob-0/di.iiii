const fs = require('node:fs')
const path = require('node:path')

// What a server can say about the release it is, as GET /api/health reports it.
// `version` is how an installed `di` names its build ("0.4.4-dev.5b37c82f",
// written by scripts/pack-runtime.mjs); a hosted image names itself by commit
// and leaves it null. Null always means "this stamp does not say", never a guess.
const EMPTY_RELEASE_INFO = Object.freeze({
  deployEnv: null,
  sourceRef: null,
  gitCommit: null,
  releaseId: null,
  generatedAt: null,
  version: null
})

const normalizeString = (value) => {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized || null
}

const isManifest = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

function normalizeReleaseInfo(manifest = null) {
  const source = isManifest(manifest) ? manifest : {}
  const version = normalizeString(source.version)
  return {
    deployEnv: normalizeString(source.deployEnv),
    sourceRef: normalizeString(source.sourceRef || source.git?.branch),
    gitCommit: normalizeString(source.gitCommit || source.git?.commit),
    // A build that names itself by its version (an installed di) has no other id.
    releaseId: normalizeString(source.releaseId) || version,
    // The packer says packedAt; every other stamp says generatedAt.
    generatedAt: normalizeString(source.generatedAt || source.packedAt),
    version
  }
}

// Where this server's stamp can be, in the order they are tried.
//   1. Beside the server: a hosted image, the standby runtime and a cPanel bundle
//      (serverXR/Dockerfile, scripts/standby/build-runtime.sh,
//      scripts/stage-cpanel-nodeapp-release.mjs).
//   2. One folder up: an installed `di`. scripts/pack-runtime.mjs writes
//      <version>/release.json and copies the server to <version>/serverXR/, so
//      ~/.di/versions/<version>/release.json sits right above runtimeRoot. It was
//      never looked at, and every installed di answered release = all null.
// SERVERXR_RELEASE_FILE names exactly one file and nothing else is tried.
function releaseFileCandidates(runtimeRoot) {
  const override = normalizeString(process.env.SERVERXR_RELEASE_FILE)
  if (override) {
    return [path.resolve(override)]
  }
  return [
    path.join(runtimeRoot, 'release.json'),
    path.join(runtimeRoot, '..', 'release.json')
  ]
}

function resolveReleaseFilePath(runtimeRoot) {
  return releaseFileCandidates(runtimeRoot)[0]
}

function readManifest(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    return isManifest(parsed) ? parsed : null
  } catch {
    return null
  }
}

function loadReleaseInfo(runtimeRoot) {
  for (const filePath of releaseFileCandidates(runtimeRoot)) {
    const manifest = readManifest(filePath)
    if (manifest) {
      return normalizeReleaseInfo(manifest)
    }
  }
  return { ...EMPTY_RELEASE_INFO }
}

module.exports = {
  EMPTY_RELEASE_INFO,
  loadReleaseInfo,
  normalizeReleaseInfo,
  resolveReleaseFilePath
}
