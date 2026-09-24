// A space bundle (.diiii) arriving for a space that already exists is a
// PROPOSAL, not an import (plan "Two lines, one safe way in", Phase 2).
//
// Someone exports WCC on their machine, changes it, and sends the file back.
// Before this, the only server door for a file (POST /api/spaces/bundle)
// refused an existing id, and the CLI's `import --force` replaced the space
// wholesale — owner, slug, public flag and all — with no author and no way
// back. Here the same file becomes:
//
//   1. a readable summary: which projects change, entity counts before and
//      after, the scene's object count, how many files arrive, what the file's
//      own history did (spaceHistory's counters), and — loudly — anything this
//      space gained after the file was exported, which applying would discard;
//   2. for a TRUSTED person (the owner, an admin, anyone the per-space trusted
//      hook says yes to): applied now;
//      for everyone else: a `content.apply` row through
//      approvalGate.gateOrApply({ requireApproval: true }), which the inner
//      bot shows with Apply / Reject. Nothing runs until Apply;
//   3. applied the way a restore is applied, not the way an import is: a
//      restore point first (spaceHistory.beforeChange), then each changed
//      project through restoreSpaceProjectDocuments and the scene through
//      replaceSceneAndBroadcast — so the space's settings are untouched,
//      versions only move forward, every op carries the proposer as author,
//      editors that are open resync live, and History → Restore undoes it.
//
// What a proposal does NOT do: delete. A project that is in the space and not
// in the file stays exactly as it is, and the summary says so.
//
// The file is read here, in the server, not by spawning scripts/space-bundle.mjs:
// the server image (serverXR/Dockerfile) ships src/ only, so on dev.diiii.xyz
// and production that script is not there to spawn. Only the reading of the
// format is duplicated (bundle.json, space/, projects/, blobs/), and the
// round-trip contract test exports with the script and proposes with this.

const crypto = require('node:crypto')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')
const { isValidAssetId } = require('./assetHash')
const { getProjectPaths } = require('./projectStore')
const { countOp, emptyCounts, describeCounts } = require('./spaceHistory')
const { actorFromAuthState, publicActor } = require('./opActor')
const { loadSharedModule } = require('./sharedRuntime')

// What a replace removes (shared/documentLoss.cjs — the same count the CLI
// tools print). 2026-09-18: a whole-document carry removed 76 slides from
// prod's front room and nothing said so. A file that removes media is refused
// unless the sender names the exact number, and the approver reads it first.
const { diffDocumentLoss, describeLoss, lossGate } = loadSharedModule('documentLoss.cjs')

const execFileAsync = promisify(execFile)

const BUNDLE_FORMAT = 'di.space-bundle'
const BUNDLE_VERSION = 1
const KIND = 'content.apply'
const SUMMARY_MAX = 3500 // a Telegram message is 4096; the bot adds its own frame
const PROJECT_ID_RE = /^[A-Za-z0-9_-]{1,128}$/

const proposalError = (status, message, extra = {}) => Object.assign(new Error(message), { status, ...extra })

const sha256File = (file) => new Promise((resolve, reject) => {
  const hash = crypto.createHash('sha256')
  fs.createReadStream(file).on('error', reject).on('data', (c) => hash.update(c)).on('end', () => resolve(hash.digest('hex')))
})

// Regular files only. A tar can carry a symlink named like a document or a
// blob; following it would read (or later serve) something outside the bundle.
const isRegularFile = async (file) => {
  try { return (await fsp.lstat(file)).isFile() } catch { return false }
}
const readJsonSafe = async (file) => {
  if (!(await isRegularFile(file))) return null
  try { return JSON.parse(await fsp.readFile(file, 'utf8')) } catch { return null }
}
const listDir = async (dir) => {
  try { return await fsp.readdir(dir) } catch { return [] }
}

// ops.jsonl rows are { version, data, created_at } with `data` the op as JSON.
const readJsonl = async (file) => {
  if (!(await isRegularFile(file))) return []
  return (await fsp.readFile(file, 'utf8')).split('\n').filter(Boolean)
    .map((line) => { try { return JSON.parse(line) } catch { return null } }).filter(Boolean)
}
const opOf = (row) => {
  if (typeof row?.data !== 'string') return row
  try { return JSON.parse(row.data) } catch { return null }
}
const opIdsOf = (rows) => new Set(rows.map((row) => opOf(row)?.opId).filter(Boolean))

