#!/usr/bin/env node
/**
 * space-sync-github.mjs — sync a di.iiii space FROM a GitHub repo, fetching the
 * repo's files over the GitHub API (no local checkout). This is the server-side
 * core of the one-click "New space from GitHub" flow: given a repo + a binding,
 * di.iiii pulls the files and renders them as a space. The binding normally comes
 * from a server-side SpaceLink record; here it comes from flags / di-space.json.
 *
 * Usage:
 *   node scripts/space-sync-github.mjs --github <owner/repo[@ref]> \
 *     [--space-id X --project-id Y --entry index.html] \
 *     --to <serverXR> --token <live-editor-token> [--gh-token <gh>] [--dry-run]
 *
 * Public repos need no --gh-token. Private repos use a GitHub App installation
 * token (or PAT) passed as --gh-token.
 */

const DEFAULT_LIVE_URL = 'https://di-studio.xyz/serverXR'
const GH = 'https://api.github.com'

const parseArgs = (argv) => {
  const a = { github: null, spaceId: null, projectId: null, entry: null, to: null, token: null, ghToken: null, label: null, dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]
    if (k === '--github') a.github = argv[++i]
    else if (k === '--space-id') a.spaceId = argv[++i]
    else if (k === '--project-id') a.projectId = argv[++i]
    else if (k === '--entry') a.entry = argv[++i]
    else if (k === '--to') a.to = argv[++i]
    else if (k === '--token') a.token = argv[++i]
    else if (k === '--gh-token') a.ghToken = argv[++i]
    else if (k === '--label') a.label = argv[++i]
    else if (k === '--dry-run') a.dryRun = true
  }
  return a
}

const liveHeaders = (token, json = true) => {
  const h = { Accept: 'application/json' }
  if (json) h['Content-Type'] = 'application/json'
  if (token) h.Authorization = `Bearer ${token}`
  return h
}
const api = async (url, o = {}) => { const r = await fetch(url, o); const b = await r.json().catch(() => ({})); return { ok: r.ok, status: r.status, body: b } }
const apiOrThrow = async (url, o = {}) => { const r = await api(url, o); if (!r.ok) throw new Error(`HTTP ${r.status} ${url}: ${r.body?.error || JSON.stringify(r.body).slice(0, 160)}`); return r.body }

