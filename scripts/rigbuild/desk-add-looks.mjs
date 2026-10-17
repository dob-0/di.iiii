// desk-add-looks.mjs — ADD a project's designed looks to the desk, valued over another project's patch, and touch nothing else:
// no cue list load, no look removed, no layer changed (2026-10-18, MOXIR "Red white cool": the show project is at the schema's
// 120-look cap, the desk is not). The values come from the same code as show-loop.mjs (deskLooksWithValues).
//   node scripts/rigbuild/desk-add-looks.mjs --api <serverXR> --project <looks source> --rig-project <patched project> --token-file <env>
//        [--desk http://diiii.localhost/light] [--fixture-overlay <json>] [--only id,id] [--dry-run]
//        [--force <profile regex>:<role>=<value>]  e.g. B380F:color=72 — a channel set straight, past the desk's colour table (WORKAROUND
//        2026-10-18: the B380F wheel table is the assumed Sharpy order; the walked wheel has amber on slot 7 = 72)
import { parseArgs, die, say } from '../place/common.mjs'
import { makeClient } from '../place/api.mjs'
import { rigLooksOf } from '../../src/rigbuild/looks.js'
import { deskLooksWithValues } from '../../src/rigbuild/deskLookValues.js'
import { libraryWithShow } from '../../src/rigbuild/rental.js'
import { loadLibrary } from './library.mjs'
import { withFixtureOverlay } from './fixture-overlay.mjs'
import fs from 'node:fs'
const args = parseArgs(process.argv.slice(2))
const token = (fs.readFileSync(String(args['token-file'] || die('needs --token-file')), 'utf8').split('\n').find((l) => l.startsWith('ADMIN_API_TOKEN=')) || '').slice(16).trim()
const client = makeClient(String(args.api || die('needs --api')), token)
const desk = makeClient(String(args.desk || 'http://diiii.localhost/light'), null)
const doc = await client.get(`/api/projects/${args.project}/document`); if (!doc.ok) die(`reading ${args.project}: ${doc.status}`)
const looks = rigLooksOf(doc.body.document.entities); if (!looks) die('no designed looks')
const rig = await desk.get(`/api/rig?project=${encodeURIComponent(String(args['rig-project'] || die('needs --rig-project')))}`)
const fixtures = rig.body.fixtures || []; if (!fixtures.length) die('the desk has no patch for --rig-project (0 fixtures): refusing, the looks would carry no values')
const only = args.only ? new Set(String(args.only).split(',')) : null
const set = deskLooksWithValues(looks, fixtures, { entities: withFixtureOverlay(doc.body.document.entities, args['fixture-overlay'] ? String(args['fixture-overlay']) : null), library: libraryWithShow(loadLibrary(), doc.body.document.entities) })
  .filter((l) => (!only || only.has(l.id)) && !/black$/.test(l.id))
const force = args.force ? String(args.force).match(/^(.+):(\w+)=(\d+)$/) : null
if (args.force && !force) die('--force wants <profile regex>:<role>=<value>')
const forced = force ? fixtures.filter((f) => new RegExp(force[1]).test(f.profile)).map((f) => f.id) : []
for (const look of set) {
  for (const id of forced) { const v = look.steps?.[0]?.values?.[id]; if (v && v.dimmer) v[force[2]] = Number(force[3]) }
  const n = Object.keys(look.steps?.[0]?.values || {}).length
  if (!n) die(`${look.id}: no values — refusing`)
  if (args['dry-run']) { say(`would add ${look.id} ${look.name} (${n} values)`); continue }
  const r = await desk.post('/api/looks/add', { look }); if (!r.ok) die(`adding ${look.id}: ${r.status}`)
  say(`added ${look.id} ${look.name} (${n} values)`)
}
