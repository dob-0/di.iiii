import { describe, expect, it } from 'vitest'

import {
  formatStateReport,
  formatBriefReport,
  collectStateWarnings,
  classifyWorktree,
  isSweepSafe,
  isNoiseBranch,
  isLiveProcessCmdline,
  WORKTREE_BUDGET,
  UNMERGED_BRANCH_BUDGET
} from './repo-state-lib.mjs'

// This module exists because CURRENT.md was rewritten 22 times in one day, twice one
// minute apart with contradictory branch-position claims — see docs/ai/golden_rules.md.
// The tests below cover the pure logic only; scripts/repo-state.mjs owns the git I/O.

const baseState = () => ({
  currentBranch: 'dev',
  currentBranchBehindDev: null,
  promotionPlan: { type: 'noop' },
  worktrees: [],
  unmergedBranches: []
})

describe('formatStateReport', () => {
  it('names the current branch and its behind-count when off dev', () => {
    const report = formatStateReport({ ...baseState(), currentBranch: 'fix/audit-2026-08-05', currentBranchBehindDev: 8 })
    expect(report).toContain('fix/audit-2026-08-05')
    expect(report).toContain('8 behind origin/dev')
  })

  it('omits the behind-count when on dev with nothing to report', () => {
    const report = formatStateReport(baseState())
    expect(report).not.toContain('behind')
  })

  it('reports plain worktree and unmerged-branch counts without duplicating warnings', () => {
    const report = formatStateReport({ ...baseState(), worktrees: [{ path: '/a' }, { path: '/b' }], unmergedBranches: [{ name: 'x' }] })
    expect(report).toContain('2 worktrees, 1 branches unmerged into dev')
    expect(report).not.toContain('⚠')
  })

  it.each([
    ['noop', 'nothing to promote'],
    ['fast-forward', 'fast-forward'],
    ['abort-main-ahead', 'refuse'],
    ['merge', 'merge']
  ])('describes promotion plan type %s', (type, expectedFragment) => {
    const report = formatStateReport({ ...baseState(), promotionPlan: { type } })
    expect(report.toLowerCase()).toContain(expectedFragment.toLowerCase())
  })
})

describe('collectStateWarnings', () => {
  it('warns when the current branch trails origin/dev', () => {
    const warnings = collectStateWarnings({ ...baseState(), currentBranch: 'fix/audit-2026-08-05', currentBranchBehindDev: 8 })
    expect(warnings.some((w) => w.includes('8 commits behind'))).toBe(true)
  })

  it('does not warn when current branch is up to date', () => {
    const warnings = collectStateWarnings(baseState())
    expect(warnings).toHaveLength(0)
  })

  // The 2026-08-10 incident shape: main checkout detached on a merged branch's commit,
  // 115 behind origin/dev, serving old code for two days with no warning anywhere.
  it('warns when a detached (or dev) HEAD trails origin/dev — stale viewing surface', () => {
    const warnings = collectStateWarnings({ ...baseState(), currentBranch: '(detached)', headBehindDev: 115 })
    expect(warnings.some((w) => w.includes('115 commits behind') && w.includes('checkout --detach origin/dev'))).toBe(true)
  })

  it('warns when the current branch upstream is gone — parked on a merged branch', () => {
    const warnings = collectStateWarnings({ ...baseState(), currentBranch: 'fix/merged-thing', currentUpstreamGone: true })
    expect(warnings.some((w) => w.includes('upstream that is gone') && w.includes('checkout --detach origin/dev'))).toBe(true)
  })

  it('warns once worktree count exceeds the budget', () => {
    const worktrees = Array.from({ length: WORKTREE_BUDGET + 1 }, (_, i) => ({ path: `/wt-${i}` }))
    const warnings = collectStateWarnings({ ...baseState(), worktrees })
    expect(warnings.some((w) => w.includes('exceeds the budget'))).toBe(true)
  })

  it('does not warn at exactly the worktree budget', () => {
    const worktrees = Array.from({ length: WORKTREE_BUDGET }, (_, i) => ({ path: `/wt-${i}` }))
    const warnings = collectStateWarnings({ ...baseState(), worktrees })
    expect(warnings.some((w) => w.includes('worktrees exceeds'))).toBe(false)
  })

  it('separately flags prunable and detached worktrees regardless of budget', () => {
    const warnings = collectStateWarnings({
      ...baseState(),
      worktrees: [{ path: '/gone', prunable: true }, { path: '/stale', detached: true }]
    })
    expect(warnings.some((w) => w.includes('prunable') && w.includes('/gone'))).toBe(true)
    expect(warnings.some((w) => w.includes('detached') && w.includes('/stale'))).toBe(true)
  })

  it('warns once unmerged branches exceed the budget', () => {
    const unmergedBranches = Array.from({ length: UNMERGED_BRANCH_BUDGET + 1 }, (_, i) => ({ name: `feat/${i}`, aheadOfDev: 1 }))
    const warnings = collectStateWarnings({ ...baseState(), unmergedBranches })
    expect(warnings.some((w) => w.includes('unmerged into dev exceeds'))).toBe(true)
  })

  it('warns when a fast-forward promotion is available — finished work may not be live', () => {
    const warnings = collectStateWarnings({ ...baseState(), promotionPlan: { type: 'fast-forward' } })
    expect(warnings.some((w) => w.includes('may not be live'))).toBe(true)
  })

  it('respects overridden thresholds', () => {
    const worktrees = [{ path: '/a' }, { path: '/b' }]
    const warnings = collectStateWarnings({ ...baseState(), worktrees }, { worktreeBudget: 1 })
    expect(warnings.some((w) => w.includes('exceeds the budget of 1'))).toBe(true)
  })
})

