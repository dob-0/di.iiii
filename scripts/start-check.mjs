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
 * The space check compares the two tiers DIRECTLY, every run, by CONTENT.
 * (An earlier version cached "the version I last saw" and used THAT as the
 * reference point — a real false LATEST, see docs/ai/sessions/feat-start-check.md.
 * The one after it compared timestamps, and printed ~94 NOT LATEST lines on the
 * owner's box for projects whose content was identical: every tier bumps
 * `documentVersion`/`updatedAt` on its own and re-addresses assets on arrival.
 * See docs/ai/sessions/fix-start-check-content.md.)
 *
 * For each project present on both tiers:
 *   1. cheap `documentVersion`+`updatedAt` (one list request per tier per
 *      space) settle it when they match exactly, or when both still equal the
 *      versions `tier-sync-baseline.json` recorded when it CONFIRMED the two
 *      contents identical (`tier-sync --rebuild-baseline`);
 *   2. otherwise both documents are fetched (concurrency-limited, one overall
 *      budget) and compared by tier-sync's own normalized `shape` — volatile
 *      fields stripped, assets addressed by name. Identical → same.
 *   3. content that truly differs gets a direction: from the baseline when it
 *      has one, else from `updatedAt` (said so in the line). Only "dev is
 *      ahead" or "both moved" makes the headline NOT LATEST.
 * A pair the budget did not reach is counted as "not confirmed: N" — never
 * NOT LATEST, never "same". A project only on the dev tier that sits in THIS
 * box's trash (`GET /api/trash`) was deleted here on purpose and is never
 * offered as a pull.
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getState } from './repo-state.mjs'
import { TIERS, localBase, listSpaces, listProjectMetas, readBaseline, baselineShape, documentSignature, call } from './tier-sync.mjs'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Every individual network step gets this long before start-check gives up
// on it and reports "not checked" instead of guessing. Chosen to match the
// plan's "~10s timeout on network" — long enough for a slow but working
// connection, short enough that a session start is never left waiting on a
// dead tier.
export const NETWORK_TIMEOUT_MS = 10_000

// The space-check section's OVERALL budget — not per-request. A box holding
// a lot of spaces degrades to "not fully checked" for whatever's left rather
// than turning start-check into a multi-minute hang.
export const SPACE_CHECK_BUDGET_MS = 15_000

// How many spaces are checked at once. The owner's box holds ~30 spaces;
// 6-at-a-time keeps the whole pass well under the budget above without
// opening so many sockets at once that a slow tier looks like a dead one.
export const SPACE_CONCURRENCY = 6

// How many document-fetch PAIRS run at once while confirming content. Each
// pair is one request per tier; documents can be a megabyte or more.
export const CONTENT_CONCURRENCY = 8

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

// dev.diiii.xyz is the tier `tier-sync.mjs` still keys as `staging` (its base
// URL is dev.diiii.xyz; the old staging.di-studio.xyz name is gone). Kept as
// one constant here so a future rename only has to change one line.
const DEV_TIER_LABEL = 'dev tier'

const sameVersion = (a, b) => Boolean(a && b) && a.documentVersion === b.documentVersion && a.updatedAt === b.updatedAt

/**
 * One project's verdict. `local`/`dev` are `{documentVersion, updatedAt}` or
 * undefined (missing on that side). `baseline` is the tier-sync-baseline.json
 * entry — a bare shape string (older runs) or `{ shape, versions: { local,
 * staging } }` recorded when both contents were confirmed identical.
 * `localShape`/`devShape` are THIS run's normalized document shapes, present
 * only when the documents were fetched. `trashedHere` = the project sits in
 * this box's trash.
 *
 * A difference in versions alone is never drift: without shapes the pair is
 * `not-confirmed`. Only content that differs can be ahead on either side.
 */
export const classifyProjectDrift = ({ local, dev, baseline, baselineShape: legacyShape, localShape, devShape, trashedHere = false }) => {
  if (!local && !dev) return null
  if (local && !dev) return { kind: 'local-ahead', confirmed: true }
  if (!local && dev) return trashedHere ? { kind: 'trashed-here' } : { kind: 'dev-ahead', confirmed: true }

  if (sameVersion(local, dev)) return { kind: 'same' }
  const versions = typeof baseline === 'object' ? baseline?.versions : undefined
  if (sameVersion(local, versions?.local) && sameVersion(dev, versions?.staging)) return { kind: 'same' }

  if (localShape === undefined || devShape === undefined) return { kind: 'not-confirmed' }
  if (localShape === devShape) return { kind: 'same' }

  const known = baselineShape(baseline) ?? legacyShape
  if (known) {
    const localMoved = localShape !== known
    const devMoved = devShape !== known
    if (localMoved && devMoved) return { kind: 'both-moved', confirmed: true }
    if (devMoved) return { kind: 'dev-ahead', confirmed: true }
    if (localMoved) return { kind: 'local-ahead', confirmed: true }
  }
  // Content differs; nothing recorded says who moved, so the clock does.
  if (dev.updatedAt > local.updatedAt) return { kind: 'dev-ahead', confirmed: false }
  if (local.updatedAt > dev.updatedAt) return { kind: 'local-ahead', confirmed: false }
  return { kind: 'differs-undetermined' }
}

