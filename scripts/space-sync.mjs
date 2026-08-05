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
 *   node scripts/space-sync.mjs --all --tier staging     # every page the space declares
 *   node scripts/space-sync.mjs --audit                  # compare all tiers, exit 1 on drift
 *   node scripts/space-sync.mjs --repo <dir> [--manifest <path>] [--to <url>] [--token <tok>] [--dry-run]
 *   (defaults: --repo = manifest dir or cwd; --manifest = <repo>/di-space.json)
 *
 * Two manifests, two jobs. `di-space.<page>.json` owns ONE project — its entry
 * file, slug, title, assets. `di-space.space.json` owns the SPACE — its label,
 * visibility, the tier map, and the list of pages that are supposed to exist.
 * Fields in both are reconciled on EVERY run, because the recurring bug in this
 * file's history is a field that was only ever sent when something was created.
 *
 * A space manifest whose `projects` list is EMPTY is a space-only declaration
 * (v6): `--all` reconciles the space and touches no content. That is how a
 * space authored in Studio, or one whose scene is React in `src/`, gets to be
 * declared at all — see spaces/README.md.
 *
 *   node scripts/space-sync.mjs --space spaces/main/di-space.space.json --all --tier prod
 *   npm run spaces:audit                                 # every space this repo declares
 *
 * Auth: --token, else the tier's declared tokenEnv, else LIVE_API_TOKEN /
 * API_TOKEN — from env, the repo's .env.local, or di.iiii serverXR/.env.local.
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

export const ENGINE_VERSION = 6

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CODE_EXTENSIONS = new Set(['.html', '.htm', '.css', '.js', '.mjs', '.txt', '.svg', '.json', '.md'])
const MIME = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.m4v': 'video/x-m4v',
  '.ogg': 'video/ogg', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.glb': 'model/gltf-binary' }

const parseArgs = (argv) => {
  const args = { repo: null, manifest: null, space: null, tier: null, to: null, token: null,
    dryRun: false, all: false, audit: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--repo') { args.repo = argv[++i]; continue }
    if (a === '--manifest') { args.manifest = argv[++i]; continue }
    if (a === '--space') { args.space = argv[++i]; continue }
    if (a === '--tier') { args.tier = argv[++i]; continue }
    if (a === '--to') { args.to = argv[++i]; continue }
    if (a === '--token') { args.token = argv[++i]; continue }
    if (a === '--dry-run') { args.dryRun = true; continue }
    if (a === '--all') { args.all = true; continue }
    if (a === '--audit') { args.audit = true; continue }
  }
  return args
}

/**
 * The space manifest — `di-space.space.json`, one per repo. The project
 * manifests own a page each; this one owns the SPACE, and the list of pages
 * that are supposed to exist in it.
 *
 * It exists because every field that was only ever sent when something was
 * CREATED has since drifted: the project slug (fixed in v3), the project title
 * (v4), and — still, until v5 — the space's own label. Three tiers of br_id_ge
 * carried three different answers for what the space is called, and the only
 * thing that ever noticed was a human with three browser windows open.
 *
 * `tiers` is the other half. A tier is allowed to differ from its siblings only
 * where this file says so (staging's `openInscriptions:false` is intent, not
 * drift). Anything else that differs is a fault the audit reports. A tier with
 * `governed:false` — the dev box — is shown and never enforced or failed on.
 */
const SPACE_MANIFEST = 'di-space.space.json'

const tierOf = (liveUrl, tiers) => {
  const host = (() => { try { return new URL(liveUrl).host } catch { return '' } })()
  for (const [name, t] of Object.entries(tiers || {})) {
    try { if (new URL(t.url).host === host) return name } catch { /* unparseable tier url */ }
  }
  return host || 'unknown'
}

// Fields the repo is master for. Kept in one list so the reconcile, the audit
// and the docs cannot disagree about what "declared" means.
const SPACE_FIELDS = ['label', 'slug', 'isPublic']
const TIER_FIELDS = ['openInscriptions']

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

