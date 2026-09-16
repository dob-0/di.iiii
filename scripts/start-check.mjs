#!/usr/bin/env node
/**
 * start-check.mjs — "is this box the latest, on both lines?" → npm run start-check
 *
 * Two independent things go stale on their own schedule and nothing used to
 * check either before work started:
 *
 *   - CODE: `scripts/repo-state.mjs` (via the SessionStart hook) reports
 *     branch position against the *local* `origin/dev` ref, without ever
 *     fetching — so "behind" was measured against a ref that could be hours
 *     or days old. See docs/ai/local-workflow.md's "four channels" table.
 *   - SPACES: nothing checked at all. Every tier (local / dev / prod) is its
 *     own database, and a space edited on the dev tier while this box's copy
 *     sits untouched produces zero signal from any existing tool — the same
 *     class of silent drift `tier-sync.mjs --audit` was built to catch
 *     between two named tiers, just never run automatically for the tier a
 *     particular box actually holds.
 *
 * This script does both, read-only, and prints ONE headline: LATEST or
 * NOT LATEST — do this first. It is deliberately conservative about false
 * confidence: any network step (git fetch, or a tier read) that cannot
 * complete within its budget degrades to "not checked" and is EXCLUDED from
 * the verdict — it never counts as "no drift found". A box that cannot reach
 * the network at all still gets an honest report about its code position
 * from local refs, with the fetch step itself named as skipped.
 *
 * Usage:
 *   node scripts/start-check.mjs [--strict] [--space <id>] [--json] [--code-only] [--spaces-detail]
 *
 * Exit code: 0 always, unless --strict AND the verdict is NOT LATEST (exit 1).
 * `--json` prints the full result object instead of the formatted report —
 * for another script or CI step to consume without re-parsing text.
 * `--code-only` skips the space check entirely (pre-push-gate.sh uses this).
 * `--spaces-detail` removes the cap on how many drifted projects get their
 * own line — the default keeps the space section to one summary line plus a
 * handful of details, however many spaces this box holds.
 *
 * The space check is CHEAP by design: two requests per held space (a
 * project list from each tier — id + documentVersion + updatedAt, not the
 * document itself), so a box with ~30 spaces / ~100 projects finishes in a
 * couple of seconds. It compares each side's documentVersion against what
 * this box last cached for that project (serverXR/data/start-check-cache.json)
 * rather than fetching and hashing full documents — a version bumps on
 * every write, so "unchanged since I last looked" is exactly as reliable as
 * a content hash for detecting MOTION, without the cost of reading content.
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getState } from './repo-state.mjs'
import { TIERS, localBase, listSpaces, listProjectMetas } from './tier-sync.mjs'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Every individual network step gets this long before start-check gives up
// on it and reports "not checked" instead of guessing. Chosen to match the
// plan's "~10s timeout on network" — long enough for a slow but working
// connection, short enough that a session start is never left waiting on a
// dead tier.
export const NETWORK_TIMEOUT_MS = 10_000

// The space-check section fans out to 2 requests per held space (a cheap
// project list from each tier — see checkSpaces) — this is the OVERALL
// budget for that whole section, not per-request, so a box holding a lot of
// spaces degrades to "not fully checked" rather than turning start-check
// into a multi-minute hang.
export const SPACE_CHECK_BUDGET_MS = 10_000

// How many spaces are checked at once. The owner's box holds ~30 spaces;
// 6-at-a-time keeps the whole pass well under the budget above without
// opening so many sockets at once that a slow tier looks like a dead one.
export const SPACE_CONCURRENCY = 6

// LOCAL_API_URL is sometimes a domain that is not always up (a `di` install
// that isn't running right now) — when the CONFIGURED local tier can't be
// reached at all, try the plain dev-stack address before giving up, and name
// both attempts. Only for network-level failures — a reachable server that
// answers 401 is not "try somewhere else", it is "the token is wrong".
const LOCALHOST_FALLBACK = 'http://localhost:4000/serverXR'

// Run `items` through `fn`, at most `limit` in flight at once. No dependency
// needed for this — the space check is the only thing here fanning out
// enough to matter.
const mapWithConcurrency = async (items, limit, fn) => {
  const results = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i], i)
    }
  })
  await Promise.all(workers)
  return results
}

const git = (args, options = {}) => {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      cwd: ROOT_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: NETWORK_TIMEOUT_MS,
      ...options
    }).trim()
  } catch {
    return null // null = "could not run/complete", distinct from '' = "ran, empty output"
  }
}

const hasRemote = (name) => {
  const remotes = git(['remote'], { timeout: 2000 })
  return remotes !== null && remotes.split('\n').includes(name)
}

/**
 * `git fetch <remote>` with a hard timeout. Returns { ok, timedOut, error }
 * — never throws. A fetch that times out or fails must read as "could not
 * check" everywhere downstream, never as "fetched, nothing changed".
 */
