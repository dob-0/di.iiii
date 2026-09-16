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
 *   node scripts/start-check.mjs [--strict] [--space <id>] [--json]
 *
 * Exit code: 0 always, unless --strict AND the verdict is NOT LATEST (exit 1).
 * `--json` prints the full result object instead of the formatted report —
 * for another script or CI step to consume without re-parsing text.
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getState } from './repo-state.mjs'
import { TIERS, localBase, listSpaces, readSignatures, readBaseline } from './tier-sync.mjs'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Every individual network step gets this long before start-check gives up
// on it and reports "not checked" instead of guessing. Chosen to match the
// plan's "~10s timeout on network" — long enough for a slow but working
// connection, short enough that a session start is never left waiting on a
// dead tier.
export const NETWORK_TIMEOUT_MS = 10_000

// The space-check section can fan out into many HTTP round trips (one GET
// per project per tier) — this is the OVERALL budget for that whole section,
// not per-request, so a box holding a lot of spaces degrades to "not fully
// checked" rather than turning start-check into a multi-minute hang.
export const SPACE_CHECK_BUDGET_MS = 10_000

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

/**
 * One project's verdict, using the SAME baseline file tier-sync.mjs writes
 * (`serverXR/data/tier-sync-baseline.json`, keyed by destination tier). The
 * baseline is "what did local and dev last agree this project looked like" —
 * so a shape that still matches it means THIS side hasn't moved since, and a
 * shape that no longer matches means THIS side is the one that changed.
 * Comparing both sides against the same baseline is what turns "these
 * differ" into a direction ("dev has newer work", not just "they disagree").
 */
export const classifyProjectDrift = ({ localSig, devSig, baselineShape }) => {
  if (!localSig && !devSig) return null
  if (localSig && !devSig) return { kind: 'local-only' }
  if (!localSig && devSig) return { kind: 'dev-only' }
  if (localSig.hash === devSig.hash) return { kind: 'same' }
  if (!baselineShape) return { kind: 'differs-no-baseline' }
  const localMoved = localSig.shape !== baselineShape
  const devMoved = devSig.shape !== baselineShape
  if (localMoved && devMoved) return { kind: 'both-moved' }
  if (devMoved) return { kind: 'dev-ahead' } // local matches the baseline — only dev moved
  if (localMoved) return { kind: 'local-ahead' } // dev matches the baseline — only local moved
  return { kind: 'differs-no-baseline' } // neither moved from baseline yet they differ — shouldn't happen, treat cautiously
}

/**
 * The SPACES half of the check. Reuses tier-sync.mjs's own document
 * comparison (`readSignatures`, built on `documentSignature`) rather than
 * re-implementing it — see that file's header for why a byte/id comparison
 * alone is not enough (asset re-addressing, volatile timestamp fields).
 */
export const checkSpaces = async ({ spaceFilter }) => {
  const env = readEnv()
  const local = { ...TIERS.local, base: localBase(env), token: env.API_TOKEN }
  const dev = { ...TIERS.staging, token: env.LIVE_API_TOKEN }

  if (!local.token && !dev.token) {
    return { status: 'not-checked', reason: 'no API_TOKEN or LIVE_API_TOKEN configured', projects: [] }
  }

  const deadline = Date.now() + SPACE_CHECK_BUDGET_MS

  let heldSpaceIds
  try {
    heldSpaceIds = spaceFilter ? [spaceFilter] : await listSpaces(local)
  } catch (error) {
    return { status: 'not-checked', reason: `local tier unreachable: ${error.message}`, projects: [] }
  }

  if (!heldSpaceIds.length) {
    return { status: 'ok', reason: 'this box holds no spaces yet', projects: [] }
  }

  const baseline = readBaseline()
  const devBaseline = baseline.staging || {}

  const results = []
  let devUnreachable = null
  for (const spaceId of heldSpaceIds) {
    if (Date.now() > deadline) {
      results.push({ spaceId, kind: 'not-checked', reason: 'time budget exceeded' })
      continue
    }
    if (devUnreachable) {
      results.push({ spaceId, kind: 'not-checked', reason: devUnreachable })
      continue
    }
    let localSigs
    let devSigs
    try {
      localSigs = await readSignatures(local, spaceId)
    } catch (error) {
      results.push({ spaceId, kind: 'not-checked', reason: `local: ${error.message}` })
      continue
    }
    if (!dev.token) {
      results.push({ spaceId, kind: 'not-checked', reason: `no LIVE_API_TOKEN for the ${DEV_TIER_LABEL}` })
      continue
    }
    try {
      devSigs = await readSignatures(dev, spaceId)
    } catch (error) {
      devUnreachable = `${DEV_TIER_LABEL} unreachable: ${error.message}`
      results.push({ spaceId, kind: 'not-checked', reason: devUnreachable })
      continue
    }

    const projectIds = new Set([...Object.keys(localSigs[spaceId] || {}), ...Object.keys(devSigs[spaceId] || {})])
    for (const projectId of projectIds) {
      if (Date.now() > deadline) {
        results.push({ spaceId, projectId, kind: 'not-checked', reason: 'time budget exceeded' })
        continue
      }
      const localSig = localSigs[spaceId]?.[projectId]
      const devSig = devSigs[spaceId]?.[projectId]
      const drift = classifyProjectDrift({ localSig, devSig, baselineShape: devBaseline[`${spaceId}/${projectId}`] })
      if (drift && drift.kind !== 'same') results.push({ spaceId, projectId, ...drift })
    }
  }

  const notLatest = results.some((r) => r.kind === 'dev-ahead' || r.kind === 'both-moved')
  return { status: 'checked', notLatest, projects: results }
}