/**
 * Steps 1 and 1b — the SPACE, with no reference to any page in it.
 *
 * Split out of syncOne because most of di.iiii's spaces have no repo pages at
 * all: `main`, `open`, `azd` and `wcc` are authored in Studio, and
 * `algovrithm`'s scene is React in `src/`. Before this they could not be
 * declared, only remembered — which is the exact condition that let three
 * tiers of br_id_ge answer to three different names. A declaration you cannot
 * apply is a comment.
 *
 * Returns the canonical space id, or null if it could not be reached.
 */
async function reconcileSpace({ spaceId, live, token, args, spaceDecl, tierName }) {
  // 1. ensure space (idempotent create)
  let space = (await api(`${live}/api/spaces/${spaceId}`, { headers: buildHeaders(token) })).body?.space
  if (!space) {
    if (args.dryRun) { console.log(`  would CREATE space ${spaceId}`) }
    else {
      // The space's name comes from the SPACE manifest, never from a page's.
      // `manifest.label` is the label of one project — provisioning a fresh
      // tier from di-space.landing.json used to name the whole space "the
      // landing — the door".
      space = (await apiOrThrow(`${live}/api/spaces`, {
        method: 'POST', headers: buildHeaders(token),
        body: JSON.stringify({ label: spaceDecl?.label || spaceId, slug: spaceDecl?.slug ?? spaceId }),
      })).space
      console.log(`  + created space ${space.id}`)
    }
  } else {
    console.log(`  · space ${space.id} exists`)
  }
  const canonicalSpace = space?.id || spaceId

  // 1b. Reconcile the space itself, on EVERY run — the same lesson as the
  // project slug and the project title, one level up. These were sent in the
  // CREATE POST and nowhere else, so the three tiers of br_id_ge answered
  // `br_id_ge`, `br_id_ge` and `br_id_ge XR_ Notations:vi.ritual` and nothing
  // in the system could tell that was wrong. A field only written at creation
  // is a field that will drift.
  if (space && spaceDecl) {
    const want = {}
    for (const f of SPACE_FIELDS) if (spaceDecl[f] !== undefined) want[f] = spaceDecl[f]
    // Per-tier intent is declared, never remembered: staging keeps
    // openInscriptions:false so a rehearsal crossing leaves no permanent stone.
    const tierDecl = spaceDecl.tiers?.[tierName] || {}
    for (const f of TIER_FIELDS) if (tierDecl[f] !== undefined) want[f] = tierDecl[f]

    const drift = Object.entries(want).filter(([k, v]) => space[k] !== v)
    if (drift.length && args.dryRun) {
      for (const [k, v] of drift) console.log(`  would SET space ${k} ${JSON.stringify(space[k])} → ${JSON.stringify(v)}`)
    } else if (drift.length) {
      const r = await api(`${live}/api/spaces/${canonicalSpace}`, {
        method: 'PATCH', headers: buildHeaders(token),
        body: JSON.stringify(Object.fromEntries(drift)),
      })
      if (r.ok) for (const [k, v] of drift) console.log(`  ✓ space ${k} ${JSON.stringify(space[k])} → ${JSON.stringify(v)}`)
      else if (r.status === 403) console.log('  ⚠ space fields skipped (owner/admin only)')
      else throw new Error(`HTTP ${r.status} setting space fields: ${r.body?.error || ''}`)
    }
  }
  return canonicalSpace
}

async function syncOne({ manifestPath, repoDir, live, token, args, spaceDecl, tierName }) {
  let manifest
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  } catch (e) {
    console.error(`Cannot read manifest at ${manifestPath}: ${e.message}`)
    process.exitCode = 1; return
  }

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

  const canonicalSpace = await reconcileSpace({ spaceId, live, token, args, spaceDecl, tierName })

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

/**
 * --audit — read every tier and print one table.
 *
 * This is the mode the whole v5 change exists for. Every drift the engine has
 * ever grown a fix for was found the same way: a person opened prod, staging
 * and localhost side by side and noticed the names disagreed. That is not a
 * process, it is luck, and it only works for the surfaces someone happens to
 * look at. Reads only — it never writes, so it is safe to run against prod.
 *
 * Exit 1 on undeclared difference, so CI fails on drift instead of a human
 * catching it a month later.
 */
