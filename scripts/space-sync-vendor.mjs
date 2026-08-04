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
 *   node scripts/space-sync-vendor.mjs           # check; exit 1 on drift
 *   node scripts/space-sync-vendor.mjs --write   # copy upstream over the rest
 *   node scripts/space-sync-vendor.mjs --root /somewhere
 *
 * Missing repos are reported and skipped, never failed: CI checks out one repo.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const UPSTREAM = path.join(ROOT_DIR, 'scripts', 'space-sync.mjs')

// name → the path the copy lives at, relative to the linked repo
export const VENDORED_REPOS = ['br_id_ge', 'beyond_form', 'platform_recordar']
export const VENDORED_PATH = path.join('scripts', 'sync-space.mjs')

const args = process.argv.slice(2)
const write = args.includes('--write')
const rootArg = args.indexOf('--root')
const root = rootArg >= 0 ? args[rootArg + 1] : os.homedir()

const hash = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12)

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

  console.log(`upstream  ${hash(upstream)}  ${path.relative(root, UPSTREAM)}`)

  let drift = 0
  let missing = 0
  for (const repo of VENDORED_REPOS) {
    const target = path.join(root, repo, VENDORED_PATH)
    if (!fs.existsSync(path.join(root, repo))) {
      console.log(`  – ${repo.padEnd(18)} not checked out here — skipped`)
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
    } else {
      console.log(`  ✗ ${repo.padEnd(18)} ${was}  DRIFTED from upstream`)
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
