// Manifest-driven sync planning for the GitHub App webhook path. Pure module —
// no I/O — so the selection semantics are testable and stay in lockstep with
// scripts/space-sync.mjs (the CI push path): same glob dialect, same code-file
// extension whitelist, same "only assets the entry HTML references" rule, same
// URL rewrite (path and bare basename both replaced).

const path = require('node:path')

const CODE_EXTENSIONS = new Set(['.html', '.htm', '.css', '.js', '.mjs', '.txt', '.svg', '.json', '.md'])

const MIME = {
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.m4v': 'video/x-m4v',
  '.ogg': 'video/ogg', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.glb': 'model/gltf-binary'
}

// minimal glob: * within a segment, ** across segments — matched against
// repo-relative paths (same dialect as scripts/space-sync.mjs)
const globToRe = (g) => new RegExp('^' + g
  .replace(/[.+^${}()|[\]\\]/g, '\\$&')
  .replace(/\*\*/g, ' ')
  .replace(/\*/g, '[^/]*')
  .replace(/ /g, '.*') + '$')

const matchGlobs = (files, patterns) => {
  if (!Array.isArray(patterns) || !patterns.length) return []
  const res = patterns.map(globToRe)
  return files.filter((f) => res.some((re) => re.test(f)))
}

const mimeFor = (filePath) => MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream'

// Which repo files a manifest wants synced, given the full repo file list and
// the entry HTML: code files by include glob (entry excluded, whitelist-gated),
// assets by glob but only when the entry actually references them (full
// repo-relative path or bare basename).
const planSync = ({ manifest = {}, repoPaths = [], entryPath = '', entryHtml = '' }) => {
  const codePaths = matchGlobs(repoPaths, manifest.include)
    .filter((p) => p !== entryPath)
    .filter((p) => CODE_EXTENSIONS.has(path.extname(p).toLowerCase()))
  const assetPaths = matchGlobs(repoPaths, manifest.assets)
    .filter((p) => entryHtml.includes(p) || entryHtml.includes(path.basename(p)))
  return { codePaths, assetPaths }
}

const rewriteAssetUrl = (html, rel, url) =>
  html.split(rel).join(url).split(path.basename(rel)).join(url)

// The sync PUT is a full no-baseVersion document replace, so the merge base
// must be the real current document. A swallowed GET failure used to yield {}
// here and publish an empty base — assets, projectMeta and owner opt-ins like
// presentationState.deviceAccess wiped, with the sync still reporting success.
// Fail loudly instead; the caller turns this into a failed sync run.
const buildSyncedDocumentBody = ({ current, codeFiles = [] }) => {
  const doc = current && typeof current === 'object' ? current.document : null
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new Error('internal document GET returned no document — refusing to publish an empty base')
  }
  return {
    ...doc,
    presentationState: { ...(doc.presentationState || {}), mode: 'code', entryView: 'code', codeFiles },
    publishState: { ...(doc.publishState || {}), shareEnabled: true }
  }
}

module.exports = {
  CODE_EXTENSIONS,
  MIME,
  buildSyncedDocumentBody,
  globToRe,
  matchGlobs,
  mimeFor,
  planSync,
  rewriteAssetUrl
}
