#!/usr/bin/env node
/**
 * space-sync-vendor.mjs — keep the vendored copies of the sync engine equal.
 *
 * `scripts/space-sync.mjs` is the one engine. The linked repos (br_id_ge,
 * beyond_form, platform_recordar) vendor it as `scripts/sync-space.mjs` so
 * their own CI can run without checking out di.iiii.
 *
 * That arrangement drifts silently, and has: three of the four copies once ran
 * a version behind, and the stale one wrote `deviceAccess:false` (killing the
 * rite's camera) and skipped the staging host rewrite (writing every rehearsal
 * crossing into the live field). Later the drift ran the other way — the three
 * vendored copies reached v3 while THIS file, the one the docs call upstream,
 * was still the version with `DEFAULT_LIVE_URL = 'https://di-studio.xyz'`
 * baked in: a sync with no target named went straight to the live site.
 *
 * The engine's own header has told people to run this script since the day it
 * was written. It did not exist until 2026-08-05 — which is the whole reason
 * nobody caught either drift.
 *
 *   node scripts/space-sync-vendor.mjs             # check; exit 1 on drift
 *   node scripts/space-sync-vendor.mjs --write     # copy upstream over the rest
 *   node scripts/space-sync-vendor.mjs --release   # write + bump minEngine + commit + push
 *                                                   # each linked repo -- the one-command
 *                                                   # fix for "vendored locally, never landed"
 *   node scripts/space-sync-vendor.mjs --release --dry-run   # show what --release would do
 *   node scripts/space-sync-vendor.mjs --root /somewhere
 *
 * Missing repos are reported and skipped, never failed: CI checks out one repo.
 * --write and --release both refuse from a stale/wrong location -- see
 * checkSafeSource() below.
 *
 * checkSafeSource() below closes a THIRD hole found 2026-08-06: every git
 * worktree in this repo carries its own full copy of scripts/, including this
 * file. At the time it was written, 8 runnable copies of this exact script
 * existed on one machine — 2 of them sitting next to a stale v4 engine, in
 * worktrees nobody had cleaned up. Running --write from either would have
 * silently downgraded all 3 linked repos and reported success. The guard
 * below makes that impossible regardless of how many stale copies exist or
 * where they sit — it does not depend on anyone finding and removing them.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const UPSTREAM = path.join(ROOT_DIR, 'scripts', 'space-sync.mjs')

// name → the path the copy lives at, relative to the linked repo
export const VENDORED_REPOS = ['br_id_ge', 'beyond_form', 'platform_recordar']
export const VENDORED_PATH = path.join('scripts', 'sync-space.mjs')

// Repos/dirs the tool writes to but never expects to commit or push — printed on
// every run so the exception stays visible instead of silently unmentioned.
export const KNOWN_EXCEPTIONS = {
  platform_recordar: 'no git remote — local check only, see docs/ai/space-sync-vendoring.md',
  'space-starter': 'scaffold template, not a git repo — refreshed by --write, never committed'
}

// Written but never committed: the scaffold new linked spaces are born from. Not in
// VENDORED_REPOS (that list implies "has its own CI to keep honest"); this one has
// neither a repo nor CI, so it's tracked separately and always just overwritten.
export const TEMPLATE_TARGETS = ['space-starter']

const ENGINE_VERSION_RE = /export const ENGINE_VERSION = (\d+)/

export const parseEngineVersion = (buf) => {
  const m = ENGINE_VERSION_RE.exec(String(buf))
  return m ? Number(m[1]) : null
}

// Pure — takes pre-gathered facts, returns an array of refusal reasons (empty = safe).
// Every reason names the exact fix, because "run this from the right place" is not
// discoverable from a stack trace once you're already running it from the wrong place.
export const checkSafeSource = ({
  isLinkedWorktree,
  headBranch,
  devIsAncestorOfHead,
  upstreamDirty,
  upstreamVersion,
  targetVersions = {},
  allowDowngrade
}) => {
  const reasons = []

  if (isLinkedWorktree) {
    reasons.push(
      'refusing to vendor from a linked git worktree — re-vendor from the canonical ' +
        'checkout instead (the one where `git rev-parse --git-dir` and `--git-common-dir` ' +
        'are the same path).'
    )
  }

  if (headBranch !== 'dev' && headBranch !== 'main') {
    reasons.push(
      `refusing to vendor from branch "${headBranch || '(detached HEAD)'}" — ` +
        'checkout dev (or main) first: git switch dev'
    )
  } else if (devIsAncestorOfHead === false) {
    reasons.push(
      'this checkout is behind origin/dev — pull first: git pull --ff-only origin dev'
    )
  }

  if (upstreamDirty) {
    reasons.push(
      'scripts/space-sync.mjs has uncommitted changes — commit and push the engine ' +
        'bump before vendoring it out. (This is exactly what stalled the last ' +
        'v5→v6 upgrade for 15+ hours: written to disk, never committed.)'
    )
  }

  if (!allowDowngrade && Number.isFinite(upstreamVersion)) {
    for (const [repo, targetVersion] of Object.entries(targetVersions)) {
      if (Number.isFinite(targetVersion) && targetVersion > upstreamVersion) {
        reasons.push(
          `${repo}'s vendored engine is v${targetVersion}, upstream is only v${upstreamVersion} — ` +
            'refusing to downgrade. Pass --allow-downgrade if this is deliberate.'
        )
      }
    }
  }

  return reasons
}

// stdio must be explicit -- execFileSync inherits the parent's stderr by default, so
// an EXPECTED failure (e.g. no upstream configured) prints straight to the console
// even though the catch below handles it cleanly. Same fix as repo-state.mjs's git().
const git = (args, cwd) => {
  try {
    return execFileSync('git', args, { encoding: 'utf8', cwd, stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  } catch {
    return null
  }
}

const gatherSafetyFacts = ({ upstream, upstreamVersion, targetVersions }) => {
  const gitDir = git(['rev-parse', '--git-dir'], ROOT_DIR)
  const commonDir = git(['rev-parse', '--git-common-dir'], ROOT_DIR)
  const isLinkedWorktree =
    gitDir != null && commonDir != null && path.resolve(ROOT_DIR, gitDir) !== path.resolve(ROOT_DIR, commonDir)

  const headBranch = git(['branch', '--show-current'], ROOT_DIR) || null
  let devIsAncestorOfHead = null
  if (headBranch === 'dev' || headBranch === 'main') {
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', 'origin/dev', 'HEAD'], { cwd: ROOT_DIR, stdio: 'ignore' })
      devIsAncestorOfHead = true
    } catch {
      devIsAncestorOfHead = false
    }
  }

  // --porcelain catches both staged and unstaged changes relative to HEAD; a plain
  // `git diff --quiet` would miss anything already staged.
  const statusOut = git(['status', '--porcelain', '--', 'scripts/space-sync.mjs'], ROOT_DIR)
  const upstreamDirty = Boolean(statusOut)

  return { isLinkedWorktree, headBranch, devIsAncestorOfHead, upstreamDirty, upstreamVersion, targetVersions }
}

const args = process.argv.slice(2)
const release = args.includes('--release')
const write = release || args.includes('--write')
const dryRun = args.includes('--dry-run')
const allowDowngrade = args.includes('--allow-downgrade')
const rootArg = args.indexOf('--root')
const root = rootArg >= 0 ? args[rootArg + 1] : os.homedir()

const hash = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12)

// Bumps "minEngine" in a di-space.space.json in place, preserving formatting as best
// effort (JSON.stringify with the same 2-space indent this repo's manifests use).
const bumpMinEngine = (manifestPath, version) => {
  if (!fs.existsSync(manifestPath)) return false
  const json = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  if (json.minEngine === version) return false
  json.minEngine = version
  fs.writeFileSync(manifestPath, JSON.stringify(json, null, 2) + '\n')
  return true
}

// One commit+push per repo -- not atomic across repos (git can't do that), but one
// invocation, and a partial failure names exactly which repo is behind instead of
// staying silent for 15 hours the way the last manual upgrade did.
const releaseOneRepo = (repoDir, repoName, upstreamVersion) => {
  if (dryRun) {
    console.log(`      (dry-run — would commit + push ${repoName})`)
    return
  }
  const staged = execFileSync('git', ['diff', '--cached', '--name-only'], { encoding: 'utf8', cwd: repoDir }).trim()
  if (staged) {
    console.log(`      ✗ ${repoName} has other staged changes — refusing to commit over them, left as a working-tree write`)
    return
  }
  execFileSync('git', ['add', VENDORED_PATH, 'di-space.space.json'], { cwd: repoDir })
  execFileSync(
    'git',
    ['commit', '-m', `chore(sync): vendor space-sync engine v${upstreamVersion} from di.iiii@${git(['rev-parse', '--short', 'HEAD'], ROOT_DIR)}`],
    { cwd: repoDir }
  )
  const hasRemote = git(['remote'], repoDir)
  if (!hasRemote) {
    console.log(`      ⚠ ${repoName} has NO REMOTE — this commit lives on one disk only`)
    return
  }
  try {
    execFileSync('git', ['push'], { cwd: repoDir, stdio: 'pipe' })
    console.log(`      ✓ ${repoName} committed and pushed`)
  } catch (e) {
    console.log(`      ✗ ${repoName} committed but push failed: ${e.message.split('\n')[0]}`)
  }
}

const main = () => {
  if (!fs.existsSync(UPSTREAM)) {
    console.error(`upstream engine missing: ${UPSTREAM}`)
    return 1
  }
  const upstream = fs.readFileSync(UPSTREAM)

  // A literal NUL byte makes git call the file binary — no diff, no grep, no
  // review — and that is exactly how both drifts stayed invisible. Refuse to
  // vendor one outward.
  if (upstream.includes(0)) {
    console.error('upstream engine contains a literal NUL byte — git will treat it as binary.')
    console.error('Write the placeholder as an escape instead, then re-run.')
    return 1
  }

  const upstreamVersion = parseEngineVersion(upstream)

  if (write) {
    const targetVersions = {}
    for (const repo of VENDORED_REPOS) {
      const target = path.join(root, repo, VENDORED_PATH)
      if (fs.existsSync(target)) targetVersions[repo] = parseEngineVersion(fs.readFileSync(target))
    }
    const facts = gatherSafetyFacts({ upstream, upstreamVersion, targetVersions })
    const refusals = checkSafeSource({ ...facts, allowDowngrade })
    if (refusals.length) {
      console.error(`space-sync-vendor.mjs --write refused (${refusals.length} reason(s)):`)
      for (const r of refusals) console.error(`  ✗ ${r}`)
      return 1
    }
  }

  console.log(`upstream  ${hash(upstream)}  v${upstreamVersion ?? '?'}  ${path.relative(root, UPSTREAM)}`)

  let drift = 0
  let missing = 0
  for (const repo of VENDORED_REPOS) {
    const target = path.join(root, repo, VENDORED_PATH)
    const exception = KNOWN_EXCEPTIONS[repo]
    if (!fs.existsSync(path.join(root, repo))) {
      console.log(`  – ${repo.padEnd(18)} not checked out here — skipped${exception ? ` (${exception})` : ''}`)
      missing++
      continue
    }
    const current = fs.existsSync(target) ? fs.readFileSync(target) : null
    if (current && current.equals(upstream)) {
      console.log(`  ✓ ${repo.padEnd(18)} ${hash(current)}  equal`)
      continue
    }
    drift++
    const was = current ? hash(current) : '(absent)'
    if (write) {
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, upstream)
      console.log(`  ✎ ${repo.padEnd(18)} ${was} → ${hash(upstream)}  written`)
      if (release) {
        const manifestPath = path.join(root, repo, 'di-space.space.json')
        const bumped = bumpMinEngine(manifestPath, upstreamVersion)
        if (bumped) console.log(`      minEngine → ${upstreamVersion} in di-space.space.json`)
        releaseOneRepo(path.join(root, repo), repo, upstreamVersion)
      }
    } else {
      console.log(`  ✗ ${repo.padEnd(18)} ${was}  DRIFTED from upstream`)
    }
    if (exception) console.log(`      exception: ${exception}`)
  }

  for (const target of TEMPLATE_TARGETS) {
    const dir = path.join(root, target)
    const file = path.join(dir, VENDORED_PATH)
    const exception = KNOWN_EXCEPTIONS[target]
    if (!fs.existsSync(dir)) {
      console.log(`  – ${target.padEnd(18)} not present here — skipped${exception ? ` (${exception})` : ''}`)
      continue
    }
    const current = fs.existsSync(file) ? fs.readFileSync(file) : null
    if (current && current.equals(upstream)) {
      console.log(`  ✓ ${target.padEnd(18)} ${hash(current)}  equal (template)`)
      continue
    }
    if (write) {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, upstream)
      console.log(`  ✎ ${target.padEnd(18)} written (template — not committed by this tool)`)
    } else {
      console.log(`  ✗ ${target.padEnd(18)} ${current ? hash(current) : '(absent)'}  DRIFTED (template)`)
      if (exception) console.log(`      exception: ${exception}`)
    }
  }

  if (missing) console.log(`\n${missing} repo(s) not present here — this check saw only what it could reach.`)
  if (drift && !write) {
    console.error(`\n${drift} copy/copies drifted. Re-vendor with: node scripts/space-sync-vendor.mjs --write`)
    console.error('Then commit and push each linked repo — vendoring locally changes nothing that CI runs.')
    return 1
  }
  if (drift && write) console.log(`\n${drift} copy/copies rewritten. Commit and push each linked repo.`)
  else if (!drift) console.log('\nall reachable copies equal.')
  return 0
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main())