const fetchRemote = (remote) => {
  try {
    execFileSync('git', ['fetch', remote], {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: ROOT_DIR,
      timeout: NETWORK_TIMEOUT_MS
    })
    return { ok: true }
  } catch (error) {
    const timedOut = error?.signal === 'SIGTERM' || error?.code === 'ETIMEDOUT'
    return { ok: false, timedOut, error: (error?.stderr?.toString() || error?.message || 'unknown error').split('\n')[0] }
  }
}

const countRevs = (range) => {
  const out = git(['rev-list', '--count', range])
  if (out === null) return null
  const n = Number(out)
  return Number.isFinite(n) ? n : null
}

/**
 * The CODE half of the check. Fetches first (this is the whole reason this
 * script exists instead of `npm run state`), then reuses repo-state's own
 * git-fact gathering for branch position / uncommitted work / worktree
 * sprawl so the two tools can never disagree about what "behind" means.
 */
export const checkCode = () => {
  const originFetch = fetchRemote('origin')
  const isFork = hasRemote('upstream')
  const upstreamFetch = isFork ? fetchRemote('upstream') : null

  // repo-state.mjs deliberately never fetches on its own — see its header
  // comment — so calling getState() here, right after the fetches above, is
  // what makes its branch-position numbers fresh instead of stale-by-design.
  const state = getState()

  const currentWorktree = (state.worktrees || []).find((wt) => wt.path === state.currentPath)

  let forkDevBehindUpstream = null
  let forkDevAheadOfUpstream = null
  if (isFork && upstreamFetch?.ok) {
    forkDevBehindUpstream = countRevs('origin/dev..upstream/dev')
    forkDevAheadOfUpstream = countRevs('upstream/dev..origin/dev')
  }

  const behindOriginDev = state.currentBranch === 'dev' || state.currentBranch === '(detached)'
    ? state.headBehindDev
    : state.currentBranchBehindDev

  return {
    fetchedOrigin: originFetch.ok,
    fetchOriginError: originFetch.ok ? null : (originFetch.timedOut ? 'timed out' : originFetch.error),
    isFork,
    fetchedUpstream: isFork ? Boolean(upstreamFetch?.ok) : null,
    fetchUpstreamError: isFork && !upstreamFetch?.ok ? (upstreamFetch?.timedOut ? 'timed out' : upstreamFetch?.error) : null,
    currentBranch: state.currentBranch,
    behindOriginDev: behindOriginDev || null,
    currentUpstreamGone: state.currentUpstreamGone,
    dirty: Boolean(currentWorktree?.dirty),
    forkDevBehindUpstream,
    forkDevAheadOfUpstream,
    // NOT LATEST triggers: actually behind, or parked on a merged/gone branch.
    // Uncommitted work and being AHEAD are reported but never trip the verdict.
    notLatest: Boolean(behindOriginDev) || Boolean(state.currentUpstreamGone) || Boolean(forkDevBehindUpstream)
  }
}

const loadEnvFile = (filePath) => {
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    const env = {}
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const idx = trimmed.indexOf('=')
      if (idx === -1) continue
      const key = trimmed.slice(0, idx).trim()
      const value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '')
      if (key && value) env[key] = value // empty assignment = placeholder, not a value (see space-push.mjs)
    }
    return env
  } catch {
    return {}
  }
}

