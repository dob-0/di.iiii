// Which GitHub repos a space may be linked to, and what a link may name.
//
// The sync reads the repo with the platform's own GitHub App installation, so
// the repo choice belongs to the server operator, not to whoever owns a space:
//   - an admin may link any repo the App can reach;
//   - anyone else who manages the space may link only a repo on the operator's
//     list, GITHUB_SYNC_ALLOWED_REPOS: comma- or space-separated entries,
//     `owner/repo` or `owner/*`, matched without regard to case.
// Method: OWASP ASVS 4.0.3 V4.1.3 (least privilege) and V4.2.1 (object-level
// access) — the link names an object (a repo) the caller must be allowed to
// use, checked on the server for every link and every sync.

// GitHub's own character sets for account and repository names.
const NAME_RE = /^[A-Za-z0-9_.-]{1,100}$/
const REF_RE = /^[A-Za-z0-9._/-]{1,255}$/
const ENTRY_RE = /^[A-Za-z0-9._/-]{1,512}$/

const isValidRepoPart = (value) => typeof value === 'string' && NAME_RE.test(value) && value !== '.' && value !== '..'

const parseAllowedRepos = (value) =>
  String(value || '')
    .split(/[\s,]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .map((entry) => {
      const [owner, repo, extra] = entry.split('/')
      if (extra !== undefined || !isValidRepoPart(owner)) return null
      if (repo === '*') return { owner, repo: '*' }
      return isValidRepoPart(repo) ? { owner, repo } : null
    })
    .filter(Boolean)

const isRepoOnList = (owner, repo, list) => {
  const o = String(owner || '').toLowerCase()
  const r = String(repo || '').toLowerCase()
  return list.some((entry) => entry.owner === o && (entry.repo === '*' || entry.repo === r))
}

// A plain relative path inside the repo, ending in .html/.htm.
const isValidEntry = (entry) => {
  if (typeof entry !== 'string' || !ENTRY_RE.test(entry)) return false
  if (entry.startsWith('/')) return false
  const segments = entry.replace(/^\.\//, '').split('/')
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) return false
  return /\.html?$/i.test(entry)
}

const isValidRef = (ref) =>
  ref === null || ref === undefined || ref === '' ||
  (typeof ref === 'string' && REF_RE.test(ref) && !ref.split('/').some((s) => s === '' || s === '.' || s === '..'))

// → { ok: true } or { ok: false, status, error }
const checkLinkRequest = ({ owner, repo, ref, entry }, { isAdmin, allowedRepos }) => {
  if (!isValidRepoPart(owner) || !isValidRepoPart(repo)) {
    return { ok: false, status: 400, error: 'owner and repo must be GitHub account and repository names.' }
  }
  if (!isAdmin && !isRepoOnList(owner, repo, allowedRepos)) {
    return {
      ok: false,
      status: 403,
      error: 'This repository is not approved for GitHub sync on this server. An admin can link it, or add it to GITHUB_SYNC_ALLOWED_REPOS.'
    }
  }
  if (!isValidRef(ref)) return { ok: false, status: 400, error: 'ref must be a branch, tag or commit name.' }
  if (!isValidEntry(entry)) {
    return { ok: false, status: 400, error: 'entry must be an .html file at a plain path inside the repo.' }
  }
  return { ok: true }
}

module.exports = { parseAllowedRepos, isRepoOnList, isValidEntry, isValidRef, isValidRepoPart, checkLinkRequest }
