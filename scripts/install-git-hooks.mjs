#!/usr/bin/env node
/**
 * install-git-hooks.mjs — installs di.iiii's git hooks for EVERY worktree of this repo.
 * Runs from package.json "prepare", i.e. on every `npm install` / `npm ci`, so a
 * person or assistant who follows ONBOARDING gets the hooks without a step to
 * remember. Undo: `git config --unset core.hooksPath`.
 *
 * Why a copy and not `core.hooksPath = scripts/git-hooks`: core.hooksPath is shared by
 * all worktrees, and a relative path resolves inside each one. A worktree on a branch
 * cut before the hooks existed (or the main checkout parked on an old `dev`) found no
 * hook at all, so a commit straight on `dev` went through there (measured 2026-09-29).
 * The hooks are therefore copied into the repo's own git dir (`<common dir>/di-hooks`)
 * and core.hooksPath points there by absolute path: one set of hooks, every worktree,
 * any branch. Each `npm install` refreshes the copy from the checked-out branch.
 *
 * Skipped (silently, exit 0 — an install must never fail on this):
 *   - in CI (CI=true): workflows such as deploy-vps-dev.yml push to dev by design
 *   - outside a git checkout (Docker build context, an unpacked release)
 *   - when DI_NO_GIT_HOOKS=1
 *   - when core.hooksPath already points somewhere that isn't ours — someone chose
 *     that; we say so instead of overwriting it
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = path.join(ROOT_DIR, 'scripts', 'git-hooks')
const HOOK_NAMES = ['pre-commit', 'pre-push']
// The value this script set before 2026-09-29; replaced on sight.
const LEGACY_VALUE = 'scripts/git-hooks'

const git = (args) => {
  try {
    return execFileSync('git', args, { cwd: ROOT_DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

// Forward slashes on every platform: git for Windows reads them, and the value is
// compared as a string below.
const slash = (p) => p.split(path.sep).join('/')

export const hooksDirFor = (commonDir) => slash(path.join(commonDir, 'di-hooks'))

export const isOurs = (value, target) => value === target || value === LEGACY_VALUE

const main = () => {
  if (process.env.CI || process.env.DI_NO_GIT_HOOKS === '1') return
  if (git(['rev-parse', '--is-inside-work-tree']) !== 'true') return
  const commonDir = git(['rev-parse', '--path-format=absolute', '--git-common-dir'])
  if (!commonDir) return
  const target = hooksDirFor(commonDir)

  const current = git(['config', '--get', 'core.hooksPath'])
  if (current && !isOurs(current, target)) {
    console.log(`  git hooks: core.hooksPath is already "${current}" — left alone. di.iiii's hooks: ${slash(SOURCE)}`)
    return
  }

  try {
    fs.mkdirSync(target, { recursive: true })
    for (const name of HOOK_NAMES) {
      const dest = path.join(target, name)
      fs.copyFileSync(path.join(SOURCE, name), dest)
      fs.chmodSync(dest, 0o755)
    }
    const commit = git(['rev-parse', '--short', 'HEAD']) || 'unknown'
    fs.writeFileSync(path.join(target, 'SOURCE.txt'),
      `Copied by scripts/install-git-hooks.mjs from ${slash(SOURCE)} at ${commit}, ${new Date().toISOString()}.\n` +
      'Do not edit here — edit scripts/git-hooks/ and run npm install.\n')
  } catch (error) {
    console.log(`  git hooks: could not copy hooks into ${target} (${error.message}) — not installed`)
    return
  }

  if (current !== target && git(['config', 'core.hooksPath', target]) === null) {
    console.log(`  git hooks: could not set core.hooksPath — run: git config core.hooksPath "${target}"`)
    return
  }
  console.log(`  git hooks: on for every worktree (${target}) — no commits straight on dev/main, push checks on every push`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