// classifyWorktree/isSweepSafe exist because git state alone (clean/dirty,
// ahead/behind) says nothing about whether a worktree is actually in use — a live
// dev server bound to it was the only reliable signal found during the 2026-08-06
// audit, and none of the other tooling checked for one.
describe('classifyWorktree', () => {
  const wt = (overrides) => ({
    path: '/wt', branch: 'feat/x', detached: false, prunable: false,
    dirty: false, live: false, mergedIntoDev: false, hasUpstream: true, ...overrides
  })

  it('GONE wins over everything — a prunable worktree has no working tree left to examine', () => {
    expect(classifyWorktree(wt({ prunable: true, live: true, mergedIntoDev: false }))).toBe('GONE')
  })

  it('LIVE wins over merge status — never suggest touching a worktree with a running process', () => {
    expect(classifyWorktree(wt({ live: true, mergedIntoDev: false, hasUpstream: false }))).toBe('LIVE')
  })

  it('UNPUSHED is the loudest non-live verdict — no remote means this disk is the only copy', () => {
    expect(classifyWorktree(wt({ hasUpstream: false, mergedIntoDev: false }))).toBe('UNPUSHED')
  })

  it('a detached worktree is never UNPUSHED even with no upstream — nothing to push to a remote branch', () => {
    expect(classifyWorktree(wt({ detached: true, branch: null, hasUpstream: false, mergedIntoDev: true }))).toBe('STALE')
  })

  it('UNMERGED when pushed but not yet merged into dev', () => {
    expect(classifyWorktree(wt({ hasUpstream: true, mergedIntoDev: false }))).toBe('UNMERGED')
  })

  it('STALE when merged, clean, and not live — safe to remove', () => {
    expect(classifyWorktree(wt({ mergedIntoDev: true }))).toBe('STALE')
  })
})