const readEnv = () => ({
  ...loadEnvFile(path.join(ROOT_DIR, 'serverXR', '.env')),
  ...loadEnvFile(path.join(ROOT_DIR, 'serverXR', '.env.local')),
  ...loadEnvFile(path.join(ROOT_DIR, '.env')),
  ...loadEnvFile(path.join(ROOT_DIR, '.env.local')),
  ...Object.fromEntries(['API_TOKEN', 'LIVE_API_TOKEN', 'LOCAL_API_URL'].filter((k) => process.env[k]).map((k) => [k, process.env[k]]))
})

// dev.diiii.xyz is the settled name for the tier `tier-sync.mjs` still calls
// `staging` (its base URL, staging.di-studio.xyz, is the old name and still
// answers — see CONTRIBUTING.md). Kept as one constant here so a future
// rename only has to change one line.
const DEV_TIER_LABEL = 'dev tier'

// A small cache of the last version this box saw on each side of each
// project — NOT a copy of any tier's data, just "what did documentVersion
// read, last time we looked". Lives next to tier-sync's own baseline file
// (same DATA_ROOT resolution) but is start-check's alone; tier-sync never
// reads or writes it. Read-only for everything except this file.
const cachePath = () => {
  const dataRoot = process.env.DATA_ROOT
  const root = dataRoot ? path.resolve(ROOT_DIR, 'serverXR', dataRoot) : path.join(ROOT_DIR, 'serverXR', 'data')
  return path.join(root, 'start-check-cache.json')
}
const readVersionCache = () => {
  try { return JSON.parse(fs.readFileSync(cachePath(), 'utf8')) } catch { return {} }
}
const writeVersionCache = (cache) => {
  try {
    fs.mkdirSync(path.dirname(cachePath()), { recursive: true })
    fs.writeFileSync(cachePath(), JSON.stringify(cache, null, 1))
  } catch { /* advisory only — a failed write just means next run bootstraps again */ }
}

/**
 * One project's verdict from CHEAP data alone — `documentVersion` off each
 * side's project list (see `listProjectMetas`), never a document fetch.
 * `documentVersion` bumps on every write to that tier's own copy
 * (serverXR/src/routes/projectRoutes.js), so "the version I last cached for
 * this side hasn't moved" is proof nothing changed there — no hash needed.
 *
 * `cached` is what THIS box last observed on both sides together, from a
 * previous run of this same check (see `readVersionCache`). No entry yet
 * (first time this project has been seen) can't be compared at all — 'new'.
 */
export const classifyVersionDrift = ({ local, dev, cached }) => {
  if (!local && !dev) return null
  if (local && !dev) return { kind: 'local-only' }
  if (!local && dev) return { kind: 'dev-only' }
  if (!cached) return { kind: 'new' }
  const localMoved = local.documentVersion !== cached.localVersion
  const devMoved = dev.documentVersion !== cached.devVersion
  if (!localMoved && !devMoved) return { kind: 'same' }
  if (localMoved && devMoved) return { kind: 'both-moved' }
  if (devMoved) return { kind: 'dev-ahead' }
  return { kind: 'local-ahead' }
}

// Network-level failure only (host down, DNS, timeout) — an auth error means
// the server IS there and answering, so trying somewhere else would not help.
const isNetworkFailure = (error) => {
  const code = error?.cause?.code || error?.code
  return error?.name === 'AbortError' || error?.name === 'TimeoutError' ||
    ['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN'].includes(code) ||
    /fetch failed/i.test(error?.message || '')
}

/**
 * The SPACES half of the check. Two requests per held space — a project
 * list from each tier, run SPACE_CONCURRENCY at a time — never a document
 * fetch. Verified against a real box (~30 spaces, ~100 projects): the old
 * per-project document-hash approach either 404'd on a misconfigured local
 * base or blew its own time budget and printed ~60 "not checked" lines; this
 * one finishes in a couple of seconds either way (see session notes).
 */