// Network-level failure only (host down, DNS, timeout) — an auth error means
// the server IS there and answering, so trying somewhere else would not help.
const isNetworkFailure = (error) => {
  const code = error?.cause?.code || error?.code
  return error?.name === 'AbortError' || error?.name === 'TimeoutError' ||
    ['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN'].includes(code) ||
    /fetch failed/i.test(error?.message || '')
}

// Every project this box has put in its trash, as `space/project` keys. A
// server without the route (or a read that fails) yields an empty set: the
// worst case is the old behavior, a pull suggestion, never a hidden drift.
const readLocalTrash = async (tier) => {
  try {
    const res = await call(tier, '/api/trash', {}, NETWORK_TIMEOUT_MS)
    if (!res.ok) return new Set()
    const body = await res.json()
    return new Set((body.projects || []).map((p) => `${p.spaceId}/${p.id}`))
  } catch {
    return new Set()
  }
}

const fetchShape = async (tier, projectId, timeout) => {
  const res = await call(tier, `/api/projects/${projectId}/document`, {}, timeout)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const body = await res.json()
  return documentSignature(body.document || body).shape
}

/**
 * The SPACES half of the check. Lists both tiers' spaces, then every held
 * space's project metas (cheap), then fetches documents only for the pairs
 * whose versions differ and no confirmed baseline vouches for — see the
 * header. Everything shares one budget (`budgetMs`).
 */
