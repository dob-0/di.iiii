import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { applyFold, decide, foldBranchName, listNoteFiles, planFold } from './fold-notes-branch.mjs'
import { isFoldBranch } from './repo-state-lib.mjs'

const PROGRESS = '# Progress\n\nintro\n\n---\n\n## 2026-01-01 — older entry\n\n- old\n'
const CURRENT = '# Current\n\n---\n\n## Last session\n\n- stale\n\nFull detail: `PROGRESS.md`.\n\n## What works\n\n- things\n'

let root
const write = (rel, text) => {
  const p = path.join(root, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, text)
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'fold-notes-'))
  write('PROGRESS.md', PROGRESS)
  write('CURRENT.md', CURRENT)
  write('docs/ai/sessions/README.md', '# readme\n')
  write('docs/ai/sessions/b-branch.md', '## 2026-10-13 — second title\n\n- b body\n')
  write('docs/ai/sessions/a-branch.md', '## 2026-10-12 — first title\n\n- a body\n')
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

describe('fold-notes-branch', () => {
  it('lists notes sorted, never README.md', () => {
    expect(listNoteFiles(root)).toEqual(['a-branch.md', 'b-branch.md'])
  })

  it('plans without touching the tree', () => {
    const plan = planFold(root)
    expect(plan.noteFiles).toHaveLength(2)
    expect(fs.readFileSync(path.join(root, 'PROGRESS.md'), 'utf8')).toBe(PROGRESS)
    expect(listNoteFiles(root)).toHaveLength(2)
  })

  it('folds every note verbatim into PROGRESS.md above the old top entry', () => {
    applyFold(root)
    const progress = fs.readFileSync(path.join(root, 'PROGRESS.md'), 'utf8')
    expect(progress).toContain('- a body')
    expect(progress).toContain('- b body')
    expect(progress.indexOf('first title')).toBeLessThan(progress.indexOf('older entry'))
    expect(progress.startsWith('# Progress\n\nintro\n\n---\n\n')).toBe(true)
  })

  it('rewrites only the Last session section of CURRENT.md as a title list', () => {
    applyFold(root)
    const current = fs.readFileSync(path.join(root, 'CURRENT.md'), 'utf8')
    expect(current).toContain('- first title\n- second title')
    expect(current).not.toContain('stale')
    expect(current).toContain('## What works\n\n- things')
  })

  it('deletes the notes, keeps README.md, and has nothing left to fold', () => {
    applyFold(root)
    expect(fs.readdirSync(path.join(root, 'docs/ai/sessions'))).toEqual(['README.md'])
    expect(applyFold(root)).toBeNull()
  })

  it('names its branch the way the docs gate recognises a hand-fold branch', () => {
    expect(foldBranchName(new Date('2026-10-13T12:00:00Z'))).toBe('chore/fold-notes-2026-10-13')
    expect(isFoldBranch(foldBranchName())).toBe(true)
  })

  describe('decide', () => {
    it('refuses a dirty tree, even on a fold branch', () => {
      const d = decide({ branch: 'chore/fold-notes-2026-10-13', dirty: ' M x' })
      expect(d.action).toBe('refuse')
      expect(d.reason).toMatch(/dirty/)
    })

    it('refuses a non-fold branch, and dev without --new', () => {
      expect(decide({ branch: 'feat/x', dirty: '', wantNew: true }).action).toBe('refuse')
      expect(decide({ branch: 'dev', dirty: '' }).action).toBe('refuse')
      expect(decide({ branch: '', dirty: '' }).reason).toMatch(/detached/)
    })

    it('folds in place on chore/fold-notes-* and land/* branches', () => {
      expect(decide({ branch: 'chore/fold-notes-2026-10-13', dirty: '' })).toEqual({ action: 'fold', newBranch: false })
      expect(decide({ branch: 'land/x', dirty: '' })).toEqual({ action: 'fold', newBranch: false })
    })

    it('--new from clean dev makes a branch; --dry-run does not', () => {
      expect(decide({ branch: 'dev', dirty: '', wantNew: true })).toEqual({ action: 'fold', newBranch: true })
      expect(decide({ branch: 'dev', dirty: '', wantNew: true, dryRun: true })).toEqual({ action: 'fold', newBranch: false })
    })
  })
})
