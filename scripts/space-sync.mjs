#!/usr/bin/env node
/**
 * space-sync.mjs — idempotent "linked space" sync engine.
 *
 * Reads a di-space.json manifest in a source repo and creates-or-updates a
 * di.iiii space + project from that repo's files:
 *   - creates the space and project if they do not exist (first run provisions)
 *   - pushes the entry HTML (+ include globs) into the code presentation (codeFiles)
 *   - uploads referenced assets (e.g. videos) and rewrites their URLs in the HTML
 *   - sets the space's publishedProjectId
 * Re-runnable: the first run creates, every later run updates.
 *
 * Usage:
 *   node scripts/space-sync.mjs --repo <dir> [--manifest <path>] [--to <url>] [--token <tok>] [--dry-run]
 *   (defaults: --repo = manifest dir or cwd; --manifest = <repo>/di-space.json)
 *
 * Auth: --token, else LIVE_API_TOKEN / API_TOKEN from env or serverXR/.env.local.
 *
 * THIS FILE IS THE UPSTREAM COPY. The linked repos (br_id_ge, beyond_form,
 * platform_recordar) vendor it as scripts/sync-space.mjs so their CI can run
 * without checking out di.iiii. They drifted once — three of the four copies
 * were a version behind, and the stale one wrote deviceAccess:false (killing
 * the rite's camera) and skipped the staging host rewrite (writing every
 * rehearsal crossing into the live field). Re-vendor with:
 *
 *   node scripts/space-sync-vendor.mjs          # check every copy
 *   node scripts/space-sync-vendor.mjs --write  # update them
 *
 * Bump ENGINE_VERSION when behaviour changes, and have manifests that depend on
 * the new behaviour declare "minEngine": <n> so a stale copy refuses rather
 * than silently doing the old thing.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ENGINE_VERSION = 4

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CODE_EXTENSIONS = new Set(['.html', '.htm', '.css', '.js', '.mjs', '.txt', '.svg', '.json', '.md'])
const MIME = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.m4v': 'video/x-m4v',
  '.ogg': 'video/ogg', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.glb': 'model/gltf-binary' }

const parseArgs = (argv) => {
  const args = { repo: null, manifest: null, to: null, token: null, dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--repo') { args.repo = argv[++i]; continue }
    if (a === '--manifest') { args.manifest = argv[++i]; continue }
    if (a === '--to') { args.to = argv[++i]; continue }
    if (a === '--token') { args.token = argv[++i]; continue }
    if (a === '--dry-run') { args.dryRun = true; continue }
  }
  return args
}

const loadEnvFile = async (filePath) => {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    const env = {}
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const idx = t.indexOf('=')
      if (idx === -1) continue
      env[t.slice(0, idx).trim()] = t.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '')
    }
    return env
  } catch { return {} }
}

const buildHeaders = (token, json = true) => {
  const h = { Accept: 'application/json' }
  if (json) h['Content-Type'] = 'application/json'
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * returns { ok, status, body }
 *
 * Retries 429, 5xx and network failures. A tier restarting mid-run used to take
 * the whole sync down — one transient 502 on GET /api/spaces left staging a
 * version behind and needed a human to re-run the workflow. Uploads are also
 * rate-limited (60 per 10 minutes per address) and the server sends Retry-After.
 */
const api = async (url, options = {}, retries = 4) => {
  for (let attempt = 0; ; attempt++) {
    let res
    try {
      res = await fetch(url, options)
    } catch (err) {
      if (attempt >= retries) throw new Error(`${url} — network: ${err.message}`)
      await sleep(1000 * 2 ** attempt)
      continue
    }
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      const ra = Number(res.headers.get('retry-after'))
      const waitMs = Number.isFinite(ra) && ra > 0 ? (ra + 1) * 1000 : 1000 * 2 ** attempt
      console.log(`  … HTTP ${res.status}, retrying in ${Math.round(waitMs / 1000)}s`)
      await sleep(waitMs)
      continue
    }
    const body = await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, body }
  }
}

const apiOrThrow = async (url, options = {}) => {
  const { ok, status, body } = await api(url, options)
  if (!ok) throw new Error(`HTTP ${status} ${url}: ${body?.error || JSON.stringify(body).slice(0, 200)}`)
  return body
}

// minimal glob: supports * and ** within a single pattern, matched against repo-relative paths
const walk = async (dir, base = dir, out = []) => {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git') continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) await walk(full, base, out)
    else out.push(path.relative(base, full))
  }
  return out
}

