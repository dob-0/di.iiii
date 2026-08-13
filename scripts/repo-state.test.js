import { describe, expect, it } from 'vitest'

import {
  formatStateReport,
  formatBriefReport,
  collectStateWarnings,
  collectFinishedHints,
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

  // The 2026-08-09 incident: the primary checkout was detached, `git switch dev`
  // refused ("'dev' is already used by worktree at .../di.iiii-algomerge"), and
  // nothing in `npm run state` said who held dev. Two people meant different
  // things by "dev".
  it('names the worktree that holds a flow branch when it is not the primary checkout', () => {
    const report = formatStateReport({
      ...baseState(),
      primaryPath: '/home/nooo/di.iiii',
      worktrees: [
        { path: '/home/nooo/di.iiii', branch: null, detached: true },
        { path: '/home/nooo/di.iiii-algomerge', branch: 'dev' }
      ]
    })
    expect(report).toContain('dev is held by /home/nooo/di.iiii-algomerge')
  })

  it('stays silent about holders when the primary checkout holds the flow branch itself', () => {
    const report = formatStateReport({
      ...baseState(),
      primaryPath: '/home/nooo/di.iiii',
      worktrees: [{ path: '/home/nooo/di.iiii', branch: 'dev' }]
    })
    expect(report).not.toContain('is held by')
  })

  it('does not emit holder lines for non-flow branches — that is worktree-count noise', () => {
    const report = formatStateReport({
      ...baseState(),
      primaryPath: '/home/nooo/di.iiii',
      worktrees: [{ path: '/home/nooo/di.iiii-rawadmin', branch: 'feat/raw-admin' }]
    })
    expect(report).not.toContain('is held by')
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

  // Why `git switch dev` refused in the primary checkout on 2026-08-09: the branch
  // was checked out elsewhere. The warning must name the holder, not just "detached".
  it('explains a detached primary cannot take dev by naming who holds it', () => {
    const warnings = collectStateWarnings({
      ...baseState(),
      currentBranch: '(detached)',
      primaryPath: '/home/nooo/di.iiii',
      worktrees: [
        { path: '/home/nooo/di.iiii', branch: null, detached: true },
        { path: '/home/nooo/di.iiii-algomerge', branch: 'dev' }
      ]
    })
    expect(warnings.some((w) =>
      w.includes('primary checkout /home/nooo/di.iiii is detached') &&
      w.includes('dev is held by /home/nooo/di.iiii-algomerge') &&
      w.includes('git switch dev')
    )).toBe(true)
  })

  it('does not raise the cannot-take-dev warning when the primary is on a branch', () => {
    const warnings = collectStateWarnings({
      ...baseState(),
      currentBranch: 'feat/x',
      primaryPath: '/home/nooo/di.iiii',
      worktrees: [
        { path: '/home/nooo/di.iiii', branch: 'feat/x' },
        { path: '/home/nooo/di.iiii-algomerge', branch: 'dev' }
      ]
    })
    expect(warnings.some((w) => w.includes('cannot take'))).toBe(false)
  })

  // The other half of the incident: the holder's dev was 10 commits behind
  // origin/dev, so "dev" meant two different commits depending on who you asked.
  it('reports a held branch trailing its own origin ref, naming holder, sha and count', () => {
    const warnings = collectStateWarnings({
      ...baseState(),
      primaryPath: '/home/nooo/di.iiii',
      worktrees: [
        { path: '/home/nooo/di.iiii', branch: null, detached: true },
        { path: '/home/nooo/di.iiii-algomerge', branch: 'dev', head: '28deb245aa00c0de28deb245aa00c0de28deb245', behindOrigin: 10, aheadOfOrigin: 0 }
      ]
    })
    expect(warnings.some((w) => w.includes('di.iiii-algomerge holds dev at 28deb245 — 10 behind origin/dev'))).toBe(true)
  })

  it('stays silent on a held branch that is only ahead of origin — behind is the direction that lies', () => {
    const warnings = collectStateWarnings({
      ...baseState(),
      primaryPath: '/home/nooo/di.iiii',
      worktrees: [{ path: '/wt', branch: 'feat/x', head: 'abcdef1234567890', behindOrigin: 0, aheadOfOrigin: 3 }]
    })
    expect(warnings.some((w) => w.includes('holds'))).toBe(false)
  })

  it('mentions ahead alongside behind when a held branch has diverged both ways', () => {
    const warnings = collectStateWarnings({
      ...baseState(),
      primaryPath: '/home/nooo/di.iiii',
      worktrees: [{ path: '/wt/algo', branch: 'dev', head: 'abcdef1234567890', behindOrigin: 4, aheadOfOrigin: 2 }]
    })
    expect(warnings.some((w) => w.includes('4 behind origin/dev') && w.includes('2 ahead'))).toBe(true)
  })
})

// Hints, not actions: repo-state stays read-only. A "finished?" line points at a
// worktree whose branch looks done — merged, or its remote ref pruned after a
// squash-merge PR (where the tip is NOT an ancestor of dev, so ancestry alone
// would miss it). The human decides; --sweep has its own stricter gate.
describe('collectFinishedHints', () => {
  const wt = (overrides) => ({
    path: '/home/nooo/di.iiii-done', branch: 'feat/done', detached: false, prunable: false,
    dirty: false, live: false, hasUpstream: true, upstreamGone: false, headInOriginDev: false, ...overrides
  })
  const state = (worktrees) => ({ primaryPath: '/home/nooo/di.iiii', currentPath: '/home/nooo/di.iiii-here', worktrees })

  it('flags a branch whose remote ref is gone — the squash-merge shape ancestry misses', () => {
    const hints = collectFinishedHints(state([wt({ upstreamGone: true })]))
    expect(hints).toEqual(['finished? /home/nooo/di.iiii-done (remote ref gone)'])
  })

  it('flags a branch whose HEAD is contained in origin/dev', () => {
    const hints = collectFinishedHints(state([wt({ headInOriginDev: true })]))
    expect(hints).toEqual(['finished? /home/nooo/di.iiii-done (branch merged)'])
  })

  it('joins both reasons when both apply', () => {
    const hints = collectFinishedHints(state([wt({ upstreamGone: true, headInOriginDev: true })]))
    expect(hints).toEqual(['finished? /home/nooo/di.iiii-done (branch merged / remote ref gone)'])
  })

  it('never hints at a never-pushed branch — no remote ref was ever there to go missing', () => {
    const hints = collectFinishedHints(state([wt({ hasUpstream: false, upstreamGone: false })]))
    expect(hints).toEqual([])
  })

  it.each([
    ['dirty', { dirty: true, headInOriginDev: true }],
    ['live', { live: true, headInOriginDev: true }],
    ['prunable', { prunable: true, headInOriginDev: true }],
    ['detached (parking at origin/dev is this tool\'s own advice)', { branch: null, detached: true, headInOriginDev: true }]
  ])('never hints at a %s worktree', (_label, overrides) => {
    expect(collectFinishedHints(state([wt(overrides)]))).toEqual([])
  })

  it('never hints at the primary checkout or the worktree it is running from', () => {
    const hints = collectFinishedHints(state([
      wt({ path: '/home/nooo/di.iiii', headInOriginDev: true }),
      wt({ path: '/home/nooo/di.iiii-here', headInOriginDev: true })
    ]))
    expect(hints).toEqual([])
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
