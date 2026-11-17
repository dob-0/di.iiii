// Open pull requests for the admin Monitor (read-only). One call to GitHub through the
// App's installation token, cached for a minute so a polling page costs one request.
// Merging stays with the owner's own Enter; nothing here writes to GitHub.
const { httpRequest } = require('./httpClient')

const REPO_OWNER = 'dob-0'
const REPO_NAME = 'di.iiii'
const CACHE_MS = 60 * 1000
const MAX_PRS = 50

const shape = (pr) => ({
  number: pr.number,
  title: String(pr.title || '').slice(0, 200),
  branch: pr.head?.ref || '',
  base: pr.base?.ref || '',
  author: pr.user?.login || '',
  draft: Boolean(pr.draft),
  updatedAt: pr.updated_at || null,
  url: pr.html_url || ''
})

const fetchOpenPrs = async (token) => {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/pulls?state=open&per_page=${MAX_PRS}&sort=updated&direction=desc`
  const res = await httpRequest(url, {
    method: 'GET',
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'User-Agent': 'di.iiii-monitor' }
  })
  if (!res.ok) {
    const message = (() => { try { return res.json().message } catch { return '' } })()
    const error = new Error(`GitHub ${res.status}: ${message || 'pull requests not readable'}`)
    error.status = res.status
    throw error
  }
  return res.json().map(shape)
}

/**
 * createPrList({ getInstallation, fetchPrs, now }) → { list() }
 * list() → { ok: true, repo, prs, fetchedAt } | { ok: false, repo, reason, message }
 * Never throws: a missing App, a missing permission or GitHub being down is an answer the page shows.
 */
function createPrList({ getInstallation, fetchPrs = fetchOpenPrs, now = () => Date.now() } = {}) {
  const repo = `${REPO_OWNER}/${REPO_NAME}`
  let cached = null
  return {
    async list() {
      if (cached && now() - cached.at < CACHE_MS) return cached.value
      let value
      try {
        const install = await getInstallation(REPO_OWNER, REPO_NAME)
        if (!install) {
          value = { ok: false, repo, reason: 'no-app', message: 'The GitHub App is not installed on this repository.' }
        } else {
          value = { ok: true, repo, prs: await fetchPrs(install.token), fetchedAt: now() }
        }
      } catch (error) {
        const denied = error.status === 403 || error.status === 404
        value = {
          ok: false, repo,
          reason: denied ? 'no-permission' : 'github-error',
          message: denied
            ? 'The GitHub App cannot read pull requests yet (it needs "Pull requests: read").'
            : String(error.message || 'GitHub did not answer').slice(0, 200)
        }
      }
      cached = { at: now(), value }
      return value
    }
  }
}

module.exports = { createPrList, shape, CACHE_MS }
