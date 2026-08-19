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
//   node scripts/session-land.mjs             # do it
//   node scripts/session-land.mjs --dry-run   # show what would happen, touch nothing

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { foldNotesIntoProgress, buildLastSessionSection, replaceLastSessionSection } from './session-land-lib.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sessionsDir = path.join(repoRoot, 'docs', 'ai', 'sessions')
const progressPath = path.join(repoRoot, 'PROGRESS.md')
const currentMdPath = path.join(repoRoot, 'CURRENT.md')

const git = (args) => execFileSync('git', args, { encoding: 'utf8', cwd: repoRoot }).trim()

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

  const noteFiles = fs.existsSync(sessionsDir)
    ? fs.readdirSync(sessionsDir).filter((name) => name.endsWith('.md') && name !== 'README.md').sort()
    : []

  if (!noteFiles.length) {
    console.log('Nothing to land — docs/ai/sessions/ has no notes beyond README.md.')
    return
  }

  const notes = noteFiles.map((name) => fs.readFileSync(path.join(sessionsDir, name), 'utf8'))
  console.log(`Landing ${noteFiles.length} session note(s): ${noteFiles.join(', ')}`)

  const progressContent = fs.readFileSync(progressPath, 'utf8')
  const newProgress = foldNotesIntoProgress(progressContent, notes)

  const currentMdContent = fs.readFileSync(currentMdPath, 'utf8')
  const newCurrentMd = replaceLastSessionSection(currentMdContent, buildLastSessionSection(notes))

  if (dryRun) {
    console.log('--dry-run: would update PROGRESS.md and CURRENT.md, delete the note files, sweep worktrees, and commit.')
    console.log('\n--- new CURRENT.md "Last session" ---\n')
    console.log(buildLastSessionSection(notes))
    return
  }

  fs.writeFileSync(progressPath, newProgress)
  fs.writeFileSync(currentMdPath, newCurrentMd)
  for (const name of noteFiles) fs.unlinkSync(path.join(sessionsDir, name))

  console.log('\nSweeping worktrees:')
  try {
    execFileSync('node', [path.join(repoRoot, 'scripts', 'repo-state.mjs'), '--sweep'], { stdio: 'inherit', cwd: repoRoot })
  } catch (error) {
    console.error(`worktree sweep failed (non-fatal, continuing): ${error.message}`)
  }

  execFileSync('git', ['add', 'PROGRESS.md', 'CURRENT.md', 'docs/ai/sessions'], { cwd: repoRoot })
  const titles = noteFiles.map((f) => f.replace(/\.md$/, '')).join(', ')
  execFileSync('git', ['commit', '-m', `chore(land): fold ${noteFiles.length} session note(s) into PROGRESS/CURRENT (${titles})`], { cwd: repoRoot })

  console.log('\nLanded. Not pushed — review the commit, then push when ready.')
}

main()