const projectDriftLine = ({ spaceId, projectId, kind, reason }) => {
  switch (kind) {
    case 'dev-ahead':
      return `  NOT LATEST  ${DEV_TIER_LABEL} has newer work in \`${spaceId}/${projectId}\` — pull first: ` +
        `node scripts/project-pull.mjs ${projectId} --space ${spaceId} --from ${TIERS.staging.base} --force`
    case 'both-moved':
      return `  NOT LATEST  \`${spaceId}/${projectId}\` changed on this box AND on the ${DEV_TIER_LABEL} since the last sync — ` +
        `compare by hand: node scripts/tier-sync.mjs --from local --to staging --space ${spaceId} --audit`
    case 'local-ahead':
      return `  ·  \`${spaceId}/${projectId}\` has local changes not yet on the ${DEV_TIER_LABEL} — ` +
        `push when ready: node scripts/tier-sync.mjs --from local --to staging --space ${spaceId} --changed`
    case 'differs-no-baseline':
      return `  ?  \`${spaceId}/${projectId}\` differs from the ${DEV_TIER_LABEL} and there is no baseline to say who moved — ` +
        `node scripts/tier-sync.mjs --from local --to staging --space ${spaceId} --audit`
    case 'local-only':
      return `  ·  \`${spaceId}/${projectId}\` exists only on this box`
    case 'dev-only':
      return `  ·  \`${spaceId}/${projectId}\` exists on the ${DEV_TIER_LABEL}, not yet pulled here`
    case 'not-checked':
      return `  ?  \`${spaceId}${projectId ? `/${projectId}` : ''}\` not checked (${reason})`
    default:
      return `  ?  ${spaceId}${projectId ? `/${projectId}` : ''}: ${kind}`
  }
}

export const formatReport = ({ code, spaces, strict }) => {
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
  lines.push('  spaces:')
  if (spaces.status === 'skipped') {
    lines.push(`    (${spaces.reason} — not checked)`)
  } else if (spaces.status === 'not-checked') {
    lines.push(`    ? not checked (${spaces.reason})`)
  } else if (spaces.status === 'ok') {
    lines.push(`    ok — ${spaces.reason}`)
  } else if (!spaces.projects.length) {
    lines.push(`    ok — this box's spaces match the ${DEV_TIER_LABEL}`)
  } else {
    for (const row of spaces.projects) lines.push(projectDriftLine(row))
  }

  if (notLatest && strict) lines.push('\n  (--strict: exiting 1)')
  return lines.join('\n')
}

const parseArgs = (argv) => {
  const args = { strict: false, space: null, json: false, codeOnly: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--strict') args.strict = true
    else if (argv[i] === '--space') args.space = argv[++i]
    else if (argv[i] === '--json') args.json = true
    // For callers that only care about the code line and want to skip the
    // (slower, network-fanout) space check entirely — pre-push-gate.sh uses
    // this so a push isn't held up waiting on tier reads it doesn't need.
    else if (argv[i] === '--code-only') args.codeOnly = true
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
    console.log(formatReport({ code, spaces, strict: args.strict }))
  }

  if (notLatest && args.strict) process.exitCode = 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
