#!/usr/bin/env node
/**
 * space-sync-selfcheck.mjs — vendored into each linked repo as
 * scripts/sync-space-check.mjs (see space-sync-vendor.mjs --release).
 *
 * Runs in the LINKED repo's own CI, not di.iiii's. This inversion is the whole point:
 * di.iiii's own CI only ever has di.iiii checked out, so a drift check that lives
 * there is structurally unable to see a linked repo's copy — space-sync-vendor.mjs
 * (the check that DOES exist) is explicitly designed to skip, not fail, any repo
 * it can't find on disk. That made the 2026-08-05 v5->v6 upgrade sit uncommitted for
 * 15+ hours: nothing was watching from the side that could actually tell.
 *
 * This fetches di.iiii's real upstream file fresh (dob-0/di.iiii is public, no token
 * needed) and compares. On ANY failure — network, byte mismatch, minEngine mismatch —
 * it fails loudly and names the fix. Never skips silently; skip-on-absence is exactly
 * the flaw being fixed.
 *
 *   node scripts/sync-space-check.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const UPSTREAM_URL = 'https://raw.githubusercontent.com/dob-0/di.iiii/dev/scripts/space-sync.mjs'
const VENDORED_PATH = path.join('scripts', 'sync-space.mjs')
const FETCH_RETRIES = 3
const FETCH_TIMEOUT_MS = 10_000

const ENGINE_VERSION_RE = /export const ENGINE_VERSION = (\d+)/
const parseEngineVersion = (text) => {
  const m = ENGINE_VERSION_RE.exec(text)
  return m ? Number(m[1]) : null
}

const fetchUpstream = async () => {
  let lastError = null
  for (let attempt = 1; attempt <= FETCH_RETRIES; attempt++) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
      const res = await fetch(UPSTREAM_URL, { signal: controller.signal })
      clearTimeout(timeout)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.text()
    } catch (error) {
      lastError = error
      if (attempt < FETCH_RETRIES) await new Promise((r) => setTimeout(r, 1000 * attempt))
    }
  }
  throw lastError
}

const findSpaceManifests = (dir) => {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter((name) => /^di-space.*\.space\.json$/.test(name) || name === 'di-space.space.json')
}

const main = async () => {
  const localPath = path.join(repoRoot, VENDORED_PATH)
  if (!fs.existsSync(localPath)) {
    console.error(`FAIL: ${VENDORED_PATH} does not exist. Vendor it from di.iiii: npm run space:sync:release`)
    return 1
  }
  const localContent = fs.readFileSync(localPath, 'utf8')

  let upstreamContent
  try {
    upstreamContent = await fetchUpstream()
  } catch (error) {
    // Never skip on a fetch failure -- that is the exact bug this file exists to
    // not repeat. A network hiccup should read as "couldn't verify", loudly, not
    // as silent success.
    console.error(`FAIL: could not fetch upstream engine from ${UPSTREAM_URL}: ${error.message}`)
    console.error('This check refuses to pass without a real comparison -- retry, or investigate connectivity.')
    return 1
  }

  const errors = []

  if (localContent !== upstreamContent) {
    errors.push(
      `${VENDORED_PATH} differs from di.iiii's upstream (dev branch). ` +
        'Fix: in di.iiii, run `npm run space:sync:release`.'
    )
  }

  const localVersion = parseEngineVersion(localContent)
  const upstreamVersion = parseEngineVersion(upstreamContent)
  if (localVersion == null) {
    errors.push(`Could not find ENGINE_VERSION in local ${VENDORED_PATH} -- is this a pre-versioning copy?`)
  } else if (upstreamVersion != null && localVersion !== upstreamVersion) {
    errors.push(`Local engine is v${localVersion}, upstream is v${upstreamVersion}.`)
  }

  const manifests = findSpaceManifests(repoRoot)
  if (!manifests.length) {
    errors.push('No di-space*.space.json manifest found -- minEngine cannot be checked.')
  }
  for (const name of manifests) {
    const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, name), 'utf8'))
    if (manifest.minEngine !== localVersion) {
      errors.push(
        `${name} declares minEngine: ${manifest.minEngine ?? '(missing)'}, but the vendored engine is v${localVersion}. ` +
          'These must match (space-sync-vendor.mjs --release keeps them in sync automatically).'
      )
    }
  }

  if (errors.length) {
    console.error(`sync-space-check FAILED (${errors.length} issue(s)):`)
    for (const e of errors) console.error(`  ✗ ${e}`)
    return 1
  }

  console.log(`sync-space-check passed: v${localVersion}, byte-equal to di.iiii@dev, minEngine matches in ${manifests.length} manifest(s).`)
  return 0
}

main().then((code) => process.exit(code))