const countDocumentItems = (document) => {
  const size = (value) => Array.isArray(value) ? value.length : (value && typeof value === 'object' ? Object.keys(value).length : 0)
  return size(document?.entities) + size(document?.nodes)
}
const countSceneObjects = (scene) => Array.isArray(scene?.objects) ? scene.objects.length : 0
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

// Space-level asset URLs carry the space id; a file exported from `wcc-emilya`
// proposed for `wcc` must point at `wcc`'s assets. Same rule as the script's
// remapSpaceUrls.
const remapSpaceUrls = (value, fromId, toId) => {
  if (!value || fromId === toId) return value
  return JSON.parse(JSON.stringify(value).split(`/api/spaces/${fromId}/`).join(`/api/spaces/${toId}/`))
}

// ── reading a bundle ───────────────────────────────────────────────────────

async function readBundle(file, { tmpRoot = os.tmpdir(), schemaVersion = null } = {}) {
  const dir = await fsp.mkdtemp(path.join(tmpRoot, 'di-proposal-'))
  const cleanup = () => fsp.rm(dir, { recursive: true, force: true }).catch(() => {})
  try {
    let listing
    try {
      listing = (await execFileAsync('tar', ['-tzf', file], { maxBuffer: 64 * 1024 * 1024 })).stdout
    } catch {
      throw proposalError(400, 'That is not a di.iiii file (it could not be opened as one).')
    }
    // Refused before anything is written: an absolute member or a `..` step
    // is how a tar writes outside the directory it is unpacked into.
    const unsafe = listing.split('\n').filter(Boolean).find((name) => name.startsWith('/') || name.split(/[\\/]/).includes('..'))
    if (unsafe) throw proposalError(400, 'That file names paths outside itself and was refused.')
    await execFileAsync('tar', ['-xzf', file, '-C', dir])

    const manifest = await readJsonSafe(path.join(dir, 'bundle.json'))
    if (!manifest) throw proposalError(400, 'That is not a di.iiii file (bundle.json is missing).')
    if (manifest.format !== BUNDLE_FORMAT) throw proposalError(400, `Unknown file format "${manifest.format}".`)
    if (Number(manifest.version) > BUNDLE_VERSION) throw proposalError(400, `This file is format ${manifest.version}; this di.iiii reads ${BUNDLE_VERSION}. Update first.`)
    if (Number.isInteger(manifest.schemaVersion) && Number.isInteger(schemaVersion) && manifest.schemaVersion > schemaVersion) {
      throw proposalError(400, `This file was written by a newer di.iiii${manifest.writtenBy ? ` (${manifest.writtenBy})` : ''}. Update first.`)
    }

    const space = (await readJsonSafe(path.join(dir, 'space', 'meta.json'))) || {}
    const scene = await readJsonSafe(path.join(dir, 'space', 'scene.json'))
    const sceneOpIds = opIdsOf(await readJsonl(path.join(dir, 'space', 'ops.jsonl')))
    const projects = []
    for (const pid of (await listDir(path.join(dir, 'projects'))).sort()) {
      if (!PROJECT_ID_RE.test(pid)) continue
      const pdir = path.join(dir, 'projects', pid)
      const meta = (await readJsonSafe(path.join(pdir, 'meta.json'))) || {}
      const document = await readJsonSafe(path.join(pdir, 'document.json'))
      if (!document || typeof document !== 'object') continue
      const assets = {}
      const assetFiles = []
      for (const name of await listDir(path.join(pdir, 'assets'))) {
        const full = path.join(pdir, 'assets', name)
        if (!(await isRegularFile(full))) continue
        if (name.endsWith('.json') && isValidAssetId(name.slice(0, -5))) {
          const m = await readJsonSafe(full)
          if (m && typeof m === 'object') assets[name.slice(0, -5)] = m
        } else if (isValidAssetId(name)) {
          assetFiles.push(name)
        }
      }
      const ops = await readJsonl(path.join(pdir, 'ops.jsonl'))
      projects.push({
        id: pid,
        meta: { title: typeof meta.title === 'string' ? meta.title : null, source: meta.source || null, slug: meta.slug || null },
        documentVersion: Number(meta.document_version) || 0,
        document,
        assets,
        assetFiles,
        ops,
        opIds: opIdsOf(ops)
      })
    }

    const blobs = []
    for (const name of await listDir(path.join(dir, 'blobs'))) {
      if (isValidAssetId(name) && await isRegularFile(path.join(dir, 'blobs', name))) blobs.push(name)
    }
    const spaceAssets = []
    for (const name of await listDir(path.join(dir, 'space', 'assets'))) {
      const id = name.endsWith('.json') ? name.slice(0, -5) : name
      if (isValidAssetId(id) && await isRegularFile(path.join(dir, 'space', 'assets', name))) spaceAssets.push(name)
    }

    return { dir, cleanup, manifest, space, scene, sceneOpIds, projects, blobs, spaceAssets }
  } catch (error) {
    await cleanup()
    throw error
  }
}