async function audit({ repoDir, spaceDecl, spaceManifestPath, getEnv, args }) {
  if (!spaceDecl) {
    console.error(`Error: --audit needs a space manifest at ${spaceManifestPath}`)
    process.exitCode = 1; return
  }
  const spaceId = spaceDecl.spaceId
  const tiers = Object.entries(spaceDecl.tiers || {})
    .filter(([name]) => !args.tier || args.tier === name)
  if (!tiers.length) { console.error('Error: no tiers to audit.'); process.exitCode = 1; return }

  console.log(`[space-audit] ${spaceId} ← ${repoDir}\n`)

  const spaceOnlyDecl = !(spaceDecl.projects || []).length
  const wantProjects = []
  for (const rel of spaceDecl.projects || []) {
    try {
      const m = JSON.parse(await fs.readFile(path.join(repoDir, rel), 'utf8'))
      wantProjects.push({ id: m.projectId, slug: m.slug ?? null, title: m.label ?? null, from: rel })
    } catch (e) { console.error(`  ⚠ cannot read ${rel}: ${e.message}`) }
  }

  const seen = []
  for (const [name, t] of tiers) {
    const token = args.token || getEnv(t.tokenEnv || '') || getEnv('LIVE_API_TOKEN') || getEnv('API_TOKEN') || ''
    const live = String(t.url || '').replace(/\/+$/, '')
    const row = { name, live, governed: t.governed !== false, space: null, projects: [], error: null }
    try {
      const r = await api(`${live}/api/spaces/${spaceId}`, { headers: buildHeaders(token) }, 1)
      row.space = r.body?.space || null
      if (!row.space) row.error = `no space (HTTP ${r.status})`
      else row.projects = (await api(`${live}/api/spaces/${row.space.id}/projects`,
        { headers: buildHeaders(token) }, 1)).body?.projects || []
    } catch (e) { row.error = e.message }
    seen.push(row)
  }

  const faults = []
  const note = (row, msg) => { if (row.governed) faults.push(`${row.name}: ${msg}`) }
  const pad = (s, n) => String(s).padEnd(n)
  const W = 34

  console.log(`  ${pad('field', 22)}${seen.map((r) => pad(r.name, W)).join('')}`)
  console.log(`  ${'─'.repeat(22 + W * seen.length)}`)

  const line = (label, pick, want) => {
    const vals = seen.map((r) => (r.error ? '—' : pick(r)))
    console.log(`  ${pad(label, 22)}${vals.map((v, i) => {
      const ok = want === undefined || v === want || !seen[i].governed || seen[i].error
      return pad(`${ok ? ' ' : '✗'} ${JSON.stringify(v)}`, W)
    }).join('')}${want === undefined ? '' : `  want ${JSON.stringify(want)}`}`)
    vals.forEach((v, i) => {
      if (want !== undefined && v !== want && !seen[i].error) note(seen[i], `${label} is ${JSON.stringify(v)}, declared ${JSON.stringify(want)}`)
    })
  }

  for (const r of seen) if (r.error) note(r, r.error)

  for (const f of SPACE_FIELDS) {
    if (spaceDecl[f] === undefined) continue
    line(`space.${f}`, (r) => r.space?.[f] ?? null, spaceDecl[f])
  }
  // Per-tier fields have a different want per column, so they cannot use line().
  for (const f of TIER_FIELDS) {
    console.log(`  ${pad(`space.${f}`, 22)}${seen.map((r) => {
      if (r.error) return pad('—', W)
      const want = spaceDecl.tiers?.[r.name]?.[f]
      const v = r.space?.[f] ?? null
      const ok = want === undefined || v === want || !r.governed
      if (!ok) note(r, `${f} is ${JSON.stringify(v)}, declared ${JSON.stringify(want)}`)
      return pad(`${ok ? ' ' : '✗'} ${JSON.stringify(v)}${want === undefined ? ' (undeclared)' : ''}`, W)
    }).join('')}`)
  }
  console.log(`  ${pad('projects', 22)}${seen.map((r) => pad(r.error ? '—' : r.projects.length, W)).join('')}${spaceOnlyDecl ? '  (not declared here)' : `  want ${wantProjects.length}`}`)
  console.log('')

  for (const w of wantProjects) {
    const cells = seen.map((r) => {
      if (r.error) return pad('—', W)
      const p = r.projects.find((x) => x.id === w.id)
      if (!p) { note(r, `project ${w.id} missing`); return pad('✗ missing', W) }
      const bad = []
      if (w.slug !== null && (p.slug ?? null) !== w.slug) bad.push(`slug=${JSON.stringify(p.slug ?? null)}`)
      if (w.title !== null && p.title !== w.title) bad.push(`title=${JSON.stringify(p.title)}`)
      if (bad.length) note(r, `project ${w.id} ${bad.join(' ')}`)
      return pad(bad.length ? `✗ ${bad.join(' ')}` : '  ok', W)
    })
    console.log(`  ${pad(w.id, 22)}${cells.join('')}`)
  }

  // Extras are REPORTED, never removed. Deleting a project is the one operation
  // here that can destroy work nobody has a copy of, so it stays a thing a human
  // types on purpose — this only makes sure they can see it.
  //
  // A space-only declaration changes what "extra" MEANS. `wcc` holds eleven
  // Studio-authored projects and is supposed to; calling them "not in the repo"
  // reads as eleven faults and would push someone toward deleting the show.
  const declared = new Set(wantProjects.map((w) => w.id))
  for (const r of seen) {
    const extra = r.projects.filter((p) => !declared.has(p.id)).map((p) => p.id)
    if (!extra.length) continue
    const head = spaceOnlyDecl
      ? `  ${r.name}: ${extra.length} project(s), authored in Studio — this repo declares the space, not its pages`
      : `  ${r.name}: ${extra.length} project(s) not in the repo`
    console.log(`\n${head}\n    ${extra.slice(0, 12).join(', ')}${extra.length > 12 ? `, … +${extra.length - 12}` : ''}`)
    if (r.governed && !spaceOnlyDecl) console.log('    (reported only — removal is a deliberate act, never a sync)')
  }

  const ungoverned = seen.filter((r) => !r.governed).map((r) => r.name)
  if (ungoverned.length) console.log(`\n  not governed (shown, never enforced): ${ungoverned.join(', ')}`)

  if (faults.length) {
    console.log(`\n  ✗ ${faults.length} undeclared difference(s):`)
    for (const f of faults) console.log(`    · ${f}`)
    console.log('\n  fix: node scripts/space-sync.mjs --all --to <tier url>')
    process.exitCode = 1
  } else {
    console.log('\n  ✓ every governed tier matches the repo.')
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const repoDir = path.resolve(args.repo
    || (args.manifest ? path.dirname(args.manifest) : process.cwd()))

  const env = {
    ...(await loadEnvFile(path.join(ROOT_DIR, '.env'))),
    ...(await loadEnvFile(path.join(ROOT_DIR, '.env.local'))),
    ...(await loadEnvFile(path.join(ROOT_DIR, 'serverXR', '.env.local'))),
    ...(await loadEnvFile(path.join(repoDir, '.env.local'))),
  }
  const getEnv = (k) => process.env[k] || env[k] || ''

  const spaceManifestPath = path.resolve(args.space || path.join(repoDir, SPACE_MANIFEST))
  let spaceDecl = null
  try { spaceDecl = JSON.parse(await fs.readFile(spaceManifestPath, 'utf8')) }
  catch (e) {
    if (args.all || args.audit || args.space) {
      console.error(`Cannot read space manifest at ${spaceManifestPath}: ${e.message}`)
      process.exitCode = 1; return
    }
  }

  if (Number(spaceDecl?.minEngine || 0) > ENGINE_VERSION) {
    console.error(`Error: ${SPACE_MANIFEST} needs engine v${spaceDecl.minEngine}, this copy is v${ENGINE_VERSION}.`)
    console.error('  Re-vendor from di.iiii: node scripts/space-sync-vendor.mjs --write')
    process.exitCode = 1; return
  }

  if (args.audit) return audit({ repoDir, spaceDecl, spaceManifestPath, getEnv, args })

  // A tier can be named instead of spelled out, once the space manifest knows
  // the map: --tier staging beats pasting a serverXR URL from memory.
  const named = args.tier ? spaceDecl?.tiers?.[args.tier] : null
  if (args.tier && !named) {
    console.error(`Error: unknown tier "${args.tier}". Known: ${Object.keys(spaceDecl?.tiers || {}).join(', ') || '(none)'}`)
    process.exitCode = 1; return
  }
  // --all is the everyday command: one space, every page it declares, in the
  // order the repo lists them. Four hand-typed invocations is three chances to
  // sync three surfaces and forget the fourth.
  const manifests = args.all
    ? (spaceDecl.projects || []).map((rel) => path.resolve(repoDir, rel))
    : [args.manifest ? path.resolve(args.manifest) : path.join(repoDir, 'di-space.json')]
  // An empty page list is a SPACE-ONLY declaration, not a mistake (v6). Most of
  // di.iiii's own spaces are authored in Studio or are React routes, so they
  // have nothing a manifest could push — but they still have a name and a
  // public flag that drifted per tier with nothing to compare against. This is
  // the only mode that can apply such a declaration; --audit could always read
  // one, and a declaration that can only be read is a comment.
  const spaceOnly = args.all && !manifests.length

  // A single manifest may still pin its own tier (beyond_form and
  // platform_recordar both do). Under --all the space manifest names the tier,
  // and a page pinning one would be a page overriding the space.
  let pinned = null
  if (!args.all && !args.to && !named) {
    try { pinned = JSON.parse(await fs.readFile(manifests[0], 'utf8')).live || null } catch { /* reported by syncOne */ }
  }

  // No default target. This used to fall back to production, so a run that
  // simply forgot --to wrote to the live space while reading like a rehearsal.
  const target = args.to || named?.url || pinned || getEnv('LIVE_API_URL')
  if (!target) {
    console.error('Error: no target. Pass --to <url> or --tier <name>, or set LIVE_API_URL.')
    console.error('  staging: https://staging.di-studio.xyz/serverXR')
    console.error('  prod:    https://di-studio.xyz/serverXR')
    process.exitCode = 1; return
  }
  const live = target.replace(/\/+$/, '')
  const tierName = tierOf(live, spaceDecl?.tiers)
  const token = args.token || getEnv(spaceDecl?.tiers?.[tierName]?.tokenEnv || '')
    || getEnv('LIVE_API_TOKEN') || getEnv('API_TOKEN') || ''
  if (!token) {
    console.error('Error: editor token required (--token or LIVE_API_TOKEN / API_TOKEN).'); process.exitCode = 1; return
  }

  if (spaceOnly) {
    if (!spaceDecl.spaceId) {
      console.error(`Error: ${path.basename(spaceManifestPath)} declares no pages and no spaceId — nothing to sync.`)
      process.exitCode = 1; return
    }
    console.log(`[space-sync] ${spaceDecl.spaceId} ← ${path.basename(spaceManifestPath)} (space only, no pages)`)
    console.log(`  live: ${live}   dry-run: ${args.dryRun ? 'yes' : 'no'}`)
    await reconcileSpace({ spaceId: spaceDecl.spaceId, live, token, args, spaceDecl, tierName })
    return
  }

  for (const manifestPath of manifests) {
    if (manifests.length > 1) console.log('')
    await syncOne({ manifestPath, repoDir, live, token, args, spaceDecl, tierName })
    if (process.exitCode) return
  }
}

export { referencesAsset, rewriteAssetRefs, matchGlobs, globToRe, tierOf, parseArgs, SPACE_FIELDS, TIER_FIELDS, SPACE_MANIFEST }

// Only run when invoked as a script, so the helpers above can be unit-tested.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e?.message || e); process.exitCode = 1 })
}
