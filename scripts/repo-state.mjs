#!/usr/bin/env node
// Reports live repo facts that used to be hand-transcribed into CURRENT.md — branch
// position, worktree sprawl, unmerged branches, promotion status — and nothing else.
// Always advisory (exit 0) by default; `--prune` runs `git worktree prune` and nothing
// more destructive. See docs/ai/golden_rules.md for why derived facts don't belong in
// CURRENT.md prose.
import { execFileSync } from 'node:child_process'

import { getProductionPromotionPlan } from './deploy-lib.mjs'
import { formatStateReport, collectStateWarnings, isNoiseBranch } from './repo-state-lib.mjs'

const git = (args) => {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim()
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

const isAncestor = (ancestorRef, descendantRef) => {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestorRef, descendantRef])
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
    const entry = { path: null, branch: null, detached: false, prunable: false }
    for (const line of block.split('\n')) {
      if (line.startsWith('worktree ')) entry.path = line.slice('worktree '.length)
      else if (line.startsWith('branch ')) entry.branch = line.slice('branch '.length).replace('refs/heads/', '')
      else if (line === 'detached') entry.detached = true
      else if (line.startsWith('prunable')) entry.prunable = true
    }
    return entry
  }).filter((entry) => entry.path)
}

const getUnmergedBranches = () => {
  const raw = git(['branch', '--no-merged', 'origin/dev', '--format=%(refname:short)'])
  if (!raw) return []
  return raw.split('\n').filter(Boolean).filter((name) => !isNoiseBranch(name)).map((name) => {
    const out = git(['rev-list', '--count', `origin/dev..${name}`])
    return { name, aheadOfDev: Number(out) || 0 }
  })
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

  const currentBranch = getCurrentBranch()
  const state = {
    currentBranch: currentBranch || '(detached)',
    currentBranchBehindDev: getCurrentBranchBehindDev(currentBranch),
    promotionPlan: getPromotionPlan(),
    worktrees: getWorktrees(),
    unmergedBranches: getUnmergedBranches()
  }

  console.log(formatStateReport(state))
  const warnings = collectStateWarnings(state)
  if (warnings.length) {
    console.log('  ---')
    for (const warning of warnings) {
      console.log(`  ⚠ ${warning}`)
    }
  }
}

main()