export const checkSpaces = async ({ spaceFilter }) => {
  const env = readEnv()
  const configuredLocalBase = localBase(env)
  let local = { ...TIERS.local, base: configuredLocalBase, token: env.API_TOKEN }
  const dev = { ...TIERS.staging, token: env.LIVE_API_TOKEN }
  const triedBases = [configuredLocalBase]

  if (!local.token && !dev.token) {
    return { status: 'not-checked', reason: 'no API_TOKEN or LIVE_API_TOKEN configured', projects: [] }
  }

  const deadline = Date.now() + SPACE_CHECK_BUDGET_MS

  let heldSpaceIds
  try {
    heldSpaceIds = spaceFilter ? [spaceFilter] : await listSpaces(local)
  } catch (error) {
    // The configured local tier didn't answer at all — try the plain
    // dev-stack address before giving up, and say both things that were tried.
    if (isNetworkFailure(error) && configuredLocalBase !== LOCALHOST_FALLBACK) {
      local = { ...local, base: LOCALHOST_FALLBACK }
      triedBases.push(LOCALHOST_FALLBACK)
      try {
        heldSpaceIds = spaceFilter ? [spaceFilter] : await listSpaces(local)
      } catch (fallbackError) {
        return { status: 'not-checked', reason: `local tier unreachable — tried ${triedBases.join(' and ')}: ${fallbackError.message}`, projects: [] }
      }
    } else {
      return { status: 'not-checked', reason: `local tier unreachable (${configuredLocalBase}): ${error.message}`, projects: [] }
    }
  }

  if (!heldSpaceIds.length) {
    return { status: 'ok', reason: 'this box holds no spaces yet', projects: [] }
  }
  if (!dev.token) {
    return { status: 'not-checked', reason: `no LIVE_API_TOKEN for the ${DEV_TIER_LABEL}`, projects: [] }
  }

  const cache = readVersionCache()
  const results = []
  let devUnreachable = null

  await mapWithConcurrency(heldSpaceIds, SPACE_CONCURRENCY, async (spaceId) => {
    if (Date.now() > deadline || devUnreachable) {
      results.push({ spaceId, kind: 'not-checked', reason: devUnreachable || 'time budget exceeded' })
      return
    }
    let localMetas
    let devMetas
    try {
      [localMetas, devMetas] = await Promise.all([
        listProjectMetas(local, spaceId),
        listProjectMetas(dev, spaceId)
      ])
    } catch (error) {
      if (!devUnreachable) devUnreachable = `${DEV_TIER_LABEL} or local unreachable: ${error.message}`
      results.push({ spaceId, kind: 'not-checked', reason: devUnreachable })
      return
    }

    const localById = Object.fromEntries(localMetas.map((p) => [p.id, p]))
    const devById = Object.fromEntries(devMetas.map((p) => [p.id, p]))
    const spaceCache = (cache[spaceId] ||= {})
    for (const projectId of new Set([...Object.keys(localById), ...Object.keys(devById)])) {
      const local_ = localById[projectId]
      const dev_ = devById[projectId]
      const drift = classifyVersionDrift({ local: local_, dev: dev_, cached: spaceCache[projectId] })
      if (local_ && dev_) {
        spaceCache[projectId] = { localVersion: local_.documentVersion, devVersion: dev_.documentVersion }
      }
      if (drift && drift.kind !== 'same') results.push({ spaceId, projectId, ...drift })
    }
  })

  writeVersionCache(cache)

  const notLatest = results.some((r) => r.kind === 'dev-ahead' || r.kind === 'both-moved')
  return { status: 'checked', notLatest, totalSpaces: heldSpaceIds.length, projects: results, triedBases }
}

