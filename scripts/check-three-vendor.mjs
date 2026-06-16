/**
 * Checks that all npm dependencies that depend on `three` are included in the
 * vite.config.js three-vendor manualChunks group.
 *
 * Missing entries → TDZ crash in production (invisible in dev).
 * Run via: node scripts/check-three-vendor.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const viteConfig = fs.readFileSync(path.join(ROOT, 'vite.config.js'), 'utf8')

// Packages that are in the three-vendor allowlist per vite.config.js
// Extract them by scanning for pkg === / pkg.startsWith() patterns in the manualChunks section
const allowlistPatterns = []
for (const match of viteConfig.matchAll(/pkg === '([^']+)'/g)) allowlistPatterns.push({ exact: match[1] })
for (const match of viteConfig.matchAll(/pkg\.startsWith\('([^']+)'\)/g)) allowlistPatterns.push({ prefix: match[1] })

const inAllowlist = (name) =>
  allowlistPatterns.some((p) =>
    p.exact ? p.exact === name : name.startsWith(p.prefix)
  )

// Check each dependency: does its package.json list `three` as a peer/dep?
const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
const missing = []

for (const dep of deps) {
  const depPkgPath = path.join(ROOT, 'node_modules', dep, 'package.json')
  if (!fs.existsSync(depPkgPath)) continue
  let depPkg
  try { depPkg = JSON.parse(fs.readFileSync(depPkgPath, 'utf8')) } catch { continue }
  const allDeps = {
    ...depPkg.dependencies,
    ...depPkg.peerDependencies,
    ...depPkg.optionalDependencies
  }
  if ('three' in allDeps && !inAllowlist(dep)) {
    missing.push(dep)
  }
}

if (missing.length === 0) {
  console.log('three-vendor check passed — all three-dependent packages are in the allowlist.')
  process.exit(0)
} else {
  console.error('three-vendor check FAILED — these packages depend on three but are NOT in the manualChunks allowlist:')
  missing.forEach((m) => console.error(`  • ${m}`))
  console.error('\nAdd them to the three-vendor group in vite.config.js to prevent TDZ crashes in production.')
  process.exit(1)
}
