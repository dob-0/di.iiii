#!/usr/bin/env node
// light_env_haze.mjs — what haze field a project document builds: machines found, the far-field fill, the near blob, fill/scattering ratio.
// Read-only, uses the repo's own hazeField.js. Venue-to-show skill: step 8 (env picker — air). Moved from the MOXIR light-environment audit
// (haze.mjs, 2026-10-15, ledger N811.8).   node scripts/place/light_env_haze.mjs DOC.json [DOC.json ...]
import { readFileSync } from 'node:fs'
import { register } from 'node:module'
if (!process.argv[2] || process.argv[2] === '-h' || process.argv[2] === '--help') { console.log('usage: node scripts/place/light_env_haze.mjs DOC.json [DOC.json ...]   (a project document, or {"document": {...}})'); process.exit(process.argv[2] ? 0 : 2) }
// the rig type library imports .json files: give them the import attribute
register('data:text/javascript,' + encodeURIComponent("export async function load(u,c,n){return u.endsWith('.json')?n(u,{...c,importAttributes:{type:'json'}}):n(u,c)}"))
const R=new URL('../../src/', import.meta.url).pathname
const { buildHazeField, hazeSettingsOf, hazeMachinesOf } = await import(R+'objectComponents/hazeField.js')
const { TYPE_LIBRARY } = await import(R+'rigbuild/types/index.js')
const { libraryWithShow } = await import(R+'rigbuild/rental.js')
const { typeById } = await import(R+'rigbuild/fixtureTypes.js')
for (const f of process.argv.slice(2)) {
  let d = JSON.parse(readFileSync(f, 'utf8')); d = d.document || d
  const ents = Array.isArray(d.entities) ? d.entities : Object.values(d.entities)
  let lib = TYPE_LIBRARY; try { lib = libraryWithShow(TYPE_LIBRARY, ents) || TYPE_LIBRARY } catch {}
  const at = d.renderSettings?.atmosphere
  const m = hazeMachinesOf(ents, (id) => typeById(lib, id))
  const field = buildHazeField(hazeSettingsOf(at), m)
  const z = field?.zones?.[0] || field?.blobs?.[0]
  console.log(f.replace('.json',''), 'scat', at?.scattering, 'machines', m.length, 'fill(far)', field ? field.fill?.toExponential(3) : 'NO FIELD (uniform scattering)', 'blob/near', z ? JSON.stringify({near:z.near,far:z.far,sigma:z.blobSigma??z.sigma,r:z.radius_m??z.radius}) : '', 'ratio fill/scat', field && at?.scattering ? (field.fill/at.scattering).toFixed(3) : '')
}
