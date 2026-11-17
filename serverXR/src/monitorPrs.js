// Open pull requests for the admin Monitor (read-only). One call to GitHub through the
// App's installation token, cached for a minute so a polling page costs one request.
// Merging stays with the owner's own Enter; nothing here writes to GitHub.
const { httpRequest } = require('./httpClient')

// The repository can be overridden (a fork, a rename): MONITOR_PRS_REPO=owner/name.
const [REPO_OWNER, REPO_NAME] = (process.env.MONITOR_PRS_REPO || 'dob-0/di.iiii').split('/')
const CACHE_MS = 60 * 1000
const FAIL_CACHE_MS = 10 * 1000
const MAX_PRS = 50

const shape = (pr) => ({
  number: pr.number,
  title: String(pr.title || '').slice(0, 200),
  branch: pr.head?.ref || '',
  base: pr.base?.ref || '',
  author: pr.user?.login || '',
  draft: Boolean(pr.draft),
  updatedAt: pr.updated_at || null,
  // only a GitHub web address becomes a link
  url: /^https:\/\/github\.com\//.test(pr.html_url || '') ? pr.html_url : ''
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
  let inflight = null
  const build = async () => {
    try {
      const install = await getInstallation(REPO_OWNER, REPO_NAME)
      if (!install) {
        return { ok: false, repo, reason: 'no-app', message: 'The GitHub App is not installed on this repository, or its repositories could not be listed.' }
      }
      const prs = await fetchPrs(install.token)
      return { ok: true, repo, prs, truncated: prs.length >= MAX_PRS, fetchedAt: now() }
    } catch (error) {
      const message = error.status === 403
        ? 'GitHub refused (403): the App may lack "Pull requests: read", or a rate limit was hit.'
        : error.status === 404
          ? 'GitHub says not found (404): the repository name or the App access is wrong.'
          : String(error.message || 'GitHub did not answer').slice(0, 200)
      return { ok: false, repo, reason: error.status === 403 || error.status === 404 ? 'no-permission' : 'github-error', message }
    }
  }
  return {
    // One call at a time; an answer is kept a minute, a failure only ten seconds.
    async list() {
      if (cached && now() - cached.at < (cached.value.ok ? CACHE_MS : FAIL_CACHE_MS)) return cached.value
      if (!inflight) inflight = build().then((value) => { cached = { at: now(), value }; return value }).finally(() => { inflight = null })
      return inflight
    }
  }
}

module.exports = { createPrList, shape, CACHE_MS, FAIL_CACHE_MS, MAX_PRS }
