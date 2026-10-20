#!/usr/bin/env node
// mirror-cut.mjs — flip "the cut" in an EXISTING version's project, and change nothing else.
//
// Owner, 2026-10-07, after a rebuild came back on another hall: "you just need to flip the truss,
// nothing to change — why did the crane place change?". So the flip is done on the project as it
// is: every entity that belongs to the cut (the 4 truss pieces, what hangs on or stands on it, the
// picks, bridles, hoists, chains, safety steels and the two tie-offs) is mirrored about the DJ's
// axis (the plane x = 0); the hall, the crane, the floor, every other lamp, the looks, the patch
// and the picture stay exactly as they are.
//
// Mirror about x = 0: position (x, y, z) → (−x, y, z); an XYZ Euler rotation (a, b, c) → (a, −b, −c)
// (M·R·M with M = diag(−1, 1, 1) — rotations about X keep their sign, about Y and Z flip). The
// shapes here (box truss, PAR, LaserCube, chain, strap) are symmetric, so no geometry is mirrored.
// Names that say a side or a u are rewritten to stay true (house-left ↔ house-right, u → −u).
//
//   node scripts/rigbuild/mirror-cut.mjs --api <serverXR> --project <id> [--token-file f] [--apply]
//   Dry run by default: prints what moves. --apply writes the document (whole PUT: for a scratch or
//   a non-followed install only — a followed space needs ops, owed) after saving the old one beside it.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// what belongs to the cut, by the names rig-lib gives them (scripts/place/rig-lib.mjs)
export const CUT_PREFIXES = [
    'truss line', 'Beam clamp, pick', 'Bridle leg, pick', 'Chain hoist', 'Hoist chain', 'Safety steel',
    'Tie-off', 'UP-PL5403 par-cut-', 'EXT-LC-ULTRA-MK2 lasercube-cut', 'UP-LA40WF'
]
export const isCut = (e) => CUT_PREFIXES.some((p) => String(e.name || '').startsWith(p))

const SWAP = { 'house-left': 'house-right', 'house-right': 'house-left', hl: 'hr', hr: 'hl', 'x +11.6': 'x −11.6', 'x −11.6': 'x +11.6', 'x -11.6': 'x +11.6' }
const swapSides = (s) => s
    .replace(/house-left|house-right|\bhl\b|\bhr\b|x \+11\.6|x [−-]11\.6/g, (m) => SWAP[m])
    .replace(/\(u ([−-])?(\d+(?:\.\d+)?)/g, (_, neg, n) => `(u ${neg ? '' : '−'}${n}`)

/** Mirror one entity about x = 0 (pure; returns a new object). */
export const mirrorEntity = (e) => {
    const out = JSON.parse(JSON.stringify(e))
    const t = out.components?.transform
    if (t?.position) t.position = [-t.position[0], t.position[1], t.position[2]]
    if (t?.rotation) t.rotation = [t.rotation[0], -t.rotation[1], -t.rotation[2]]
    if (out.name) out.name = swapSides(out.name)
    return out
}

/** The document with the cut mirrored, and the list of what moved (pure). */
export const mirrorCut = (doc) => {
    const list = Array.isArray(doc.entities) ? doc.entities : Object.values(doc.entities || {})
    const moved = []
    const entities = list.map((e) => {
        if (!isCut(e)) return e
        const m = mirrorEntity(e)
        moved.push({ id: e.id, from: e.name, to: m.name, x: [e.components?.transform?.position?.[0], m.components?.transform?.position?.[0]] })
        return m
    })
    const next = { ...doc, entities: Array.isArray(doc.entities) ? entities : Object.fromEntries(entities.map((e) => [e.id, e])) }
    return { doc: next, moved }
}

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined }

const main = async () => {
    const api = arg('api'); const project = arg('project')
    if (!api || !project) throw new Error('--api and --project are required')
    const tokenFile = arg('token-file')
    const token = tokenFile ? (fs.readFileSync(tokenFile, 'utf8').match(/^(?:LIVE_)?API_TOKEN=(.*)$/m)?.[1] || '').replace(/^['"]|['"]$/g, '') : ''
    const headers = { 'User-Agent': 'di-mirror-cut', 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
    const res = await fetch(`${api}/api/projects/${project}/document`, { headers })
    if (!res.ok) throw new Error(`GET document → ${res.status}`)
    const body = await res.json()
    const doc = body.document || body
    const { doc: next, moved } = mirrorCut(doc)
    for (const m of moved) console.log(`  x ${m.x[0]} → ${m.x[1]}  ${m.to.slice(0, 90)}`)
    console.log(`${moved.length} entities of the cut mirrored; ${(Array.isArray(doc.entities) ? doc.entities : Object.values(doc.entities)).length - moved.length} untouched`)
    if (!process.argv.includes('--apply')) { console.log('(dry run — nothing written)'); return }
    const backup = path.join(process.cwd(), `mirror-cut-before-${project}-${Date.now()}.json`)
    fs.writeFileSync(backup, JSON.stringify(doc))
    console.log(`old document saved: ${backup}`)
    const put = await fetch(`${api}/api/projects/${project}/document`, { method: 'PUT', headers, body: JSON.stringify(next) })
    if (!put.ok) throw new Error(`PUT document → ${put.status} ${(await put.text()).slice(0, 200)}`)
    const back = await (await fetch(`${api}/api/projects/${project}/document`, { headers })).json()
    const { moved: again } = mirrorCut(mirrorCut(back.document || back).doc)
    console.log(`written and read back (${again.length} cut entities found again)`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((e) => { console.error(e.message); process.exit(1) })
}