// The '**' placeholder is an ESCAPE, never a literal NUL byte. It was a
// literal one for months: harmless at runtime, but it made git call this
// file binary — no diff, no grep, no review — which is precisely how four
// copies of the sync engine drifted apart without anyone being able to see it.
const globToRe = (g) => new RegExp('^' + g
  .replace(/[.+^${}()|[\]\\]/g, '\\$&')
  .replace(/\*\*/g, '\u0000')
  .replace(/\*/g, '[^/]*')
  // NUL is the placeholder set two lines up, so matching it here is the
  // point. Disabled on this line only -- the rule stays on for the rest of
  // the tree, where a control character in a regex is far likelier to be a
  // mistake (see the header comment above about the literal-NUL incident).
  // eslint-disable-next-line no-control-regex
  .replace(/\u0000/g, '.*') + '$')

const matchGlobs = (files, patterns) => {
  if (!patterns?.length) return []
  const res = patterns.map(globToRe)
  return files.filter((f) => res.some((re) => re.test(f)))
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * An asset reference is a path sitting inside a quoted attribute, a url(), or an
 * import — bounded on both sides. Matching the bare basename anywhere in the text
 * was wrong twice over: "logo.png" and "img/logo.png" collided (the second
 * uploaded but was never referenced), and the word appearing in prose or a
 * comment was rewritten into an asset URL.
 */
const refPattern = (rel, base) => {
  // The left boundary is deliberately strict — a quote, url(, or an unquoted
  // attribute's =. Allowing plain whitespace there would match "we replaced the
  // old logo.png last week" in a paragraph and rewrite the prose into a URL.
  const alts = rel === base ? [escapeRe(rel)] : [escapeRe(rel), escapeRe(base)]
  return new RegExp(`(^|['"\`(=])(\\.?\\/)?(${alts.join('|')})(?=['"\`)>\\s?#,;]|$)`, 'g')
}

const referencesAsset = (text, rel, base) => refPattern(rel, base).test(text)

const rewriteAssetRefs = (text, rel, base, url) =>
  text.replace(refPattern(rel, base), (_m, lead) => `${lead}${url}`)

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const manifestPath = args.manifest
    ? path.resolve(args.manifest)
    : path.resolve(args.repo || process.cwd(), 'di-space.json')
  const repoDir = args.repo ? path.resolve(args.repo) : path.dirname(manifestPath)

  let manifest
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  } catch (e) {
    console.error(`Cannot read manifest at ${manifestPath}: ${e.message}`)
    process.exitCode = 1; return
  }

  const env = {
    ...(await loadEnvFile(path.join(ROOT_DIR, '.env'))),
    ...(await loadEnvFile(path.join(ROOT_DIR, '.env.local'))),
    ...(await loadEnvFile(path.join(ROOT_DIR, 'serverXR', '.env.local'))),
  }
  const getEnv = (k) => process.env[k] || env[k] || ''
  // No default target. This used to fall back to production, so a run that
  // simply forgot --to wrote to the live space while reading like a rehearsal.
  const target = args.to || manifest.live || getEnv('LIVE_API_URL')
  if (!target) {
    console.error('Error: no target. Pass --to <url>, set LIVE_API_URL, or put "live" in the manifest.')
    console.error('  staging: https://staging.di-studio.xyz/serverXR')
    console.error('  prod:    https://di-studio.xyz/serverXR')
    process.exitCode = 1; return
  }
  const live = target.replace(/\/+$/, '')
  const token = args.token || getEnv('LIVE_API_TOKEN') || getEnv('API_TOKEN') || ''

  const { spaceId, projectId, entry } = manifest
  if (!spaceId || !projectId || !entry) {
    console.error('Manifest must include spaceId, projectId, and entry.'); process.exitCode = 1; return
  }
  if (Number(manifest.minEngine || 0) > ENGINE_VERSION) {
    console.error(`Error: ${path.basename(manifestPath)} needs engine v${manifest.minEngine}, this copy is v${ENGINE_VERSION}.`)
    console.error('  Re-vendor from di.iiii: node scripts/space-sync-vendor.mjs --write')
    process.exitCode = 1; return
  }
  if (!token) {
    console.error('Error: editor token required (--token or LIVE_API_TOKEN / API_TOKEN).'); process.exitCode = 1; return
  }

  console.log(`[space-sync] ${spaceId} ← ${repoDir}`)
  console.log(`  live: ${live}   dry-run: ${args.dryRun ? 'yes' : 'no'}`)

  // 1. ensure space (idempotent create)
  let space = (await api(`${live}/api/spaces/${spaceId}`, { headers: buildHeaders(token) })).body?.space
  if (!space) {
    if (args.dryRun) { console.log(`  would CREATE space ${spaceId}`) }
    else {
      space = (await apiOrThrow(`${live}/api/spaces`, {
        method: 'POST', headers: buildHeaders(token),
        body: JSON.stringify({ label: manifest.label || spaceId, slug: spaceId }),
      })).space
      console.log(`  + created space ${space.id}`)
    }
  } else {
    console.log(`  · space ${space.id} exists`)
  }
  const canonicalSpace = space?.id || spaceId

  // 2. ensure project (idempotent create)
  const projects = (await api(`${live}/api/spaces/${canonicalSpace}/projects`, { headers: buildHeaders(token) })).body?.projects || []
  let project = projects.find((p) => p.id === projectId)
  if (!project) {
    if (args.dryRun) { console.log(`  would CREATE project ${projectId}`) }
    else {
      const r = await api(`${live}/api/spaces/${canonicalSpace}/projects`, {
        method: 'POST', headers: buildHeaders(token),
        body: JSON.stringify({ title: manifest.label || projectId, slug: projectId }),
      })
      if (r.status === 409) {
        throw new Error(`projectId "${projectId}" is already in use — project ids are GLOBAL across di.iiii. Pick a unique projectId in di-space.json (e.g. "${spaceId}-home").`)
      }
      if (!r.ok) throw new Error(`HTTP ${r.status} creating project: ${r.body?.error || JSON.stringify(r.body).slice(0, 120)}`)
      project = r.body.project
      console.log(`  + created project ${project.id}`)
    }
  } else {
    console.log(`  · project ${project.id} exists`)
  }
  const canonicalProject = project?.id || projectId

  // 2b. Enforce the vanity slug on EVERY run, not just at creation. The slug is
  // what makes /br_id_ge/rite a URL at all, and it was only ever set when the
  // project was first created — so a tier that got its projects any other way
  // (a bundle copy, a hand-made project) had null slugs and answered 404 on the
  // one address the door links to, while its content sat there perfectly synced.
  if (manifest.slug && project && project.slug !== manifest.slug && !args.dryRun) {
    const r = await api(`${live}/api/projects/${canonicalProject}`, {
      method: 'PATCH', headers: buildHeaders(token),
      body: JSON.stringify({ slug: manifest.slug }),
    })
    if (r.ok) console.log(`  ✓ slug ${project.slug || '(none)'} → ${manifest.slug}`)
    else if (r.status === 409) console.log(`  ⚠ slug "${manifest.slug}" already taken in this space — left as is`)
    else if (r.status === 403) console.log(`  ⚠ slug change skipped (owner/admin only)`)
    else throw new Error(`HTTP ${r.status} setting slug: ${r.body?.error || ''}`)
  } else if (manifest.slug && args.dryRun && project?.slug !== manifest.slug) {
    console.log(`  would SET slug ${project?.slug || '(none)'} → ${manifest.slug}`)
  }

  // 2c. Same story one field over: the title was ALSO only ever sent at
  // creation, so renaming a surface in the manifest reached no tier that
  // already had it. `di-space.field.json` read "the field — every crossing,
  // together" while all three tiers went on saying "the field" — the repo is
  // meant to be master for these names, and silently was not.
  const wantTitle = manifest.label
  if (wantTitle && project && project.title !== wantTitle && !args.dryRun) {
    const r = await api(`${live}/api/projects/${canonicalProject}`, {
      method: 'PATCH', headers: buildHeaders(token),
      body: JSON.stringify({ title: wantTitle }),
    })
    if (r.ok) console.log(`  ✓ title ${JSON.stringify(project.title)} → ${JSON.stringify(wantTitle)}`)
    else if (r.status === 403) console.log('  ⚠ title change skipped (owner/admin only)')
    else throw new Error(`HTTP ${r.status} setting title: ${r.body?.error || ''}`)
  } else if (wantTitle && args.dryRun && project?.title !== wantTitle) {
    console.log(`  would SET title ${JSON.stringify(project?.title)} → ${JSON.stringify(wantTitle)}`)
  }

  // 3. read code files (entry + include globs)
  const repoFiles = await walk(repoDir)
  const entryRel = entry.replace(/^\.?\//, '')
  let entryHtml
  try { entryHtml = await fs.readFile(path.join(repoDir, entryRel), 'utf8') }
  catch { console.error(`  entry file not found: ${entryRel}`); process.exitCode = 1; return }

  // 3b. Point the page at the tier it is being synced INTO. The surfaces name
  // their own back end in the markup (mesh-url, field-url, the field link),
  // because inside a published page location.origin is the srcdoc frame's and
  // tells you nothing. Left alone, a staging copy would look like a rehearsal
  // while writing every crossing to the live field.
  const liveHost = new URL(live).host
  const PROD_HOST = 'di-studio.xyz'
  if (liveHost !== PROD_HOST) {
    const before = entryHtml
    // lookbehind so "staging.di-studio.xyz" is never re-prefixed into itself
    entryHtml = entryHtml.replace(/(?<![\w.-])di-studio\.xyz/g, liveHost)
    if (before !== entryHtml) console.log(`  ⇄ retargeted ${PROD_HOST} → ${liveHost}`)
  }

  // 4. upload referenced assets, rewrite their URLs in the entry HTML.
  // "Referenced" is judged across the entry AND every include, because an asset
  // named only from an included stylesheet used to be skipped and 404 in the
  // published page.
  const includeRel = matchGlobs(repoFiles, manifest.include).filter((rel) => rel !== entryRel
    && CODE_EXTENSIONS.has(path.extname(rel).toLowerCase()))
  const includeSources = new Map()
  for (const rel of includeRel) {
    includeSources.set(rel, await fs.readFile(path.join(repoDir, rel), 'utf8'))
  }
  const assetFiles = matchGlobs(repoFiles, manifest.assets)
  const uploaded = []
  for (const rel of assetFiles) {
    const base = path.basename(rel)
    const referenced = (text) => referencesAsset(text, rel, base)
    if (!referenced(entryHtml) && ![...includeSources.values()].some(referenced)) continue
    if (args.dryRun) { console.log(`  would UPLOAD asset ${rel}`); continue }
    const buf = await fs.readFile(path.join(repoDir, rel))
    const fd = new FormData()
    fd.append('asset', new Blob([buf], { type: MIME[path.extname(rel).toLowerCase()] || 'application/octet-stream' }), base)
    const r = await apiOrThrow(`${live}/api/projects/${canonicalProject}/assets`, {
      method: 'POST', headers: buildHeaders(token, false), body: fd,
    })
    const url = `/serverXR/api/projects/${canonicalProject}/assets/${r.asset.assetId || r.asset.id}`
    entryHtml = rewriteAssetRefs(entryHtml, rel, base, url)
    for (const [k, v] of includeSources) includeSources.set(k, rewriteAssetRefs(v, rel, base, url))
    uploaded.push(`${rel} → ${url}`)
  }
  uploaded.forEach((u) => console.log(`  ↑ ${u}`))

  // entry must be named index.html so the platform's bundler finds it
  const codeFiles = [{ name: 'index.html', content: entryHtml }]
  for (const rel of includeRel) codeFiles.push({ name: path.basename(rel), content: includeSources.get(rel) })
  console.log(`  code files: ${codeFiles.map((f) => f.name).join(', ')}`)

  if (args.dryRun) { console.log('  dry-run complete — no document written'); return }

  // 5. write document presentation (the /document route is PUT, not PATCH)
  const docUrl = `${live}/api/projects/${canonicalProject}/document`
  const doc = (await apiOrThrow(docUrl, { headers: buildHeaders(token) })).document
  await apiOrThrow(docUrl, {
    method: 'PUT', headers: buildHeaders(token),
    body: JSON.stringify({
      ...doc,
      // deviceAccess: owner opt-in — the viewer only unlocks camera/mic for pages
      // whose manifest declares it (the rite's lamp); absent means sandboxed
      presentationState: { ...(doc?.presentationState || {}), mode: 'code', entryView: 'code', codeFiles, deviceAccess: manifest.deviceAccess === true },
      publishState: { ...(doc?.publishState || {}), shareEnabled: true },
    }),
  })
  console.log(`  ✓ document updated`)

  // 6. publish (best-effort: setting publishedProjectId is a space-level mutation,
  //    admin/owner-only. A scoped sync key can't change publish state — that's
  //    correct least-privilege; publishing is a one-time owner action in di.iiii.)
  if (manifest.publish !== false) {
    const r = await api(`${live}/api/spaces/${canonicalSpace}`, {
      method: 'PATCH', headers: buildHeaders(token),
      body: JSON.stringify({ publishedProjectId: canonicalProject }),
    })
    if (r.ok) console.log(`  ✓ published ${canonicalProject}`)
    else if (r.status === 403) console.log(`  ⚠ publish skipped (owner/admin only) — content updated; set the published project once in di.iiii`)
    else throw new Error(`HTTP ${r.status} publishing: ${r.body?.error || JSON.stringify(r.body).slice(0, 120)}`)
  }

  console.log(`\n  live → ${live.replace(/\/serverXR$/, '')}/${spaceId}`)
}

export { referencesAsset, rewriteAssetRefs, matchGlobs, globToRe }

// Only run when invoked as a script, so the helpers above can be unit-tested.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e?.message || e); process.exitCode = 1 })
}
