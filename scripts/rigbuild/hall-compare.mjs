#!/usr/bin/env node
/**
 * hall-compare.mjs — before any lamp check, hold the 3D and the desk against the hall's reference.
 *
 * Owner 2026-10-17 19:2x, after setting every lamp's place and address in the Plot: "this is final … remember, so before a
 * check, run what can compare with the real one". The reference is a file written from the project the owner called final
 * (one lamp a row: id, type, universe, address, position, rotation). This tool reads it and says, lamp by lamp, where the
 * project's document (the 3D) and the light desk's patch (the wire) differ from it. It writes nothing.
 *
 *   node scripts/rigbuild/hall-compare.mjs --ref <reference.json> --project <id>
 *        [--api http://diiii.localhost/serverXR] [--desk http://diiii.localhost/light] [--token-file ~/.di/di.env]
 *        [--tolerance 0.15]   metres a lamp may sit from its reference place
 *
 * Exit 0 = the 3D and the desk equal the reference; 1 = differences (listed); 2 = could not read something.
 * Checks: DMX lamps only (a network laser, fixture.dmx === false, has no address). Per lamp: present, type, universe,
 * address, place within the tolerance. The desk: every reference address patched once with the same type, nothing else
 * patched on top of it (two projects patched at one address = two senders), nothing extra.
 */
import fs from 'node:fs'

const args = Object.fromEntries(process.argv.slice(2).reduce((out, a, i, all) => {
    if (a.startsWith('--')) out.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true])
    return out
}, []))
if (!args.ref || !args.project) {
    console.log('usage: node scripts/rigbuild/hall-compare.mjs --ref <reference.json> --project <id> [--api …] [--desk …] [--token-file …] [--tolerance 0.15]')
    process.exit(2)
}
const api = String(args.api || 'http://diiii.localhost/serverXR')
const desk = String(args.desk || 'http://diiii.localhost/light')
const tol = Number(args.tolerance || 0.15)
const tokenFile = String(args['token-file'] || `${process.env.HOME}/.di/di.env`)
const token = (fs.readFileSync(tokenFile, 'utf8').match(/^ADMIN_API_TOKEN=(.*)$/m) || [])[1]?.trim()
const die = (m) => { console.log(`hall-compare: ${m}`); process.exit(2) }
const get = async (url, auth) => {
    const r = await fetch(url, { headers: auth && token ? { authorization: `Bearer ${token}` } : {} })
    if (!r.ok) die(`${url}: ${r.status}`)
    return r.json()
}

const ref = JSON.parse(fs.readFileSync(String(args.ref), 'utf8'))
const dmx = (l) => l && l.dmx !== false && l.type
const refLamps = (ref.lamps || []).filter(dmx)
const docBody = await get(`${api}/api/projects/${encodeURIComponent(args.project)}/document`, true)
const doc = docBody.document || docBody
const docLamps = new Map()
for (const e of doc.entities || []) {
    const f = e?.components?.fixture
    if (!f || f.dmx === false || !f.type) continue
    docLamps.set(e.id, { id: e.id, type: f.type, universe: f.universe, address: f.address, position: e.components.transform?.position || [] })
}
const rig = await get(`${desk}/api/rig`, false)
const deskFx = rig.fixtures || []

const diffs = []
const say = (where, text) => diffs.push(`${where.padEnd(5)} ${text}`)
const at = (l) => `U${l.universe}.${l.address}`
const dist = (a = [], b = []) => Math.hypot((a[0] ?? 0) - (b[0] ?? 0), (a[1] ?? 0) - (b[1] ?? 0), (a[2] ?? 0) - (b[2] ?? 0))

// The 3D (the project's document) against the reference
for (const r of refLamps) {
    const d = docLamps.get(r.id)
    if (!d) { say('3D', `${r.id} ${r.type} ${at(r)}: in the hall, missing in the 3D`); continue }
    if (d.type !== r.type) say('3D', `${r.id}: type ${d.type}, the hall has ${r.type}`)
    if (d.universe !== r.universe || d.address !== r.address) say('3D', `${r.id}: address ${at(d)}, the hall has ${at(r)}`)
    const m = dist(d.position, r.position)
    if (m > tol) say('3D', `${r.id} ${at(r)}: ${m.toFixed(2)} m from its place in the hall`)
}
const refIds = new Set(refLamps.map((r) => r.id))
for (const d of docLamps.values()) if (!refIds.has(d.id)) say('3D', `${d.id} ${d.type} ${at(d)}: in the 3D, not in the hall`)

// The desk (the wire) against the reference: the desk's own universe numbers are 1-based in /api/rig
const kind = (f) => String(f.profile || f.code || '').split(/\s+/)[0].toLowerCase()
const byAddr = new Map()
for (const f of deskFx) {
    const k = `${f.universe}.${f.address}`
    byAddr.set(k, [...(byAddr.get(k) || []), f])
}
for (const r of refLamps) {
    const here = byAddr.get(`${r.universe}.${r.address}`) || []
    if (!here.length) { say('desk', `${at(r)} ${r.type} (${r.id}): in the hall, not patched on the desk`); continue }
    if (here.length > 1) say('desk', `${at(r)}: patched ${here.length} times (${here.map((f) => f.key || f.id).join(', ')}) — two senders`)
    if (!here.some((f) => kind(f) === String(r.type).toLowerCase())) say('desk', `${at(r)}: the desk has ${here.map(kind).join('/')}, the hall has ${r.type}`)
}
const refAddr = new Set(refLamps.map((r) => `${r.universe}.${r.address}`))
for (const [k, fs_] of byAddr) if (!refAddr.has(k)) say('desk', `U${k} ${fs_.map((f) => f.name || f.key).join(', ')}: patched on the desk, not in the hall`)

const count = (list) => list.reduce((o, l) => ({ ...o, [l.type]: (o[l.type] || 0) + 1 }), {})
console.log(`reference ${String(args.ref).split('/').pop()}: ${refLamps.length} DMX lamps ${JSON.stringify(count(refLamps))}`)
console.log(`3D ${args.project} v${docBody.version}: ${docLamps.size} DMX lamps · desk: ${deskFx.length} patched`)
if (!diffs.length) { console.log('EQUAL: the 3D and the desk match the hall reference, lamp by lamp'); process.exit(0) }
console.log(`DIFFERENT: ${diffs.length}`)
for (const line of diffs) console.log(`  ${line}`)
process.exit(1)
