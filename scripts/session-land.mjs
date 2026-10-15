#!/usr/bin/env node
// session-land.mjs — `npm run land`. The one thing that writes CURRENT.md.
//
// Run on dev, tree clean, after merging PR(s) whose branches left a note in
// docs/ai/sessions/ (see its README, and docs/ai/golden_rules.md for why this exists
// -- CURRENT.md's own "replace, don't append" convention plus concurrent branches
// raced destructively; this is the fix). Folds every note into PROGRESS.md, rewrites
// CURRENT.md's "## Last session" to a title list pointing there, deletes the note
// files, sweeps worktrees (repo-state.mjs --sweep -- the enforced cleanup moment,
// not "whenever someone remembers"), and commits. Does not push.
//
// Since 2026-09-02 the fold itself normally happens in CI: deploy-vps-dev.yml's
// `land` job runs this script on every push to dev and pushes the commit (and ci.yml
// folds in place so the docs gate sees the landed tree). What CI cannot do is sweep
// YOUR worktrees, so with nothing to fold this still runs the sweep -- otherwise the
// enforced cleanup moment quietly stops existing the day the fold stops being manual.
//
//   node scripts/session-land.mjs             # do it
//   node scripts/session-land.mjs --dry-run   # show what would happen, touch nothing

import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { buildLastSessionSection } from './session-land-lib.mjs'
import { planFold, applyFold } from './fold-notes-branch.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const git = (args) => execFileSync('git', args, { encoding: 'utf8', cwd: repoRoot }).trim()

const sweepWorktrees = () => {
  console.log('\nSweeping worktrees:')
  try {
    execFileSync('node', [path.join(repoRoot, 'scripts', 'repo-state.mjs'), '--sweep'], { stdio: 'inherit', cwd: repoRoot })
  } catch (error) {
    console.error(`worktree sweep failed (non-fatal, continuing): ${error.message}`)
  }
}

const main = () => {
  const dryRun = process.argv.includes('--dry-run')

  const branch = git(['branch', '--show-current'])
  if (branch !== 'dev') {
    console.error(`land refused: on "${branch || '(detached)'}", not dev. This command lands work INTO dev; switch there first.`)
    process.exit(1)
  }

  const dirty = git(['status', '--porcelain'])
  if (dirty) {
    console.error('land refused: working tree is dirty. Commit, stash, or discard first.')
    process.exit(1)
  }

  const plan = planFold(repoRoot)
  const { noteFiles, notes } = plan

  if (!noteFiles.length) {
    console.log('Nothing to fold — docs/ai/sessions/ has no notes beyond README.md (CI lands them on merge; see deploy-vps-dev.yml).')
    if (!dryRun) sweepWorktrees()
    return
  }

  console.log(`Landing ${noteFiles.length} session note(s): ${noteFiles.join(', ')}`)

  if (dryRun) {
    console.log('--dry-run: would update PROGRESS.md and CURRENT.md, delete the note files, sweep worktrees, and commit.')
    console.log('\n--- new CURRENT.md "Last session" ---\n')
    console.log(buildLastSessionSection(notes))
    return
  }

  applyFold(repoRoot)

  sweepWorktrees()

  execFileSync('git', ['add', 'PROGRESS.md', 'CURRENT.md', 'docs/ai/sessions'], { cwd: repoRoot })
  const titles = noteFiles.map((f) => f.replace(/\.md$/, '')).join(', ')
  execFileSync('git', ['commit', '-m', `chore(land): fold ${noteFiles.length} session note(s) into PROGRESS/CURRENT (${titles})`], { cwd: repoRoot })

  console.log('\nLanded. Not pushed — review the commit, then push when ready.')
}

main()
