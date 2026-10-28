#!/usr/bin/env node
// fold-notes-branch.mjs — `npm run land:branch`. The hand fold (the route of PR #894) in one command.
//
// CI's `land` job cannot push the fold to protected `dev` (GH006), so the fold goes through a PR from a
// `chore/fold-notes-*` branch (the only kind that may change CURRENT.md; FOLD_BRANCH_PATTERN in
// repo-state-lib.mjs). This does what `npm run land` does to the files — the same three calls of
// session-land-lib, in the same order — without that CLI's dev-branch check, its worktree sweep (which
// reaches other checkouts) or its refusal to run anywhere but dev.
//
//   node scripts/fold-notes-branch.mjs --new       # on a clean dev: make chore/fold-notes-<today>, then fold
//   node scripts/fold-notes-branch.mjs             # already on a chore/fold-notes-* branch: fold and commit
//   node scripts/fold-notes-branch.mjs --dry-run   # show what would happen, touch nothing
//   node scripts/fold-notes-branch.mjs --no-commit # fold the files, leave them unstaged
//
// Does not push. Push the branch yourself (the pre-push gate runs), then open the PR into dev.

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { foldNotesIntoProgress, buildLastSessionSection, replaceLastSessionSection } from './session-land-lib.mjs'
import { isFoldBranch } from './repo-state-lib.mjs'

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export const listNoteFiles = (root) => {
  const dir = path.join(root, 'docs', 'ai', 'sessions')
  return fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((name) => name.endsWith('.md') && name !== 'README.md').sort()
    : []
}

// Read-only: what the fold would produce for the tree at `root`.
export const planFold = (root) => {
  const noteFiles = listNoteFiles(root)
  const notes = noteFiles.map((name) => fs.readFileSync(path.join(root, 'docs', 'ai', 'sessions', name), 'utf8'))
  if (!noteFiles.length) return { noteFiles, notes, progress: null, current: null }
  const progress = foldNotesIntoProgress(fs.readFileSync(path.join(root, 'PROGRESS.md'), 'utf8'), notes)
  const current = replaceLastSessionSection(
    fs.readFileSync(path.join(root, 'CURRENT.md'), 'utf8'),
    buildLastSessionSection(notes)
  )
  return { noteFiles, notes, progress, current }
}

// Writes PROGRESS.md and CURRENT.md, deletes the note files. Returns the plan (null when nothing to fold).
export const applyFold = (root) => {
  const plan = planFold(root)
  if (!plan.noteFiles.length) return null
  fs.writeFileSync(path.join(root, 'PROGRESS.md'), plan.progress)
  fs.writeFileSync(path.join(root, 'CURRENT.md'), plan.current)
  for (const name of plan.noteFiles) fs.unlinkSync(path.join(root, 'docs', 'ai', 'sessions', name))
  return plan
}

export const foldBranchName = (date = new Date()) => `chore/fold-notes-${date.toISOString().slice(0, 10)}`

// The decision, pure: what to do given the branch, the tree state and the flags.
// Returns { action: 'refuse', reason } | { action: 'fold', newBranch: boolean }.
export const decide = ({ branch, dirty, wantNew = false, dryRun = false }) => {
  if (dirty) return { action: 'refuse', reason: 'fold refused: working tree is dirty. Commit, stash, or discard first.' }
  if (isFoldBranch(branch)) return { action: 'fold', newBranch: false }
  if (!(wantNew && branch === 'dev')) {
    return {
      action: 'refuse',
      reason: `fold refused: on "${branch || '(detached)'}", not a chore/fold-notes-* or land/* branch. From a clean dev, run with --new; or: git checkout -b ${foldBranchName()}`
    }
  }
  return { action: 'fold', newBranch: !dryRun }
}

const main = () => {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const noCommit = args.includes('--no-commit')
  const wantNew = args.includes('--new')
  const git = (a) => execFileSync('git', a, { encoding: 'utf8', cwd: defaultRoot }).trim()

  const branch = git(['branch', '--show-current'])
  const decision = decide({ branch, dirty: git(['status', '--porcelain']), wantNew, dryRun })
  if (decision.action === 'refuse') {
    console.error(decision.reason)
    process.exit(1)
  }

  const plan = planFold(defaultRoot)
  if (!plan.noteFiles.length) {
    console.log('Nothing to fold — docs/ai/sessions/ has no notes beyond README.md.')
    return
  }
  console.log(`Folding ${plan.noteFiles.length} session note(s): ${plan.noteFiles.join(', ')}`)
  if (decision.newBranch) {
    const name = foldBranchName()
    try {
      git(['checkout', '-b', name])
    } catch {
      console.error(`fold refused: branch ${name} already exists. Check it out and run without --new.`)
      process.exit(1)
    }
    console.log(`On new branch ${name}.`)
  }
  if (dryRun) {
    console.log('--dry-run: would update PROGRESS.md and CURRENT.md and delete the note files.')
    console.log('\n--- new CURRENT.md "Last session" ---\n')
    console.log(buildLastSessionSection(plan.notes))
    return
  }
  applyFold(defaultRoot)
  if (noCommit) {
    console.log('\nFolded. Files changed, nothing staged or committed.')
    return
  }
  execFileSync('git', ['add', 'PROGRESS.md', 'CURRENT.md', 'docs/ai/sessions'], { cwd: defaultRoot })
  execFileSync('git', ['commit', '-m', `chore(land): fold ${plan.noteFiles.length} session note(s) into PROGRESS/CURRENT`], { cwd: defaultRoot })
  console.log('\nFolded and committed. Not pushed — push this branch, then open the PR into dev.')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
