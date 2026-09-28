#!/usr/bin/env node
/**
 * install-git-hooks.mjs — points this checkout's git at scripts/git-hooks.
 * Runs from package.json "prepare", i.e. on every `npm install` / `npm ci`, so a
 * person or assistant who follows ONBOARDING gets the hooks without a step to
 * remember. Undo: `git config --unset core.hooksPath`.
 *
 * Skipped (silently, exit 0 — an install must never fail on this):
 *   - in CI (CI=true): workflows such as deploy-vps-dev.yml push to dev by design
 *   - outside a git checkout (Docker build context, an unpacked release)
 *   - when DI_NO_GIT_HOOKS=1
 *   - when core.hooksPath already points somewhere else — someone chose that;
 *     we say so instead of overwriting it
 */
import { execFileSync } from 'node:child_process'

const git = (args) => {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

const HOOKS = 'scripts/git-hooks'

if (process.env.CI || process.env.DI_NO_GIT_HOOKS === '1') process.exit(0)
if (git(['rev-parse', '--is-inside-work-tree']) !== 'true') process.exit(0)

const current = git(['config', '--get', 'core.hooksPath'])
if (current === HOOKS) process.exit(0)
if (current) {
  console.log(`  git hooks: core.hooksPath is already "${current}" — left alone. di.iiii's hooks live in ${HOOKS}.`)
  process.exit(0)
}
if (git(['config', 'core.hooksPath', HOOKS]) === null) {
  console.log(`  git hooks: could not set core.hooksPath — run: git config core.hooksPath ${HOOKS}`)
} else {
  console.log(`  git hooks: on (${HOOKS}) — no commits straight on dev/main, push checks on every push`)
}