const projectDriftLine = ({ spaceId, projectId, kind }) => {
  switch (kind) {
    case 'dev-ahead':
      return `  NOT LATEST  ${DEV_TIER_LABEL} has newer work in \`${spaceId}/${projectId}\` — pull first: ` +
        `node scripts/project-pull.mjs ${projectId} --space ${spaceId} --from ${TIERS.staging.base} --force`
    case 'both-moved':
      return `  NOT LATEST  \`${spaceId}/${projectId}\` changed on this box AND on the ${DEV_TIER_LABEL} since the last check — ` +
        `compare by hand: node scripts/tier-sync.mjs --from local --to staging --space ${spaceId} --audit`
    case 'local-ahead':
      return `  ·  \`${spaceId}/${projectId}\` has local changes not yet on the ${DEV_TIER_LABEL} — ` +
        `push when ready: node scripts/tier-sync.mjs --from local --to staging --space ${spaceId} --changed`
    case 'local-only':
      return `  ·  \`${spaceId}/${projectId}\` exists only on this box`
    case 'dev-only':
      return `  ·  \`${spaceId}/${projectId}\` exists on the ${DEV_TIER_LABEL}, not yet pulled here`
    default:
      return `  ?  ${spaceId}/${projectId}: ${kind}`
  }
}

// Space-level grouping for the summary line: "31 same · 2 newer on dev: wcc,
// br-id-ge · 1 changed on both: main". Counts and names SPACES, not
// projects — a space with three drifted projects is still one name in this
// line; the detail lines below say which projects.
const SUMMARY_KINDS = [
  ['dev-ahead', 'newer on dev'],
  ['both-moved', 'changed on both'],
  ['local-ahead', 'local ahead'],
  ['new', 'new (uncompared)'],
  ['local-only', 'local-only'],
  ['dev-only', 'dev-only']
]

// checkSpaces only ever pushes a row for a space that is NOT fully "same" —
// a clean space never appears in `spaces.projects` at all. So "same" has to
// be derived as totalSpaces minus the spaces that DO appear (each space
// contributes either exactly one 'not-checked' row, or one-or-more drift
// rows — never both; a space's whole fetch fails together, see checkSpaces).
const summarizeSpaces = (spaces) => {
  const bySpace = new Map()
  const notCheckedSpaceIds = new Set()
  for (const row of spaces.projects) {
    if (row.kind === 'not-checked') { notCheckedSpaceIds.add(row.spaceId); continue }
    if (!bySpace.has(row.spaceId)) bySpace.set(row.spaceId, new Set())
    bySpace.get(row.spaceId).add(row.kind)
  }
  const parts = []
  for (const [kind, label] of SUMMARY_KINDS) {
    const ids = [...bySpace.entries()].filter(([, kinds]) => kinds.has(kind)).map(([id]) => id)
    if (ids.length) parts.push(`${ids.length} ${label}: ${ids.join(', ')}`)
  }
  const sameCount = (spaces.totalSpaces ?? 0) - bySpace.size - notCheckedSpaceIds.size

  const notChecked = spaces.projects.filter((r) => r.kind === 'not-checked')
  const notCheckedByReason = new Map()
  for (const row of notChecked) notCheckedByReason.set(row.reason, (notCheckedByReason.get(row.reason) || 0) + 1)
  const notCheckedPart = notChecked.length
    ? `${notChecked.length} not checked (${[...notCheckedByReason.entries()].map(([reason, n]) => `${n}× ${reason}`).join('; ')})`
    : null

  return { line: [`${sameCount} same`, ...parts, notCheckedPart].filter(Boolean).join(' · ') }
}

// Detail lines are capped so a fully-populated box (~30 spaces) can never
// turn the headline into a scroll of "not checked" — the failure mode a real
// run against ~30 spaces hit before this cap existed (see session notes).
const DETAIL_LINE_CAP = 5

