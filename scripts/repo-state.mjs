#!/usr/bin/env node
// Reports live repo facts that used to be hand-transcribed into CURRENT.md — branch
// position, worktree sprawl, unmerged branches, promotion status — and nothing else.
// Always advisory (exit 0) by default; `--prune` runs `git worktree prune` and nothing
// more destructive. See docs/ai/golden_rules.md for why derived facts don't belong in
// CURRENT.md prose.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

import { getProductionPromotionPlan } from './deploy-lib.mjs'
import {
  formatStateReport,
  formatBriefReport,
  collectStateWarnings,
  collectFinishedHints,
  classifyWorktree,
  isSweepSafe,
  isNoiseBranch,
  isLiveProcessCmdline
} from './repo-state-lib.mjs'

// stdio must be explicit: execFileSync inherits the parent's stderr by default, so an
// EXPECTED failure (e.g. probing a branch with no upstream) prints a scary "fatal: ..."
// straight to the console even though the catch block below handles it cleanly and
// returns '' -- caught live testing `land` against a branch with no upstream, on this
// exact code path.
const git = (args, cwd) => {
  try {
    return execFileSync('git', args, { encoding: 'utf8', cwd, stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  } catch {
    return ''
  }
}

const repoRoot = git(['rev-parse', '--show-toplevel'])

const getCurrentBranch = () => git(['branch', '--show-current']) || null

const getCurrentBranchBehindDev = (branch) => {
  if (!branch || branch === 'dev') return null
  const out = git(['rev-list', '--count', `${branch}..origin/dev`])
  const n = Number(out)
  return Number.isFinite(n) && n > 0 ? n : null
}

// The cases getCurrentBranchBehindDev deliberately skips — detached HEAD and a stale
// local dev — are exactly how the main checkout served old code unnoticed (2026-08-10,
// 115 commits behind). Counted against the local origin/dev ref; no fetch.
const getHeadBehindDev = (branch) => {
  if (branch && branch !== 'dev') return null
  const out = git(['rev-list', '--count', 'HEAD..origin/dev'])
  const n = Number(out)
  return Number.isFinite(n) && n > 0 ? n : null
}

// "[gone]" = upstream configured but deleted on the remote (a merged branch) — a
// checkout parked there is a stale viewing surface. Distinct from never-pushed.
const isCurrentUpstreamGone = (branch) => {
  if (!branch) return false
  return git(['for-each-ref', '--format=%(upstream:track)', `refs/heads/${branch}`]) === '[gone]'
}

const isAncestor = (ancestorRef, descendantRef) => {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestorRef, descendantRef], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const getPromotionPlan = () => {
  const mainCommit = git(['rev-parse', 'origin/main'])
  const sourceCommit = git(['rev-parse', 'origin/dev'])
  if (!mainCommit || !sourceCommit) return null
  return getProductionPromotionPlan({
    mainCommit,
    sourceCommit,
    mainInSource: isAncestor('origin/main', 'origin/dev'),
    sourceInMain: isAncestor('origin/dev', 'origin/main')
  })
}

// git worktree list --porcelain: blank-line-separated records, each a run of
// "key value" lines (worktree/HEAD/branch) plus bare flags (bare/detached/prunable).
const getWorktrees = () => {
  const raw = git(['worktree', 'list', '--porcelain'])
  if (!raw) return []
  return raw.split('\n\n').filter(Boolean).map((block) => {
    const entry = { path: null, head: null, branch: null, detached: false, prunable: false }
    for (const line of block.split('\n')) {
      if (line.startsWith('worktree ')) entry.path = line.slice('worktree '.length)
      else if (line.startsWith('HEAD ')) entry.head = line.slice('HEAD '.length)
      else if (line.startsWith('branch ')) entry.branch = line.slice('branch '.length).replace('refs/heads/', '')
      else if (line === 'detached') entry.detached = true
      else if (line.startsWith('prunable')) entry.prunable = true
    }
    return entry
  }).filter((entry) => entry.path)
}

// Live-process detection is the only reliable "is this worktree actually in use"
// signal — the 2026-08-06 audit found git state alone (clean/dirty, ahead/behind)
// says nothing about it, and CURRENT.md's old hand-written "Trees" line (which port
// serves which worktree) was wrong by the time anyone read it twice. Scans /proc
// directly rather than shelling out to `ps`/`pgrep`, which aren't guaranteed present
// in every container image this might run in.
const PORT_PATTERN = /--port[= ](\d+)/

const getLiveProcesses = () => {
  let pids
  try {
    pids = fs.readdirSync('/proc').filter((name) => /^\d+$/.test(name))
  } catch {
    return [] // /proc not present (non-Linux) — degrade to "nothing is live", never throw
  }
  const procs = []
  for (const pid of pids) {
    let cmdline
    let cwd
    try {
      cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean).join(' ')
      cwd = fs.readlinkSync(`/proc/${pid}/cwd`)
    } catch {
      continue // process exited between readdir and read, or we can't see it — skip, not fatal
    }
    if (!isLiveProcessCmdline(cmdline)) continue // vitest run / vite build are one-shot, not a dev server
    const portMatch = PORT_PATTERN.exec(cmdline)
    procs.push({ pid, cwd, port: portMatch ? Number(portMatch[1]) : null })
  }
  return procs
}

// Nested worktrees (.claude/worktrees/* lives INSIDE the main di.iiii checkout) make
// naive prefix matching attribute a nested worktree's process to the outer one —
// verified live during the audit. Deepest (longest) matching path wins.
const attachLiveInfo = (worktrees, liveProcesses) => {
  const sorted = [...worktrees].sort((a, b) => b.path.length - a.path.length)
  for (const wt of worktrees) {
    wt.live = false
    wt.ports = []
  }
  for (const proc of liveProcesses) {
    const owner = sorted.find((wt) => proc.cwd === wt.path || proc.cwd.startsWith(`${wt.path}${path.sep}`))
    if (!owner) continue
    owner.live = true
    if (proc.port && !owner.ports.includes(proc.port)) owner.ports.push(proc.port)
  }
  return worktrees
}

const getWorktreeGitFacts = (wt) => {
  const dirty = git(['status', '--porcelain'], wt.path) !== ''
  const headSubject = git(['log', '-1', '--format=%s'], wt.path) || null
  // Refs and objects are shared across worktrees, so everything below runs against
  // the invoking repo — the report must be identical from any worktree.
  const headInOriginDev = wt.head ? isAncestor(wt.head, 'origin/dev') : false
  if (!wt.branch) return { dirty, headSubject, headInOriginDev, mergedIntoDev: true, hasUpstream: false }
  // git cherry (patch-id comparison) catches squash merges that merge-base --is-ancestor
  // misses entirely — a branch whose commits were squashed into one on origin/dev is
  // otherwise permanently misreported as "unmerged".
  const cherryOut = git(['cherry', 'origin/dev', wt.branch], wt.path)
  const mergedIntoDev = cherryOut
    .split('\n')
    .filter(Boolean)
    .every((line) => !line.startsWith('+'))
  const hasUpstream = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', `${wt.branch}@{upstream}`], wt.path) !== ''
  // "[gone]" = upstream configured but deleted on the remote — the trace a
  // squash-merged PR leaves once its branch is pruned. Distinct from never-pushed.
  const upstreamGone = git(['for-each-ref', '--format=%(upstream:track)', `refs/heads/${wt.branch}`]) === '[gone]'
  // Drift of the checked-out copy vs origin/<branch> — during the 2026-08-09 incident
  // the worktree holding dev was 10 behind origin/dev, so "dev" named two commits.
  // No origin/<branch> ref → git fails → '' → counts stay null. Behind matters most.
  let behindOrigin = null
  let aheadOfOrigin = null
  const counts = git(['rev-list', '--left-right', '--count', `origin/${wt.branch}...${wt.branch}`])
  if (counts) {
    const [behind, ahead] = counts.split(/\s+/).map(Number)
    if (Number.isFinite(behind) && Number.isFinite(ahead)) {
      behindOrigin = behind
      aheadOfOrigin = ahead
    }
  }
  return { dirty, headSubject, headInOriginDev, mergedIntoDev, hasUpstream, upstreamGone, behindOrigin, aheadOfOrigin }
}

const getUnmergedBranches = () => {
  const raw = git(['branch', '--no-merged', 'origin/dev', '--format=%(refname:short)'])
  if (!raw) return []
  return raw.split('\n').filter(Boolean).filter((name) => !isNoiseBranch(name)).map((name) => {
    const out = git(['rev-list', '--count', `origin/dev..${name}`])
    return { name, aheadOfDev: Number(out) || 0 }
  })
}

const getEnrichedWorktrees = () => {
  const worktrees = getWorktrees()
  for (const wt of worktrees) {
    if (wt.prunable) continue // directory is gone — nothing left to inspect
    wt.volatile = wt.path.startsWith('/tmp/')
    Object.assign(wt, getWorktreeGitFacts(wt))
  }
  attachLiveInfo(worktrees, getLiveProcesses())
  return worktrees
}

const getState = () => {
  const currentBranch = getCurrentBranch()
  const worktrees = getEnrichedWorktrees()
  return {
    currentBranch: currentBranch || '(detached)',
    currentPath: repoRoot || null,
    primaryPath: worktrees[0]?.path ?? null, // git worktree list always puts the main checkout first
    currentBranchBehindDev: getCurrentBranchBehindDev(currentBranch),
    headBehindDev: getHeadBehindDev(currentBranch),
    currentUpstreamGone: isCurrentUpstreamGone(currentBranch),
    promotionPlan: getPromotionPlan(),
    worktrees,
    unmergedBranches: getUnmergedBranches()
  }
}

// Removes only what classifyWorktree/isSweepSafe agree is safe (GONE, or STALE +
// clean + no live process + merged-or-cherry-empty). Never --force. Everything it
// refuses is listed with the reason and the exact override command — the missing
// half of --prune, which only ever cleaned up already-deleted directories.
const runSweep = (worktrees) => {
  let removed = 0
  for (const wt of worktrees) {
    if (wt.path === repoRoot) continue // never remove the checkout we're running from
    if (!isSweepSafe(wt)) {
      const verdict = classifyWorktree(wt)
      const reason = wt.live ? 'live process bound to it' : wt.dirty ? 'dirty' : 'not merged into dev'
      console.log(`  – ${verdict.padEnd(9)} ${wt.path} (not swept: ${reason} — git worktree remove ${wt.path} once resolved)`)
      continue
    }
    try {
      execFileSync('git', ['worktree', 'remove', wt.path], { encoding: 'utf8', cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] })
      console.log(`  ✓ removed ${wt.path}${wt.branch ? ` [${wt.branch}]` : ''}`)
      removed++
    } catch (error) {
      console.log(`  ✗ ${wt.path} — remove failed: ${error.message.split('\n')[0]}`)
    }
  }
  try {
    execFileSync('git', ['worktree', 'prune', '-v'], { encoding: 'utf8', stdio: 'inherit', cwd: repoRoot })
  } catch { /* advisory */ }
  console.log(`\n${removed} worktree(s) removed.`)
}

const main = () => {
  const args = process.argv.slice(2)

  if (args.includes('--prune')) {
    try {
      execFileSync('git', ['worktree', 'prune', '-v'], { encoding: 'utf8', stdio: 'inherit', cwd: repoRoot })
    } catch (error) {
      console.error(`worktree prune failed: ${error.message}`)
      process.exit(0) // advisory tool — never block a session on this
    }
    return
  }

  if (args.includes('--sweep')) {
    runSweep(getEnrichedWorktrees())
    return
  }

  const state = getState()

  if (args.includes('--json')) {
    console.log(JSON.stringify(state, null, 2))
    return
  }

  if (args.includes('--brief')) {
    console.log(formatBriefReport(state))
    return
  }

  console.log(formatStateReport(state))
  const warnings = collectStateWarnings(state)
  const hints = collectFinishedHints(state)
  if (warnings.length || hints.length) {
    console.log('  ---')
    for (const warning of warnings) {
      console.log(`  ⚠ ${warning}`)
    }
    for (const hint of hints) {
      console.log(`  · ${hint}`)
    }
  }
}

main()