// ── the service ────────────────────────────────────────────────────────────

function createContentProposals({
  config,
  dataDir,
  spacesDir,
  approvalGate,
  spaceHistory,
  loadSpaceMeta,
  findProjectById,
  // Trash included — a trashed project must compare as itself, not as new.
  findProjectByIdAny = null,
  listProjectsInSpace,
  getSpacePaths,
  restoreSpaceProjectDocuments,
  replaceSceneAndBroadcast,
  // (kind 'space'|'project', id) → the opId of the newest op row, or null.
  latestOpId = () => null,
  broadcastProjectLiveEvent = null,
  ensureSpaceWritable = async () => {},
  maxOpHistory = 500,
  maxOpAgeMs = 0,
  schemaVersion = null,
  // THE SEAM for the per-space trusted list (owner's decision 2026-09-16:
  // trusted people apply directly). Called as isTrustedExtra(authState, meta)
  // after the built-in rule below says no; return true to let that person
  // apply without a proposal. Until the list exists nothing is passed and only
  // the built-in rule applies.
  isTrustedExtra = null,
  logger = console,
  now = () => Date.now()
}) {
  const proposalsDir = path.join(dataDir, 'proposals')
  const ttlMs = () => Number(config?.approval?.proposalTtlMs) > 0 ? Number(config.approval.proposalTtlMs) : 3 * 24 * 60 * 60 * 1000

  const isTrusted = async (state = {}, meta) => {
    if (state.isUnrestricted || state.role === 'admin') return true
    if (!meta) return false
    const subject = state.type === 'session' ? state.subject : null
    if (subject && meta.ownerUserId && meta.ownerUserId === subject) return true
    // Somebody's own sandbox stays free — the route's scope check has already
    // said this person may reach it. The Open Space does NOT: a whole file
    // replacing the communal space is exactly what should be looked at.
    if (meta.kind === 'sandbox') return true
    if (typeof isTrustedExtra === 'function') {
      try { return Boolean(await isTrustedExtra(state, meta)) } catch { return false }
    }
    return false
  }

  const blobPresent = (spaceId, id) => fs.existsSync(path.join(spacesDir, spaceId, 'blobs', id))

  // Everything a person needs to say yes or no, as data and as words.
  const inspect = async (spaceId, bundle, meta) => {
    const sourceId = bundle.manifest.spaceId || bundle.space.id || spaceId
    const projects = []
    const collisions = []
    const inBundle = new Set()
    for (const entry of bundle.projects) {
      inBundle.add(entry.id)
      const found = await (findProjectByIdAny || findProjectById)(entry.id)
      if (found && found.spaceId !== spaceId) { collisions.push({ id: entry.id, spaceId: found.spaceId }); continue }
      const document = remapSpaceUrls(entry.document, sourceId, spaceId)
      let current = null
      let currentVersion = 0
      if (found) {
        const { documentPath } = getProjectPaths(spacesDir, spaceId, entry.id)
        current = await readJsonSafe(documentPath)
        currentVersion = Number(found.meta?.documentVersion) || 0
      }
      const status = !found ? 'added' : (JSON.stringify(current) === JSON.stringify(document) ? 'unchanged' : 'changed')
      // The file's own op log past this space's version of the project: what
      // the other person actually did, in the words History already uses.
      const counts = emptyCounts()
      for (const row of entry.ops) {
        if (found && (Number(row.version) || 0) <= currentVersion) continue
        countOp(counts, opOf(row))
      }
      // Does the file descend from what is here? The newest op this project
      // has here must be somewhere in the file's own history; if it is not,
      // someone changed it here after the file's author last pulled — whenever
      // they exported. (No op id to compare = cannot tell, so not flagged.)
      const latestHere = found ? latestOpId('project', entry.id) : null
      const diverged = Boolean(latestHere) && status !== 'unchanged' && !entry.opIds.has(latestHere)
      const loss = status === 'changed' ? diffDocumentLoss(current, document) : null
      projects.push({
        id: entry.id,
        diverged,
        mediaLost: loss ? loss.mediaLost : 0,
        removed: loss ? loss.removed.length : 0,
        lossText: loss && (loss.removed.length || loss.assetChanged.length) ? describeLoss(loss, entry.meta.title || found?.meta?.title || entry.id) : null,
        title: entry.meta.title || found?.meta?.title || entry.document?.projectMeta?.title || entry.id,
        status,
        inTrash: Boolean(found?.meta?.deletedAt),
        itemsBefore: found ? countDocumentItems(current) : 0,
        itemsAfter: countDocumentItems(document),
        history: counts.ops ? describeCounts(counts) : null
      })
    }
    const kept = (await listProjectsInSpace(spaceId))
      .filter((p) => !inBundle.has(p.id))
      .map((p) => ({ id: p.id, title: p.title || p.id }))

    const { scenePath } = getSpacePaths(spaceId)
    const currentScene = await readJsonSafe(scenePath)
    const nextScene = bundle.scene ? remapSpaceUrls(bundle.scene, sourceId, spaceId) : null
    const latestSceneOp = nextScene ? latestOpId('space', spaceId) : null
    const sceneChanged = Boolean(nextScene) && JSON.stringify(currentScene) !== JSON.stringify(nextScene)
    const sceneLoss = sceneChanged ? diffDocumentLoss(currentScene, nextScene) : null
    const scene = {
      mediaLost: sceneLoss ? sceneLoss.mediaLost : 0,
      lossText: sceneLoss && (sceneLoss.removed.length || sceneLoss.assetChanged.length) ? describeLoss(sceneLoss, 'scene') : null,
      diverged: Boolean(latestSceneOp) && JSON.stringify(currentScene) !== JSON.stringify(nextScene) && !bundle.sceneOpIds.has(latestSceneOp),
      inFile: Boolean(nextScene),
      changed: sceneChanged,
      objectsBefore: countSceneObjects(currentScene),
      objectsAfter: nextScene ? countSceneObjects(nextScene) : countSceneObjects(currentScene)
    }

    const newFiles = new Set(bundle.blobs.filter((id) => !blobPresent(spaceId, id)))
    for (const entry of bundle.projects) {
      for (const id of entry.assetFiles) {
        if (!fs.existsSync(path.join(getProjectPaths(spacesDir, spaceId, entry.id).assetsDir, id)) && !blobPresent(spaceId, id)) newFiles.add(id)
      }
    }
    for (const name of bundle.spaceAssets) {
      if (!name.endsWith('.json') && !fs.existsSync(path.join(getSpacePaths(spaceId).assetsDir, name))) newFiles.add(name)
    }

    // Work this space gained after the file was made. Applying replaces the
    // projects and scene the file carries, so this is what would be lost.
    const exportedAtMs = Date.parse(bundle.manifest.exportedAt)
    const newer = Number.isFinite(exportedAtMs)
      ? spaceHistory.summarizeChanges(spaceId, { since: exportedAtMs }).map((g) => ({ actor: g.actor, from: g.from, to: g.to, text: g.text }))
      : []

    const divergedParts = [
      ...(scene.diverged ? ['scene'] : []),
      ...projects.filter((p) => p.diverged).map((p) => p.title)
    ]
    return {
      spaceId,
      divergedParts,
      spaceLabel: meta?.label || spaceId,
      sourceSpaceId: sourceId,
      exportedAt: bundle.manifest.exportedAt || null,
      writtenBy: bundle.manifest.writtenBy || null,
      projects,
      keptProjects: kept,
      collisions,
      scene,
      filesAdded: newFiles.size,
      newerHere: newer,
      mediaLost: projects.reduce((n, p) => n + p.mediaLost, 0) + scene.mediaLost,
      nothingToApply: !scene.changed && projects.every((p) => p.status === 'unchanged')
    }
  }

  const describe = (summary, { proposer, from, mode }) => {
    const lines = []
    lines.push(`${{ applied: 'Applied', dry: 'Would apply' }[mode] || 'Proposal'}: a file for ${summary.spaceLabel} (${summary.spaceId})`)
    const who = from ? `${from} (sent by ${proposer.label})` : proposer.label
    lines.push(`From: ${who}${summary.exportedAt ? ` · file made ${summary.exportedAt.slice(0, 16).replace('T', ' ')} UTC` : ''}${summary.sourceSpaceId !== summary.spaceId ? ` · exported from "${summary.sourceSpaceId}"` : ''}`)
    // First, so a long summary is never cut before it: what applying removes.
    const lossTexts = [...summary.projects.map((p) => p.lossText), summary.scene.lossText].filter(Boolean)
    if (lossTexts.length) {
      lines.push(summary.mediaLost ? `⚠ REMOVES ${plural(summary.mediaLost, 'media item')}:` : 'Removes:')
      for (const text of lossTexts) lines.push(text)
    }
    const changed = summary.projects.filter((p) => p.status !== 'unchanged')
    if (changed.length) {
      lines.push('Projects:')
      for (const p of changed) {
        const counts = p.status === 'added'
          ? `new, ${plural(p.itemsAfter, 'item')}`
          : `${p.itemsBefore} → ${p.itemsAfter} items`
        lines.push(`· ${p.title} — ${p.status === 'added' ? 'added' : 'changed'}: ${counts}${p.history ? ` (${p.history})` : ''}${p.inTrash ? ' — in the trash here' : ''}`)
      }
    } else {
      lines.push('Projects: no project changes')
    }
    const same = summary.projects.length - changed.length
    if (same) lines.push(`· ${plural(same, 'project')} in the file already match`)
    if (summary.keptProjects.length) lines.push(`· not in the file, stay as they are: ${summary.keptProjects.map((p) => p.title).join(', ')}`)
    if (summary.scene.changed) lines.push(`Scene: replaced, ${summary.scene.objectsBefore} → ${summary.scene.objectsAfter} objects`)
    if (summary.filesAdded) lines.push(`Files: +${plural(summary.filesAdded, 'new file')}`)
    if (summary.newerHere.length || summary.divergedParts.length) {
      lines.push('⚠ Newer here than the file — applying overwrites these:')
      for (const g of summary.newerHere.slice(0, 5)) lines.push(`· ${g.text}`)
      if (summary.divergedParts.length) lines.push(`· changed here after the file's author last pulled: ${summary.divergedParts.join(', ')}`)
    }
    lines.push('A restore point is taken first; History → Restore puts it back.')
    const text = lines.join('\n')
    return text.length > SUMMARY_MAX ? `${text.slice(0, SUMMARY_MAX - 1)}…` : text
  }

  // ── applying ──────────────────────────────────────────────────────────────

  const copyIfMissing = async (from, to) => {
    if (fs.existsSync(to) || !(await isRegularFile(from))) return false
    await fsp.mkdir(path.dirname(to), { recursive: true })
    await fsp.copyFile(from, to)
    return true
  }

  const applyBundle = async (spaceId, bundle, actor, { acceptLoss = null } = {}) => {
    await ensureSpaceWritable(spaceId)
    const meta = await loadSpaceMeta(spaceId)
    if (!meta) throw proposalError(404, 'That space is not here any more.')
    const summary = await inspect(spaceId, bundle, meta)
    if (summary.collisions.length) throw proposalError(409, 'A project in the file belongs to another space here.', { code: 'project_collision' })
    // Checked again at the moment of writing: a count given for one summary
    // never covers another.
    const gate = lossGate({ mediaLost: summary.mediaLost, acceptLoss })
    if (!gate.ok) throw proposalError(409, gate.message, { code: 'media_loss' })
    const sourceId = summary.sourceSpaceId

    const restorePoint = await spaceHistory.beforeChange(spaceId, actor, { reason: 'before-proposal-apply' })

    // Bytes first, so every document and manifest that arrives next points at
    // something already here. Content-addressed: an id that is present is the
    // same bytes, so nothing existing is ever overwritten — and nothing is
    // removed, which is what keeps the restore point's images alive.
    for (const id of bundle.blobs) {
      await copyIfMissing(path.join(bundle.dir, 'blobs', id), path.join(spacesDir, spaceId, 'blobs', id))
    }
    for (const name of bundle.spaceAssets) {
      await copyIfMissing(path.join(bundle.dir, 'space', 'assets', name), path.join(getSpacePaths(spaceId).assetsDir, name))
    }
    for (const entry of bundle.projects) {
      for (const id of entry.assetFiles) {
        await copyIfMissing(path.join(bundle.dir, 'projects', entry.id, 'assets', id), path.join(getProjectPaths(spacesDir, spaceId, entry.id).assetsDir, id))
      }
    }

    // The project row keeps what the space decided (its slug, its source);
    // only the title may arrive with the file. A new project keeps the file's
    // slug unless this space already uses it — restore writes `slug` as given,
    // and a clash would fail the write halfway through.
    const here = await listProjectsInSpace(spaceId)
    const slugsHere = new Set(here.map((p) => p.slug).filter(Boolean))
    const toApply = []
    for (const entry of bundle.projects) {
      if (summary.projects.find((p) => p.id === entry.id)?.status === 'unchanged') continue
      const existing = here.find((p) => p.id === entry.id)
      const slug = existing ? existing.slug : (entry.meta.slug && !slugsHere.has(entry.meta.slug) ? entry.meta.slug : null)
      toApply.push({
        id: entry.id,
        meta: { slug, title: entry.meta.title || existing?.title, source: existing ? existing.source : entry.meta.source || undefined },
        document: remapSpaceUrls(entry.document, sourceId, spaceId),
        assets: entry.assets
      })
    }
    const restored = toApply.length
      ? await restoreSpaceProjectDocuments(spaceId, toApply, { maxOpHistory, maxOpAgeMs, actor })
      : []
    for (const r of restored) {
      if (typeof broadcastProjectLiveEvent === 'function') await broadcastProjectLiveEvent(r.projectId, 'project-op', { version: r.version, ops: r.ops })
    }
    const sceneResult = summary.scene.changed
      ? await replaceSceneAndBroadcast(spaceId, remapSpaceUrls(bundle.scene, sourceId, spaceId), { actor, restoreReason: null })
      : null

    return {
      ok: true,
      spaceId,
      restorePoint: restorePoint?.id || null,
      projects: restored.map((r) => ({ id: r.projectId, version: r.version })),
      scene: sceneResult ? { newVersion: sceneResult.newVersion, objectsBefore: sceneResult.objectsBefore, objectsAfter: sceneResult.objectsAfter } : null
    }
  }

  const storedPath = (sha) => path.join(proposalsDir, `${sha}.diiii`)

  // Files for proposals nobody decided are removed once they are well past
  // their expiry. Best effort; a stray file costs disk, not correctness.
  const sweepStored = async () => {
    const cutoff = now() - 2 * ttlMs()
    for (const name of await listDir(proposalsDir)) {
      const full = path.join(proposalsDir, name)
      try { if ((await fsp.stat(full)).mtimeMs < cutoff) await fsp.rm(full, { force: true }) } catch { /* gone */ }
    }
  }

  // The executor the gate calls on Apply. Everything it needs is in `args`,
  // which the intent hash binds: the file by its sha-256, the space, the
  // proposer, and the moment the proposal was made.
  const execute = async (args) => {
    const { spaceId, bundleSha256 } = args || {}
    const sha = String(bundleSha256 || '')
    if (!/^[a-f0-9]{64}$/.test(sha) || !spaceId || typeof spaceId !== 'string') throw new Error('content.apply: malformed proposal')
    const file = storedPath(sha)
    if (!fs.existsSync(file)) throw new Error('content.apply: the proposed file is no longer on this server')
    if ((await sha256File(file)) !== sha) throw new Error('content.apply: the stored file does not match the proposal')
    // The approver read a summary of the space as it was. If anyone changed
    // it since, that summary is no longer what Apply would do.
    const since = Number(args.proposedAt) || 0
    const changedSince = spaceHistory.summarizeChanges(spaceId, { since })
    if (changedSince.length) {
      throw new Error(`content.apply: ${spaceId} changed after this proposal (${changedSince[changedSince.length - 1].text}) — propose the file again`)
    }
    const bundle = await readBundle(file, { schemaVersion })
    try {
      const actor = { actor: args.proposer?.subject || 'unknown', type: args.proposer?.type || null, label: args.proposer?.label || null, role: null }
      return await applyBundle(spaceId, bundle, actor, { acceptLoss: Number.isInteger(args.acceptLoss) ? args.acceptLoss : null })
    } finally {
      await bundle.cleanup()
      await fsp.rm(file, { force: true }).catch(() => {})
    }
  }

  // The route's one call. `mode`: 'auto' (trusted apply, others propose) or
  // 'propose' (always a proposal — the CLI's default, since an admin token
  // is trusted and the point of `propose` is that a person looks).
  const submit = async ({ spaceId, uploadPath, authState = {}, mode = 'auto', from = null, overwriteNewer = false, dryRun = false, acceptLoss = null, req = null }) => {
    const meta = await loadSpaceMeta(spaceId)
    if (!meta) throw proposalError(404, 'Space not found.')
    const bundle = await readBundle(uploadPath, { schemaVersion })
    try {
      const summary = await inspect(spaceId, bundle, meta)
      const actor = actorFromAuthState(authState)
      const trusted = await isTrusted(authState, meta)
      const willApply = mode !== 'propose' && trusted
      const cleanFrom = from ? String(from).replace(/\s+/g, ' ').trim().slice(0, 80) || null : null
      const text = describe(summary, { proposer: publicActor(actor), from: cleanFrom, mode: willApply ? (dryRun ? 'dry' : 'applied') : 'proposal' })
      const base = { summary, text, trusted }
      if (summary.collisions.length) {
        throw proposalError(409, `Projects in this file belong to other spaces here: ${summary.collisions.map((c) => `${c.id} (${c.spaceId})`).join(', ')}.`, { code: 'project_collision', body: base })
      }
      if (dryRun) return { status: 'dry_run', ...base }
      if (summary.nothingToApply) return { status: 'nothing_to_apply', ...base }
      const gate = lossGate({ mediaLost: summary.mediaLost, acceptLoss })
      if (!gate.ok) {
        throw proposalError(409, gate.message.replace(/re-run with --accept-loss (\d+)/, 'send it again with --accept-loss $1 (acceptLoss)'), { code: 'media_loss', body: base })
      }
      if ((summary.newerHere.length || summary.divergedParts.length) && !overwriteNewer) {
        throw proposalError(409, `${summary.spaceLabel} has changes newer than this file. Export a fresh copy, or send again saying overwriteNewer.`, { code: 'target_newer', body: base })
      }
      if (willApply) {
        const result = await applyBundle(spaceId, bundle, actor, { acceptLoss })
        return { status: 'applied', result, ...base }
      }
      // Kept by content hash, so the intent hash binds the exact bytes.
      const sha = await sha256File(uploadPath)
      await fsp.mkdir(proposalsDir, { recursive: true })
      await fsp.copyFile(uploadPath, storedPath(sha))
      sweepStored().catch(() => {})
      const outcome = await approvalGate.gateOrApply({
        kind: KIND,
        args: {
          spaceId,
          bundleSha256: sha,
          proposedAt: now(),
          proposer: publicActor(actor),
          from: cleanFrom,
          overwriteNewer: Boolean(overwriteNewer),
          // Bound into the intent hash: Apply re-counts, and refuses if the
          // file now removes a different number than the approver was shown.
          acceptLoss: summary.mediaLost ? acceptLoss : null
        },
        actorState: authState,
        summary: text,
        req,
        requireApproval: true,
        ttlMs: ttlMs()
      })
      return { status: 'pending_approval', approvalId: outcome.id, expiresAt: outcome.expiresAt, ...base }
    } finally {
      await bundle.cleanup()
    }
  }

  // Re-checked at Apply time, never trusted from the moment of proposing: the
  // space must still be a normal space someone can apply to. The person who
  // PROPOSED needs no authority of their own — the approver's tap is the
  // authority — but a proposal must not outlive its space or turn into a
  // write on a space that became the Open Space in the meantime.
  const reauthorize = async (args) => {
    // A proposal that names no space is refused outright — never looked up
    // under '' (check-fallback-patterns: an identifier must fail loudly, not
    // fall back to a literal).
    const { spaceId } = args || {}
    if (!spaceId || typeof spaceId !== 'string') return false
    const meta = await loadSpaceMeta(spaceId).catch(() => null)
    return Boolean(meta) && meta.kind !== 'global'
  }

  const register = () => {
    approvalGate.registerExecutor(KIND, execute)
    approvalGate.registerReauthorizer(KIND, reauthorize)
  }

  return { submit, inspect, describe, execute, applyBundle, isTrusted, register, KIND, proposalsDir }
}

module.exports = { createContentProposals, readBundle, remapSpaceUrls, KIND }