export const formatReport = ({ code, spaces, strict, spacesDetail }) => {
  const lines = []
  const notLatest = code.notLatest || spaces.notLatest

  lines.push(notLatest ? '  NOT LATEST — do this first:' : '  LATEST')
  lines.push('')
  lines.push('  code:')
  if (!code.fetchedOrigin) {
    lines.push(`    ? origin — could not fetch (${code.fetchOriginError}); position below is against the last-known ref`)
  }
  if (code.isFork && !code.fetchedUpstream) {
    lines.push(`    ? upstream — could not fetch (${code.fetchUpstreamError})`)
  }
  if (code.behindOriginDev) {
    lines.push(`    NOT LATEST  ${code.currentBranch} is ${code.behindOriginDev} commits behind origin/dev — git pull` +
      (code.currentBranch === 'dev' || code.currentBranch === '(detached)' ? '' : ' origin/dev (or rebase your branch onto it)'))
  } else if (code.currentUpstreamGone) {
    lines.push(`    NOT LATEST  "${code.currentBranch}" tracks an upstream that is gone — git fetch && git checkout --detach origin/dev`)
  } else {
    lines.push(`    ok — ${code.currentBranch} matches origin/dev`)
  }
  if (code.isFork && code.fetchedUpstream) {
    if (code.forkDevBehindUpstream) {
      lines.push(`    NOT LATEST  this fork's dev is ${code.forkDevBehindUpstream} commits behind upstream/dev — ` +
        'git fetch upstream && git merge --ff-only upstream/dev')
    } else {
      lines.push(`    ok — this fork's dev matches upstream/dev${code.forkDevAheadOfUpstream ? ` (${code.forkDevAheadOfUpstream} ahead, unpushed to upstream — normal)` : ''}`)
    }
  }
  if (code.dirty) lines.push('    note: uncommitted changes in this checkout (not itself "behind")')

  lines.push('')
  if (spaces.status === 'skipped') {
    lines.push(`  spaces: (${spaces.reason} — not checked)`)
  } else if (spaces.status === 'not-checked') {
    lines.push(`  spaces: not checked (${spaces.reason})`)
  } else if (spaces.status === 'ok') {
    lines.push(`  spaces: ${spaces.reason}`)
  } else if (!spaces.projects.length) {
    lines.push(`  spaces: ${spaces.totalSpaces ?? 0} same — this box's spaces match the ${DEV_TIER_LABEL}`)
  } else {
    lines.push(`  spaces: ${summarizeSpaces(spaces).line}`)
    // Only the kinds with an actual command to run — the summary line above
    // already names which spaces are local-only/dev-only/new, and repeating
    // every one of those per-project here is exactly the noise this cap
    // exists to cut.
    const ACTIONABLE = new Set(['dev-ahead', 'both-moved', 'local-ahead'])
    const detailRows = spaces.projects.filter((r) => ACTIONABLE.has(r.kind))
    const shown = spacesDetail ? detailRows : detailRows.slice(0, DETAIL_LINE_CAP)
    for (const row of shown) lines.push(projectDriftLine(row))
    const remaining = detailRows.length - shown.length
    if (remaining > 0) lines.push(`  +${remaining} more — npm run start-check -- --spaces-detail`)
  }

  if (notLatest && strict) lines.push('\n  (--strict: exiting 1)')
  return lines.join('\n')
}

const parseArgs = (argv) => {
  const args = { strict: false, space: null, json: false, codeOnly: false, spacesDetail: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--strict') args.strict = true
    else if (argv[i] === '--space') args.space = argv[++i]
    else if (argv[i] === '--json') args.json = true
    // For callers that only care about the code line and want to skip the
    // (slower, network-fanout) space check entirely — pre-push-gate.sh uses
    // this so a push isn't held up waiting on tier reads it doesn't need.
    else if (argv[i] === '--code-only') args.codeOnly = true
    // Removes the ~5-line cap on space drift detail lines.
    else if (argv[i] === '--spaces-detail') args.spacesDetail = true
  }
  return args
}

const SKIPPED_SPACES = { status: 'skipped', reason: '--code-only', projects: [], notLatest: false }

export const main = async () => {
  const args = parseArgs(process.argv.slice(2))
  const code = checkCode()
  const spaces = args.codeOnly ? SKIPPED_SPACES : await checkSpaces({ spaceFilter: args.space })
  const notLatest = Boolean(code.notLatest || spaces.notLatest)

  if (args.json) {
    console.log(JSON.stringify({ notLatest, code, spaces }, null, 2))
  } else {
    console.log(formatReport({ code, spaces, strict: args.strict, spacesDetail: args.spacesDetail }))
  }

  if (notLatest && args.strict) process.exitCode = 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
