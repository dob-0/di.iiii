#!/usr/bin/env node
/**
 * backup-open-call-applications.mjs — export open-call applications to JSON.
 *
 * Applications (`open_call_applications`) are live user-submitted data that
 * exist ONLY in each environment's SQLite DB. They are NOT included in space
 * bundles, install bundles, or any space/scene/document sync — a restore onto
 * a fresh data root silently loses them. Run this before any bulk data
 * operation on an environment (import, restore, space deletion, DB surgery).
 *
 * Usage:
 *   node scripts/backup-open-call-applications.mjs --base-url <origin>/serverXR --token <admin-token> [--call-id beyond_form] [--label prod]
 *
 * Env fallbacks: OPEN_CALL_BASE_URL, API_TOKEN.
 * Output: serverXR/data/_backups/open-call/<timestamp>-<label>.json (gitignored).
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : fallback
}

const baseUrl = (opt('base-url', process.env.OPEN_CALL_BASE_URL) || '').replace(/\/$/, '')
const token = opt('token', process.env.API_TOKEN)
const callId = opt('call-id', 'beyond_form')
const label = opt('label', baseUrl.includes('localhost') ? 'local' : new URL(baseUrl || 'http://unknown').hostname)

if (!baseUrl || !token) {
  console.error('Usage: node scripts/backup-open-call-applications.mjs --base-url <origin>/serverXR --token <admin-token> [--call-id beyond_form] [--label prod]')
  process.exit(1)
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(repoRoot, 'serverXR', 'data', '_backups', 'open-call')
fs.mkdirSync(outDir, { recursive: true })

const res = await fetch(`${baseUrl}/api/open-calls/${callId}/applications?limit=1000`, {
  headers: { Authorization: `Bearer ${token}` },
  signal: AbortSignal.timeout(30000)
})
if (!res.ok) {
  console.error(`[open-call-backup] ERROR: ${res.status} ${await res.text()}`)
  process.exit(1)
}
const { applications = [] } = await res.json()

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const file = path.join(outDir, `${stamp}-${label}.json`)
fs.writeFileSync(file, JSON.stringify({ label, callId, baseUrl, exportedAt: new Date().toISOString(), count: applications.length, applications }, null, 2))
console.log(`[open-call-backup] ${label}: ${applications.length} applications -> ${path.relative(repoRoot, file)}`)