export const checkSpaces = async ({ spaceFilter, budgetMs = SPACE_CHECK_BUDGET_MS }) => {
  const env = readEnv()
  const configuredLocalBase = localBase(env)
  let local = { ...TIERS.local, base: configuredLocalBase, token: env.API_TOKEN }
  const dev = { ...TIERS.staging, token: env.LIVE_API_TOKEN }
  const triedBases = [configuredLocalBase]

  if (!local.token && !dev.token) {
    return { status: 'not-checked', reason: 'no API_TOKEN or LIVE_API_TOKEN configured', projects: [] }
  }
  if (!dev.token) {
    return { status: 'not-checked', reason: `no LIVE_API_TOKEN for the ${DEV_TIER_LABEL}`, projects: [] }
  }

  const deadline = Date.now() + budgetMs

  let localSpaceIds
  try {
    localSpaceIds = await listSpaces(local)
  } catch (error) {
    // The configured local tier didn't answer at all — try the plain
    // dev-stack address before giving up, and say both things that were tried.
    if (isNetworkFailure(error) && configuredLocalBase !== LOCALHOST_FALLBACK) {
      local = { ...local, base: LOCALHOST_FALLBACK }
      triedBases.push(LOCALHOST_FALLBACK)
      try {
        localSpaceIds = await listSpaces(local)
      } catch (fallbackError) {
        return { status: 'not-checked', reason: `local tier unreachable — tried ${triedBases.join(' and ')}: ${fallbackError.message}`, projects: [] }
      }
    } else {
      return { status: 'not-checked', reason: `local tier unreachable (${configuredLocalBase}): ${error.message}`, projects: [] }
    }
  }

  let devSpaceIds
  try {
    devSpaceIds = await listSpaces(dev)
  } catch (error) {
    return { status: 'not-checked', reason: `${DEV_TIER_LABEL} unreachable: ${error.message}`, projects: [] }
  }

  const localSet = new Set(localSpaceIds)
  const devSet = new Set(devSpaceIds)
  const spaceIds = spaceFilter ? [spaceFilter] : [...new Set([...localSpaceIds, ...devSpaceIds])]

  if (!spaceIds.length) {
    return { status: 'ok', reason: 'this box holds no spaces yet', projects: [] }
  }

  const baseline = readBaseline().staging || {}
  const trash = await readLocalTrash(local)
  const results = []
  const toConfirm = [] // pairs whose content has to be read to know
  let tierUnreachableMidRun = null

  await mapWithConcurrency(spaceIds, SPACE_CONCURRENCY, async (spaceId) => {
    if (Date.now() > deadline) {
      results.push({ spaceId, kind: 'not-checked', reason: 'time budget exceeded' })
      return
    }

    const onLocal = spaceFilter ? true : localSet.has(spaceId)
    const onDev = spaceFilter ? true : devSet.has(spaceId)
    if (onLocal && !onDev) { results.push({ spaceId, kind: 'space-local-only' }); return }
    if (!onLocal && onDev) { results.push({ spaceId, kind: 'space-dev-only' }); return }

    if (tierUnreachableMidRun) {
      results.push({ spaceId, kind: 'not-checked', reason: tierUnreachableMidRun })
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
      if (!tierUnreachableMidRun) tierUnreachableMidRun = `a tier stopped answering mid-run: ${error.message}`
      results.push({ spaceId, kind: 'not-checked', reason: tierUnreachableMidRun })
      return
    }

    const localById = Object.fromEntries(localMetas.map((p) => [p.id, p]))
    const devById = Object.fromEntries(devMetas.map((p) => [p.id, p]))

    for (const projectId of new Set([...Object.keys(localById), ...Object.keys(devById)])) {
      const input = {
        local: localById[projectId],
        dev: devById[projectId],
        baseline: baseline[`${spaceId}/${projectId}`],
        trashedHere: trash.has(`${spaceId}/${projectId}`)
      }
      const drift = classifyProjectDrift(input)
      if (drift?.kind === 'not-confirmed') toConfirm.push({ spaceId, projectId, input })
      else if (drift && drift.kind !== 'same') results.push({ spaceId, projectId, ...drift })
    }
  })

  // Pairs that could move the headline (dev later) are read first, so a short
  // budget spends itself on the answers that matter most.
  toConfirm.sort((a, b) => (b.input.dev.updatedAt - b.input.local.updatedAt) - (a.input.dev.updatedAt - a.input.local.updatedAt))
  await mapWithConcurrency(toConfirm, CONTENT_CONCURRENCY, async ({ spaceId, projectId, input }) => {
    const remaining = deadline - Date.now()
    let drift = { kind: 'not-confirmed' }
    if (remaining > 250) {
      try {
        const [localShape, devShape] = await Promise.all([
          fetchShape(local, projectId, remaining),
          fetchShape(dev, projectId, remaining)
        ])
        drift = classifyProjectDrift({ ...input, localShape, devShape })
      } catch { /* timed out or failed — stays not-confirmed */ }
    }
    if (drift.kind !== 'same') results.push({ spaceId, projectId, ...drift })
  })

  const notLatest = results.some((r) => r.kind === 'dev-ahead' || r.kind === 'both-moved')
  return { status: 'checked', notLatest, totalSpaces: spaceIds.length, projects: results, triedBases }
}

const projectDriftLine = ({ spaceId, projectId, kind, confirmed }) => {
  const basis = confirmed === false ? ' (content differs; direction by timestamp)' : ''
  switch (kind) {
    case 'dev-ahead':
      return `  NOT LATEST  ${DEV_TIER_LABEL} has newer work in \`${spaceId}/${projectId}\`${basis} — pull first: ` +
        `node scripts/project-pull.mjs ${projectId} --space ${spaceId} --from ${TIERS.staging.base} --force`
    case 'both-moved':
      return `  NOT LATEST  \`${spaceId}/${projectId}\` changed on this box AND on the ${DEV_TIER_LABEL} since the last sync — ` +
        `ask before pushing; compare by hand: node scripts/tier-sync.mjs --from local --to staging --space ${spaceId} --audit`
    case 'local-ahead':
      return `  ·  \`${spaceId}/${projectId}\` has local changes not yet on the ${DEV_TIER_LABEL}${basis} — ` +
        `push when ready: node scripts/tier-sync.mjs --from local --to staging --space ${spaceId} --changed`
    case 'differs-undetermined':
      return `  ?  \`${spaceId}/${projectId}\` differs and there is no signal for who moved — ` +
        `node scripts/tier-sync.mjs --from local --to staging --space ${spaceId} --audit`
    default:
      return `  ?  ${spaceId}/${projectId}: ${kind}`
  }
}

// One line per space that exists on only one tier — an availability fact,
// never drift (there is nothing on the other side to compare against).
const spaceOnlyLine = (row) => row.kind === 'space-local-only'
  ? `  ·  \`${row.spaceId}\` — only on this box`
  : `  ·  \`${row.spaceId}\` — only on the ${DEV_TIER_LABEL}`

