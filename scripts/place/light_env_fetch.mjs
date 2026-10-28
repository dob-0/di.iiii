#!/usr/bin/env node
// light_env_fetch.mjs — download the documents of projects (read-only GET) to files OUT_DIR/<tag>__<id>.json, the input of light_env_table.py.
// Venue-to-show skill: step 8 (env picker — gathering what the scenes have). Moved from the MOXIR light-environment audit (fetch.mjs,
// 2026-10-15, ledger N811.8). Generic: server, ids and folder are arguments.
//   node scripts/place/light_env_fetch.mjs --api http://127.0.0.1:4337/serverXR --tag local --out DIR [--token-file F] ID [ID ...]
import { readToken } from './api.mjs'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
export const parseArgs = (argv) => {
  const o = { ids: [], api: null, tag: 'doc', out: '.', tokenFile: null, help: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '-h' || a === '--help') o.help = true
    else if (a === '--api') o.api = argv[++i]
    else if (a === '--tag') o.tag = argv[++i]
    else if (a === '--out') o.out = argv[++i]
    else if (a === '--token-file') o.tokenFile = argv[++i]
    else o.ids.push(a)
  }
  return o
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const o = parseArgs(process.argv.slice(2))
  if (o.help || !o.api || !o.ids.length) {
    console.log('usage: node scripts/place/light_env_fetch.mjs --api URL/serverXR --tag NAME --out DIR [--token-file F] ID [ID ...]')
    process.exit(o.help ? 0 : 2)
  }
  const tok = readToken(o.tokenFile)
  mkdirSync(o.out, { recursive: true })
  for (const id of o.ids) {
    const r = await fetch(`${o.api}/api/projects/${id}/document`, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} })
    const t = await r.text()
    if (r.ok) writeFileSync(join(o.out, `${o.tag}__${id}.json`), t)
    console.log(o.tag, id, r.status, t.length)
  }
}
