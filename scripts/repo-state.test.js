import { describe, expect, it } from 'vitest'

import {
  formatStateReport,
  collectStateWarnings,
  isNoiseBranch,
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
