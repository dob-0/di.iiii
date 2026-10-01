import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import { isFoldBranch, isFoldNotesBranch } from './repo-state-lib.mjs'

// 2026-10-01: the hand-fold branch (chore/fold-notes-after-686) had to leave a session note
// for its own branch, and that note then sat on dev: the pre-push gate refuses every push
// from a dev checkout while docs/ai/sessions/ is not empty, and CI's land job cannot push to
// protected dev, so nothing folded it. A fold branch folds notes; it must not need one.
describe('isFoldNotesBranch', () => {
  it.each(['chore/fold-notes-after-686', 'chore/fold-notes-'])('exempts %s', (name) =>
    expect(isFoldNotesBranch(name)).toBe(true)
  )

  it.each(['land/batch-a11y-fe-2026-10-01', 'dev', 'main', 'feat/x', 'chore/fold-notes', 'chore/other', 'xchore/fold-notes-a', '', null, undefined])(
    'does not exempt %s (land/* branches carry real notes and keep needing one)', (name) =>
      expect(isFoldNotesBranch(name)).toBe(false)
  )

  it('stays a subset of the fold branches that may write CURRENT.md', () => {
    expect(isFoldBranch('chore/fold-notes-after-686')).toBe(true)
  })
})

const ROOT = path.resolve(import.meta.dirname, '..')
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

let tmp
let tree
afterAll(() => {
  if (tree) {
    try { git(ROOT, 'worktree', 'remove', '--force', tree) } catch { /* already gone */ }
  }
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true })
})

// Runs the real checker on a throwaway checkout of this commit, on a named branch, and
// returns everything it printed (it exits non-zero on any other docs problem; only the
// session-note message matters here).
const runCheckerOnBranch = (branch) => {
  git(tree, 'checkout', '-q', '-B', branch)
  try {
    execFileSync('node', ['scripts/check-agent-docs.mjs'], { cwd: tree, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    return ''
  } catch (error) {
    return `${error.stdout || ''}${error.stderr || ''}`
  }
}

describe('check-agent-docs, session-note rule', () => {
  it('asks a feature branch for its note but not a fold-notes branch', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fold-notes-docs-'))
    tree = path.join(tmp, 'w')
    git(ROOT, 'worktree', 'add', '--detach', tree, 'HEAD')
    // Judge the committed files, but run this checkout's scripts so an uncommitted fix is what runs.
    for (const f of ['check-agent-docs.mjs', 'repo-state-lib.mjs']) {
      fs.copyFileSync(path.join(ROOT, 'scripts', f), path.join(tree, 'scripts', f))
    }
    const featureOut = runCheckerOnBranch('feat/session-note-control')
    expect(featureOut).toContain('No session note at docs/ai/sessions/feat-session-note-control.md')

    const foldOut = runCheckerOnBranch('chore/fold-notes-after-test')
    expect(foldOut).not.toContain('No session note')
  }, 60000)
})
