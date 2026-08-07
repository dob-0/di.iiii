// Pure formatting/threshold logic for the repo-state report (scripts/repo-state.mjs).
// Kept side-effect free so it can be unit tested (see scripts/repo-state.test.js) without
// touching git. All git I/O lives in the CLI wrapper.
//
// Why this exists: on 2026-08-06 CURRENT.md was rewritten 22 times in one day from 3
// different branches, twice one minute apart with contradictory claims about where
// `main` was. Nothing reported worktree count or branch position live, so every agent
// hand-transcribed a fact from its own stale view instead. This module is the source of
// truth those facts should come from — see docs/ai/golden_rules.md.

export const WORKTREE_BUDGET = 6
export const UNMERGED_BRANCH_BUDGET = 8

// Branches that are never meant to reach dev and would otherwise drown the report in
// noise that isn't actionable — dependabot PRs, the legacy cPanel artifact branches,
// and personal scratch branches.
export const NOISE_BRANCH_PATTERNS = [/^dependabot\//, /^cpanel-/, /^emily/]

export const isNoiseBranch = (name) => NOISE_BRANCH_PATTERNS.some((re) => re.test(name))

// `vitest run` (one-shot, exits when done) must NOT count as "live" -- caught during
// development of this module: it briefly still exists during its own exit/report
// phase, long enough for a concurrent repo-state call to misidentify a one-off test
// run as a persistent dev server (it did, on the very first real invocation).
// `vite build` is likewise one-shot. Only the actual long-running forms count.
export const isLiveProcessCmdline = (cmdline) => (
  /src\/index\.js/.test(cmdline) ||
  (/(^|[/\s])vite(\s|$)/.test(cmdline) && !/\bvite\s+build\b/.test(cmdline)) ||
  (/\bvitest\b/.test(cmdline) && !/\bvitest\s+run\b/.test(cmdline))
)

// One verdict per worktree, in priority order. This is the derived replacement for
// CURRENT.md's old hand-written "Trees" line (":5173 = X, :5174 = Y") — cut twice by
// the file's own line budget, and already wrong the second time (stale port mapping)
// before it was cut. live/dirty/mergedIntoDev/hasUpstream are gathered by repo-state.mjs
// (git + /proc I/O); this function only orders the facts into one label.
export const classifyWorktree = (wt) => {
  if (wt.prunable) return 'GONE'
  if (wt.live) return 'LIVE'
  if (!wt.detached && wt.branch && !wt.hasUpstream && !wt.mergedIntoDev) return 'UNPUSHED'
  if (!wt.detached && !wt.mergedIntoDev) return 'UNMERGED'
  return 'STALE'
}

// A worktree repo-state --sweep is allowed to `git worktree remove` on its own,
// without --force and without asking. Deliberately conservative: anything live, dirty,
// or with real unmerged work is left for a human. GONE (prunable) needs no further
// check — there is no working tree left to examine.
export const isSweepSafe = (wt) => {
  if (wt.prunable) return true
  return !wt.live && !wt.dirty && Boolean(wt.mergedIntoDev)
}

// state shape (all fields optional/best-effort — git failures should degrade, not throw):
// {
//   currentBranch, currentPath,
//   dev: { commit, aheadOfMain, behindMain },
//   main: { commit },
//   promotionPlan: { type },              // from getProductionPromotionPlan
//   currentBranchBehindDev,               // number|null
//   worktrees: [{ path, branch, prunable, detached }],
//   unmergedBranches: [{ name, aheadOfDev }]
// }

export const formatStateReport = (state) => {
  const lines = ['  di.iiii repo state']

  const branchLine = state.currentBranchBehindDev
    ? `  on ${state.currentBranch} (${state.currentBranchBehindDev} behind origin/dev)`
    : `  on ${state.currentBranch}`
  lines.push(branchLine)

  if (state.promotionPlan) {
    const planText = {
      noop: 'main matches dev — nothing to promote',
      'fast-forward': 'dev is ahead of main — a promotion would fast-forward',
      'abort-main-ahead': 'main has commits dev does not — promotion would refuse',
      merge: 'main and dev have diverged — promotion would need a merge'
    }[state.promotionPlan.type] || state.promotionPlan.type
    lines.push(`  ${planText}`)
  }

  const worktreeCount = state.worktrees?.length ?? 0
  const unmergedCount = state.unmergedBranches?.length ?? 0
  lines.push(`  ${worktreeCount} worktrees, ${unmergedCount} branches unmerged into dev`)

  return lines.join('\n')
}

// For the SessionStart hook — must stay short (a wall of text nobody reads is the same
// as no report) and must never block or touch the network. Counts, then only the two
// facts worth a glance before fanning out: what's LIVE (so nothing gets torn down or
// duplicated under it) and what's UNPUSHED (single point of failure if this disk dies).
export const formatBriefReport = (state) => {
  const worktrees = state.worktrees ?? []
  const lines = [`di.iiii: ${worktrees.length} worktrees, ${(state.unmergedBranches ?? []).length} unmerged branches`]

  for (const wt of worktrees) {
    if (!wt.live) continue
    const ports = wt.ports?.length ? ` :${wt.ports.join(' :')}` : ''
    lines.push(`  LIVE      ${wt.branch || '(detached)'}${ports}  ${wt.path}`)
  }
  for (const wt of worktrees) {
    if (classifyWorktree(wt) !== 'UNPUSHED') continue
    lines.push(`  UNPUSHED  ${wt.branch} — no remote, exists only on this disk`)
  }

  return lines.join('\n')
}

export const collectStateWarnings = (state, thresholds = {}) => {
  const worktreeBudget = thresholds.worktreeBudget ?? WORKTREE_BUDGET
  const unmergedBranchBudget = thresholds.unmergedBranchBudget ?? UNMERGED_BRANCH_BUDGET
  const warnings = []

  if (state.currentBranchBehindDev) {
    warnings.push(`current branch "${state.currentBranch}" is ${state.currentBranchBehindDev} commits behind origin/dev`)
  }

  const worktrees = state.worktrees ?? []
  if (worktrees.length > worktreeBudget) {
    warnings.push(`${worktrees.length} worktrees exceeds the budget of ${worktreeBudget}`)
  }

  const prunable = worktrees.filter((w) => w.prunable)
  if (prunable.length) {
    warnings.push(`${prunable.length} worktree(s) prunable (directory gone): ${prunable.map((w) => w.path).join(', ')}`)
  }

  const detached = worktrees.filter((w) => w.detached)
  if (detached.length) {
    warnings.push(`${detached.length} worktree(s) detached: ${detached.map((w) => w.path).join(', ')}`)
  }

  const unmerged = state.unmergedBranches ?? []
  if (unmerged.length > unmergedBranchBudget) {
    warnings.push(`${unmerged.length} branches unmerged into dev exceeds the budget of ${unmergedBranchBudget}`)
  }

  if (state.promotionPlan?.type === 'fast-forward') {
    warnings.push('dev is ahead of main and would fast-forward on promotion — finished work may not be live')
  }

  return warnings
}
