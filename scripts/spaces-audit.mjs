#!/usr/bin/env node
/**
 * spaces-audit.mjs — audit every space this repo declares, in one command.
 *
 * `spaces/<id>/di-space.space.json` is the declaration; space-sync's --audit
 * reads one of them. Running eight commands by hand is seven chances to check
 * seven spaces and call it a platform.
 *
 *   node scripts/spaces-audit.mjs            # every declared space
 *   node scripts/spaces-audit.mjs --space wcc
 *
 * Read-only: --audit never writes, so this is safe against production. Exits 1
 * if any governed tier differs from what the repo declares.
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SPACES_DIR = path.join(ROOT, 'spaces')
const ENGINE = path.join(ROOT, 'scripts', 'space-sync.mjs')

const only = (() => {
  const i = process.argv.indexOf('--space')
  return i === -1 ? null : process.argv[i + 1]
})()

const run = (manifest) => new Promise((resolve) => {
  const child = spawn(process.execPath, [ENGINE, '--space', manifest, '--audit'],
    { cwd: ROOT, stdio: 'inherit' })
  child.on('close', (code) => resolve(code ?? 1))
})

const entries = await fs.readdir(SPACES_DIR, { withFileTypes: true }).catch(() => [])
const declared = []
for (const e of entries) {
  if (!e.isDirectory()) continue
  if (only && e.name !== only) continue
  const manifest = path.join(SPACES_DIR, e.name, 'di-space.space.json')
  if (await fs.access(manifest).then(() => true, () => false)) declared.push({ id: e.name, manifest })
}

if (!declared.length) {
  console.error(only ? `No declaration at spaces/${only}/di-space.space.json` : 'No spaces declared.')
  process.exit(1)
}

const failed = []
for (const { id, manifest } of declared) {
  const code = await run(manifest)
  if (code !== 0) failed.push(id)
  console.log('')
}

console.log(`${declared.length} space(s) audited: ${declared.map((d) => d.id).join(', ')}`)
if (failed.length) {
  console.log(`✗ drift in: ${failed.join(', ')}`)
  process.exit(1)
}
console.log('✓ every declared space matches its governed tiers.')