// Space-level grouping for the summary line: "19 same · 2 newer on dev: wcc,
// br-id-ge · 1 changed on both: main". Each space lands in EXACTLY ONE
// bucket — priority order below — so a space can never appear in two lists
// at once (main/what-we-have doing exactly that, from separate local-only
// and dev-only PROJECT rows inside the same space, was the reported bug).
const SUMMARY_PRIORITY = [
  ['dev-ahead', 'newer on dev'],
  ['both-moved', 'changed on both'],
  ['differs-undetermined', 'differs (undetermined)'],
  ['local-ahead', 'local ahead'],
  ['space-dev-only', 'only on dev'],
  ['space-local-only', 'local-only']
]

// checkSpaces only ever pushes a row for a space that is NOT fully "same" —
// a clean space never appears in `spaces.projects` at all. So "same" has to
// be derived as totalSpaces minus the spaces that DO appear.
const summarizeSpaces = (spaces) => {
  const kindsBySpace = new Map()
  const notCheckedSpaceIds = new Set()
  const notConfirmedSpaceIds = new Set()
  for (const row of spaces.projects) {
    if (row.kind === 'not-checked') { notCheckedSpaceIds.add(row.spaceId); continue }
    if (row.kind === 'not-confirmed') { notConfirmedSpaceIds.add(row.spaceId); continue }
    // Deleted on this box on purpose: not drift, counted per project below.
    if (row.kind === 'trashed-here') continue
    if (!kindsBySpace.has(row.spaceId)) kindsBySpace.set(row.spaceId, new Set())
    kindsBySpace.get(row.spaceId).add(row.kind)
  }

  const bucketOf = new Map() // spaceId -> the ONE summary kind it lands in
  for (const [spaceId, kinds] of kindsBySpace) {
    const winner = SUMMARY_PRIORITY.find(([kind]) => kinds.has(kind))
    if (winner) bucketOf.set(spaceId, winner[0])
  }

  const parts = []
  for (const [kind, label] of SUMMARY_PRIORITY) {
    const ids = [...bucketOf.entries()].filter(([, k]) => k === kind).map(([id]) => id)
    if (ids.length) parts.push(`${ids.length} ${label}: ${ids.join(', ')}`)
  }
  const unsettled = new Set([...notCheckedSpaceIds, ...notConfirmedSpaceIds].filter((id) => !bucketOf.has(id)))
  const sameCount = (spaces.totalSpaces ?? 0) - bucketOf.size - unsettled.size

  const notChecked = spaces.projects.filter((r) => r.kind === 'not-checked')
  const notCheckedByReason = new Map()
  for (const row of notChecked) notCheckedByReason.set(row.reason, (notCheckedByReason.get(row.reason) || 0) + 1)
  const notCheckedPart = notChecked.length
    ? `${notChecked.length} not checked (${[...notCheckedByReason.entries()].map(([reason, n]) => `${n}× ${reason}`).join('; ')})`
    : null

  const trashed = spaces.projects.filter((r) => r.kind === 'trashed-here').length
  const trashedPart = trashed ? `${trashed} project(s) deleted here on purpose (in this box's trash, not pulled)` : null

  return { line: [`${sameCount} same`, ...parts, trashedPart, notCheckedPart].filter(Boolean).join(' · ') }
}

// Detail lines are capped so a fully-populated box (~30 spaces) can never
// turn the headline into a scroll of lines — the failure mode a real run
// against ~30 spaces hit before this cap existed (see session notes).
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
    const notConfirmed = spaces.projects.filter((r) => r.kind === 'not-confirmed').length
    if (notConfirmed) {
      lines.push(`  not confirmed: ${notConfirmed} — versions differ, content not read within the time budget (never counted as behind)`)
    }
    // One capped list, most urgent first: the rows with an action, then the
    // spaces that exist on one tier only. Trashed-here and not-confirmed rows
    // live in the summary lines above and never get a detail line.
    const ORDER = ['dev-ahead', 'both-moved', 'differs-undetermined', 'local-ahead', 'space-dev-only', 'space-local-only']
    const detailRows = spaces.projects
      .filter((r) => ORDER.includes(r.kind))
      .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))
    const shown = spacesDetail ? detailRows : detailRows.slice(0, DETAIL_LINE_CAP)
    for (const row of shown) lines.push(row.kind.startsWith('space-') ? spaceOnlyLine(row) : projectDriftLine(row))
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
