import { describe, expect, it } from 'vitest'

import { resolveGuardBranch, unlandedNoteErrors } from './repo-state-lib.mjs'

// 2026-11-04 (di-iiii-truth-vs-memory.md section 3): the "session notes must not land on
// dev/main" guard returned [] on a detached HEAD, which is what CI checks, so 243 files sit
// in docs/ai/sessions on dev and 205 on main. These pin the CI path.
describe('resolveGuardBranch', () => {
  it('keeps a real checked-out branch', () => {
    expect(resolveGuardBranch('feat/x', { GITHUB_HEAD_REF: 'other' })).toBe('feat/x')
  })
  it('uses the PR head on a detached pull_request run', () => {
    expect(resolveGuardBranch('', { GITHUB_EVENT_NAME: 'pull_request', GITHUB_HEAD_REF: 'fix/a', GITHUB_REF: 'refs/pull/9/merge' })).toBe('fix/a')
  })
  it('uses the pushed ref on a detached push run', () => {
    expect(resolveGuardBranch('', { GITHUB_REF: 'refs/heads/dev' })).toBe('dev')
    expect(resolveGuardBranch(null, { GITHUB_REF: 'refs/heads/main' })).toBe('main')
  })
  it('skips merge-queue runs and a local detached HEAD', () => {
    expect(resolveGuardBranch('', { GITHUB_EVENT_NAME: 'merge_group', GITHUB_REF: 'refs/heads/gh-readonly-queue/dev/pr-1-abc' })).toBe(null)
    expect(resolveGuardBranch('', { GITHUB_REF: 'refs/heads/gh-readonly-queue/dev/pr-1-abc' })).toBe(null)
    expect(resolveGuardBranch('', {})).toBe(null)
  })
})

describe('unlandedNoteErrors', () => {
  it('fires on dev/main for a note outside the baseline (the CI path: detached, pushed ref)', () => {
    const branch = resolveGuardBranch('', { GITHUB_REF: 'refs/heads/dev' })
    const errors = unlandedNoteErrors(branch, ['old.md', 'new-note.md'], ['old.md'])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('new-note.md')
    expect(errors[0]).not.toContain('old.md,')
  })
  it('does not fail for the baseline notes, nor on feature branches', () => {
    expect(unlandedNoteErrors('dev', ['old.md'], ['old.md'])).toEqual([])
    expect(unlandedNoteErrors('feat/x', ['any.md'], [])).toEqual([])
  })
})