describe('isSweepSafe', () => {
  it('sweeps a GONE worktree unconditionally', () => {
    expect(isSweepSafe({ prunable: true, live: true, dirty: true, mergedIntoDev: false })).toBe(true)
  })

  it('sweeps a clean, merged, non-live worktree', () => {
    expect(isSweepSafe({ prunable: false, live: false, dirty: false, mergedIntoDev: true })).toBe(true)
  })

  it('refuses a live worktree even if merged and clean', () => {
    expect(isSweepSafe({ prunable: false, live: true, dirty: false, mergedIntoDev: true })).toBe(false)
  })

  it('refuses a dirty worktree even if merged and not live', () => {
    expect(isSweepSafe({ prunable: false, live: false, dirty: true, mergedIntoDev: true })).toBe(false)
  })

  it('refuses an unmerged worktree even if clean and not live', () => {
    expect(isSweepSafe({ prunable: false, live: false, dirty: false, mergedIntoDev: false })).toBe(false)
  })
})

describe('formatBriefReport', () => {
  it('stays to counts alone when nothing is live or unpushed', () => {
    const report = formatBriefReport({ ...baseState(), worktrees: [{ path: '/a' }] })
    expect(report.split('\n')).toHaveLength(1)
    expect(report).toContain('1 worktrees')
  })

  it('lists a live worktree with its ports', () => {
    const report = formatBriefReport({
      ...baseState(),
      worktrees: [{ path: '/wt', branch: 'dev', live: true, ports: [5174, 4001] }]
    })
    expect(report).toContain('LIVE')
    expect(report).toContain(':5174 :4001')
    expect(report).toContain('/wt')
  })

  it('lists an unpushed branch by name', () => {
    const report = formatBriefReport({
      ...baseState(),
      worktrees: [{ path: '/wt', branch: 'feat/lonely', detached: false, hasUpstream: false, mergedIntoDev: false }]
    })
    expect(report).toContain('UNPUSHED')
    expect(report).toContain('feat/lonely')
  })

  it('stays within the ~12-line budget for the SessionStart hook even with several worktrees', () => {
    const worktrees = Array.from({ length: 5 }, (_, i) => ({
      path: `/wt-${i}`, branch: `feat/${i}`, live: i < 2, ports: i < 2 ? [5170 + i] : [],
      hasUpstream: i >= 3, mergedIntoDev: false
    }))
    const report = formatBriefReport({ ...baseState(), worktrees })
    expect(report.split('\n').length).toBeLessThanOrEqual(12)
  })
})

describe('isLiveProcessCmdline', () => {
  it('recognizes a real vite dev server, with or without an explicit port', () => {
    expect(isLiveProcessCmdline('node /home/nooo/di.iiii/node_modules/.bin/vite')).toBe(true)
    expect(isLiveProcessCmdline('node .bin/vite --port 5174 --strictPort')).toBe(true)
  })

  it('recognizes a serverXR instance', () => {
    expect(isLiveProcessCmdline('node src/index.js')).toBe(true)
  })

  it('recognizes vitest in watch mode', () => {
    expect(isLiveProcessCmdline('node .bin/vitest')).toBe(true)
    expect(isLiveProcessCmdline('node .bin/vitest watch')).toBe(true)
  })

  it('does NOT recognize `vitest run` -- a real false positive caught during development: a one-shot test run briefly still exists during its own exit/report phase and was misidentified as a persistent dev server', () => {
    expect(isLiveProcessCmdline('node .bin/vitest run scripts/repo-state.test.js')).toBe(false)
  })

  it('does NOT recognize `vite build` -- also one-shot', () => {
    expect(isLiveProcessCmdline('node .bin/vite build')).toBe(false)
  })

  it('does NOT recognize an unrelated process that happens to mention neither pattern', () => {
    expect(isLiveProcessCmdline('/bin/bash -c sleep 10')).toBe(false)
  })
})

describe('isNoiseBranch', () => {
  it.each(['dependabot/npm_and_yarn/foo', 'cpanel-staging', 'cpanel-production', 'emily-algovrithm'])(
    'excludes %s',
    (name) => expect(isNoiseBranch(name)).toBe(true)
  )

  it.each(['feat/timeline-core', 'fix/audit-gaps', 'dev', 'main'])(
    'keeps %s',
    (name) => expect(isNoiseBranch(name)).toBe(false)
  )
})
