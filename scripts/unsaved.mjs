#!/usr/bin/env node
/**
 * unsaved.mjs — every piece of work under these folders that lives only on this machine.
 *
 *   npm run unsaved -- ~/dev ~/Desktop        # scan folders for git repos (any project, not only di.iiii)
 *   npm run unsaved                           # just this checkout, all its worktrees
 *   node scripts/unsaved.mjs --json <dir>...  # for a scheduled task or another script
 *
 * Exit code: 0 when nothing is only-here, 1 when something is, 2 when a repo could
 * not be read. A scheduled task can alert on a non-zero exit without parsing text.
 * See scripts/unsaved-lib.mjs for what counts and why.
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { findRepos, formatRepo, isClean, scanRepo } from './unsaved-lib.mjs'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const main = () => {
  const argv = process.argv.slice(2)
  const json = argv.includes('--json')
  const dirs = argv.filter((a) => !a.startsWith('--'))
  const repos = dirs.length ? [...new Set(dirs.flatMap((d) => findRepos(d)))] : [ROOT_DIR]
  const results = repos.map((repo) => scanRepo(repo))

  const onlyHere = results.filter((r) => !isClean(r))
  if (json) {
    console.log(JSON.stringify({ checkedAt: new Date().toISOString(), repos: results }, null, 2))
  } else if (!onlyHere.length) {
    console.log(`  SAVED — ${results.length} repo${results.length === 1 ? '' : 's'} checked, nothing lives only on this machine`)
  } else {
    console.log(`  ONLY ON THIS MACHINE — ${onlyHere.length} of ${results.length} repos hold work that exists nowhere else:`)
    for (const r of onlyHere) {
      console.log('')
      console.log(`  ${r.repo}`)
      for (const line of formatRepo(r)) console.log(line)
    }
  }
  process.exitCode = results.some((r) => r.error) ? 2 : onlyHere.length ? 1 : 0
}

main()