// ── GitHub source ────────────────────────────────────────────────────────────
const ghHeaders = (ghToken) => {
  const h = { Accept: 'application/vnd.github+json', 'User-Agent': 'di.iiii-space-sync' }
  if (ghToken) h.Authorization = `Bearer ${ghToken}`
  return h
}
const ghJson = async (url, ghToken) => {
  const r = await fetch(url, { headers: ghHeaders(ghToken) })
  if (!r.ok) throw new Error(`GitHub ${r.status} ${url}: ${(await r.text()).slice(0, 160)}`)
  return r.json()
}
const makeGithubSource = async (owner, repo, ref, ghToken) => {
  if (!ref) ref = (await ghJson(`${GH}/repos/${owner}/${repo}`, ghToken)).default_branch || 'main'
  const tree = (await ghJson(`${GH}/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`, ghToken)).tree || []
  const files = tree.filter((t) => t.type === 'blob').map((t) => t.path)
  const readBuf = async (rel) => {
    const meta = await ghJson(`${GH}/repos/${owner}/${repo}/contents/${encodeURIComponent(rel).replace(/%2F/g, '/')}?ref=${ref}`, ghToken)
    if (meta.content && meta.encoding === 'base64') return Buffer.from(meta.content, 'base64')
    // large files: fall back to the blob API
    const blob = await ghJson(`${GH}/repos/${owner}/${repo}/git/blobs/${meta.sha}`, ghToken)
    return Buffer.from(blob.content, 'base64')
  }
  return { ref, files, readText: async (rel) => (await readBuf(rel)).toString('utf8'), readBuf }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.github) { console.error('Usage: --github <owner/repo[@ref]> [--space-id ... --project-id ... --entry ...] --to <url> --token <tok>'); process.exitCode = 1; return }
  const [slug, refArg] = args.github.split('@')
  const [owner, repo] = slug.split('/')
  if (!owner || !repo) { console.error('--github must be owner/repo[@ref]'); process.exitCode = 1; return }

  const live = (args.to || process.env.LIVE_API_URL || DEFAULT_LIVE_URL).replace(/\/+$/, '')
  const token = args.token || process.env.LIVE_API_TOKEN || process.env.API_TOKEN || ''
  if (!token) { console.error('Error: live editor token required (--token / LIVE_API_TOKEN).'); process.exitCode = 1; return }

  console.log(`[space-sync-github] ${owner}/${repo}${refArg ? '@' + refArg : ''} → ${live}`)
  const src = await makeGithubSource(owner, repo, refArg, args.ghToken)
  console.log(`  ref: ${src.ref}   files: ${src.files.length}`)

  // binding: di-space.json in the repo (if present), overridden by flags
  let manifest = {}
  if (src.files.includes('di-space.json')) {
    try { manifest = JSON.parse(await src.readText('di-space.json')); console.log('  · di-space.json found in repo') } catch {}
  }
  const spaceId = args.spaceId || manifest.spaceId
  const projectId = args.projectId || manifest.projectId
  const entry = args.entry || manifest.entry || 'index.html'
  const label = args.label || manifest.label || spaceId
  if (!spaceId || !projectId) { console.error('Need spaceId + projectId (flags or di-space.json).'); process.exitCode = 1; return }
  if (!src.files.includes(entry)) { console.error(`entry "${entry}" not found in repo`); process.exitCode = 1; return }

  console.log(`  binding: space=${spaceId} project=${projectId} entry=${entry}`)
  if (args.dryRun) { console.log('  dry-run — no writes'); return }

  // ensure space
  let space = (await api(`${live}/api/spaces/${spaceId}`, { headers: liveHeaders(token) })).body?.space
  if (!space) {
    space = (await apiOrThrow(`${live}/api/spaces`, { method: 'POST', headers: liveHeaders(token), body: JSON.stringify({ label, slug: spaceId }) })).space
    console.log(`  + created space ${space.id}`)
  } else console.log(`  · space ${space.id} exists`)
  const canonicalSpace = space?.id || spaceId

  // ensure project
  const projects = (await api(`${live}/api/spaces/${canonicalSpace}/projects`, { headers: liveHeaders(token) })).body?.projects || []
  let project = projects.find((p) => p.id === projectId)
  if (!project) {
    const r = await api(`${live}/api/spaces/${canonicalSpace}/projects`, { method: 'POST', headers: liveHeaders(token), body: JSON.stringify({ title: label, slug: projectId }) })
    if (r.status === 409) throw new Error(`projectId "${projectId}" is taken (global). Use "${spaceId}-home".`)
    if (!r.ok) throw new Error(`HTTP ${r.status} creating project: ${r.body?.error || ''}`)
    project = r.body.project
    console.log(`  + created project ${project.id}`)
  } else console.log(`  · project ${project.id} exists`)
  const canonicalProject = project?.id || projectId

  // fetch entry html (+ inline-able includes left to the platform bundler)
  const codeFiles = [{ name: 'index.html', content: await src.readText(entry) }]
  console.log(`  fetched ${entry} (${codeFiles[0].content.length} bytes) from GitHub`)

  // write document (PUT — the /document route is PUT-only)
  const docUrl = `${live}/api/projects/${canonicalProject}/document`
  const doc = (await apiOrThrow(docUrl, { headers: liveHeaders(token) })).document
  await apiOrThrow(docUrl, { method: 'PUT', headers: liveHeaders(token), body: JSON.stringify({
    ...doc,
    presentationState: { ...(doc?.presentationState || {}), mode: 'code', entryView: 'code', codeFiles },
    publishState: { ...(doc?.publishState || {}), shareEnabled: true },
  }) })
  console.log('  ✓ document updated from GitHub')

  // publish (best-effort; admin/owner-only)
  const pr = await api(`${live}/api/spaces/${canonicalSpace}`, { method: 'PATCH', headers: liveHeaders(token), body: JSON.stringify({ publishedProjectId: canonicalProject }) })
  console.log(pr.ok ? `  ✓ published ${canonicalProject}` : `  ⚠ publish skipped (owner/admin only) — content updated`)
  console.log(`\n  live → ${live.replace(/\/serverXR$/, '')}/${spaceId}`)
}

main().catch((e) => { console.error(e?.message || e); process.exitCode = 1 })
