// One-click GitHub sync: pulls a linked repo into a space through this
// server's own document and asset routes, with the internal token.
// Spec: docs/architecture/SPEC_github_app_one_click.md.

const crypto = require('node:crypto')
const path = require('node:path')

const isLoopbackHostname = (hostname) => {
  const host = String(hostname || '').toLowerCase()
  if (host === 'localhost' || host === '[::1]') return true
  const parts = host.split('.')
  return parts.length === 4 && parts[0] === '127' && parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255)
}

// http(s) URL on a loopback address, no credentials → that URL without a
// trailing slash; anything else → null.
const loopbackBaseUrl = (value) => {
  let url
  try { url = new URL(value) } catch { return null }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (url.username || url.password) return null
  if (!isLoopbackHostname(url.hostname)) return null
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
}

function createGithubSync({ githubApp, httpRequest, spaceSyncPlan, config, env = process.env, logger = console }) {
  // The internal token goes to this machine only: the default loopback on
  // config.port, or SELF_API_URL when it names a loopback address (another
  // port or base path on this machine). Any other SELF_API_URL is refused
  // before a request is made.
  const internalApiBase = () => {
    const configured = String(env.SELF_API_URL || '').trim()
    if (!configured) return `http://127.0.0.1:${config.port}${config.basePath || ''}`
    const base = loopbackBaseUrl(configured)
    if (!base) {
      throw new Error(
        'SELF_API_URL must name this machine (http://127.0.0.1:<port>/<base>, [::1] or localhost); ' +
        'the GitHub sync sends the internal token there and does not send it to any other host.'
      )
    }
    return base
  }
  const internalHeaders = () => ({ 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${config.internalApiToken}` })

  // Upload one binary into a project through the server's own multipart asset
  // route (the route computes the content-hash id and returns the public URL).
  async function uploadSyncedAsset(base, projectId, rel, buf) {
    const boundary = 'dii-sync-' + crypto.randomBytes(8).toString('hex')
    const filename = path.basename(rel).replace(/"/g, '')
    const head = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="asset"; filename="${filename}"\r\n` +
      `Content-Type: ${spaceSyncPlan.mimeFor(rel)}\r\n\r\n`
    )
    const body = Buffer.concat([head, buf, Buffer.from(`\r\n--${boundary}--\r\n`)])
    const r = await httpRequest(`${base}/api/projects/${projectId}/assets`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.internalApiToken}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length
      },
      body,
      timeoutMs: 120000
    })
    if (!r.ok) throw new Error(`asset upload failed (${r.status}) for ${rel}`)
    return r.json().asset
  }

  // Assets bigger than this are skipped (and reported) rather than buffered
  // through base64 + multipart under cPanel/LVE memory limits.
  const MAX_SYNC_ASSET_BYTES = 30 * 1024 * 1024

  // Pull the linked repo into the space via the GitHub App installation token,
  // writing through the server's OWN tested document/asset APIs (admin). With a
  // di-space.json manifest in the repo this matches the CI push path: include
  // globs become extra code files, asset globs upload referenced binaries and
  // rewrite their URLs in the entry HTML. Without a manifest: entry file only.
  async function syncLinkedSpace(link) {
    const base = internalApiBase()
    let token = null
    let installationId = link.installationId
    if (installationId) { try { token = await githubApp.installationToken(installationId) } catch {} }
    if (!token) {
      const got = await githubApp.getInstallationForRepo(link.owner, link.repo)
      if (got) { token = got.token; installationId = got.installationId }
    }
    if (!token) throw new Error(`No GitHub App installation can access ${link.owner}/${link.repo}`)
    const ref = link.ref || await githubApp.repoDefaultBranch(token, link.owner, link.repo)
    let entryHtml = await githubApp.fetchRepoFile(token, link.owner, link.repo, ref, link.entry)
    const codeFiles = [{ name: 'index.html', content: entryHtml }]
    let assetsUploaded = 0
    const skipped = []

    let manifest = null
    try {
      manifest = JSON.parse(await githubApp.fetchRepoFile(token, link.owner, link.repo, ref, 'di-space.json'))
    } catch { /* no manifest — entry-only sync */ }

    if (manifest && (manifest.include?.length || manifest.assets?.length)) {
      const repoPaths = await githubApp.repoTree(token, link.owner, link.repo, ref)
      const entryPath = String(link.entry).replace(/^\.?\//, '')
      const { codePaths, assetPaths } = spaceSyncPlan.planSync({ manifest, repoPaths, entryPath, entryHtml })
      for (const rel of assetPaths) {
        const buf = await githubApp.fetchRepoFileBuffer(token, link.owner, link.repo, ref, rel)
        if (buf.length > MAX_SYNC_ASSET_BYTES) { skipped.push(rel); continue }
        const asset = await uploadSyncedAsset(base, link.projectId, rel, buf)
        entryHtml = spaceSyncPlan.rewriteAssetUrl(entryHtml, rel, asset.url)
        assetsUploaded++
      }
      codeFiles[0].content = entryHtml
      for (const rel of codePaths) {
        codeFiles.push({
          name: path.basename(rel),
          content: await githubApp.fetchRepoFile(token, link.owner, link.repo, ref, rel)
        })
      }
    }

    const docUrl = `${base}/api/projects/${link.projectId}/document`
    // The PUT below is a full no-baseVersion replace, so `doc` MUST be the real
    // current document. Swallowing a failed GET into {} used to publish an empty
    // base -- assets, projectMeta and owner opt-ins (deviceAccess) wiped, sync
    // still reporting success. Fail the sync run instead.
    const curRes = await httpRequest(docUrl, { headers: internalHeaders() })
      .catch((error) => { throw new Error(`internal document GET failed (${error.message})`) })
    if (!curRes.ok) throw new Error(`internal document GET failed (${curRes.status})`)
    const put = await httpRequest(docUrl, {
      method: 'PUT', headers: internalHeaders(),
      body: JSON.stringify(spaceSyncPlan.buildSyncedDocumentBody({ current: await curRes.json(), codeFiles }))
    })
    if (!put.ok) throw new Error(`internal document PUT failed (${put.status})`)
    // Non-fatal (the document is already published) but never silent: a dropped
    // publishedProjectId leaves the space pointing at the wrong project.
    const patch = await httpRequest(`${base}/api/spaces/${link.spaceId}`, {
      method: 'PATCH', headers: internalHeaders(),
      body: JSON.stringify({ publishedProjectId: link.projectId })
    }).catch((error) => ({ ok: false, status: error.message }))
    if (!patch.ok) {
      logger.warn(`[github-sync] publishedProjectId PATCH failed for ${link.spaceId} (${patch.status})`)
    }
    return {
      ref,
      bytes: entryHtml.length,
      codeFiles: codeFiles.length,
      assets: assetsUploaded,
      ...(skipped.length ? { skippedOversize: skipped } : {})
    }
  }

  return { syncLinkedSpace, internalApiBase }
}

module.exports = { createGithubSync, loopbackBaseUrl }
