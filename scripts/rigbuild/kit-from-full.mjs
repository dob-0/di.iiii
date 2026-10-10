#!/usr/bin/env node
/**
 * kit-from-full.mjs — turn a COPY of Known · full into Known · kit on a scratch stack, as ops (2026-10-09).
 *
 * The owner, 2026-10-09: the show uses only what ran at Sevan — 50 UP-PL5403, 18 UP-B380F, the 6 LaserCube
 * Ultra MK2 and ONE UP-YZ31P smoke machine (no hazers). The kit's rig file (rigs/moxir-2026-10-17-known-kit.json,
 * versions.mjs) is known-full's hang with that kit; a live known-full document also carries the desk patch,
 * the looks and the cue list, which load-version.mjs would rebuild. This script keeps all of that and changes
 * only what the kit and the light physics change:
 *   - every hazer, and every smoke machine but the first (rig-smoke-01, where it stands), is deleted;
 *   - every lamp: light.distance 0 (no cutoff), its old distance kept as the drawn beam's length (beam.length);
 *   - every LaserCube: beam.laser from the kit rig (its diodes, 4 mm, 1 mrad, the exposure scale), beam-only;
 *   - renderSettings.atmosphere: the kit rig's (the two-zone haze of one machine, calibrate false).
 *
 *   node scripts/rigbuild/kit-from-full.mjs --api http://127.0.0.1:<scratch>/serverXR --project moxir-hall-known-kit \
 *       --token-file <dummy env> [--dry-run]
 *
 * First make the copy (copy-version.mjs … --from moxir-hall-known-full --to moxir-hall-known-kit). Scratch only:
 * refuses any host but localhost / 127.0.0.1. Reads the document right before writing and sends against its
 * version. Undo: delete the copy (copy-version.mjs --undo --to moxir-hall-known-kit).
 */
import path from 'node:path'
import fs from 'node:fs'

import { parseArgs, die, say, REPO_ROOT } from '../place/common.mjs'
import { makeClient, readToken } from '../place/api.mjs'
import { atmosphereOfRig, buildRig } from '../place/rig-lib.mjs'
import { readGeometry } from '../place/fixtures-glb.mjs'
import { isMainModule } from '../lib/isMainModule.mjs'

export const KIT_RIG = 'scripts/place/rigs/moxir-2026-10-17-known-kit.json'
const LASER_TYPE = 'ext-lc-ultra-mk2'

/** The ops that make a known-full document the kit. Pure. `laser` = the kit build's beam.laser. */
export const kitOps = (doc, { atmosphere, laser }) => {
    const ops = []
    const entities = doc?.entities || []
    const typeOf = (e) => e?.components?.fixture?.type
    const machines = entities.filter((e) => typeOf(e) === 'ext-hazer' || typeOf(e) === 'up-yz31p')
    const keep = machines.filter((e) => typeOf(e) === 'up-yz31p').sort((a, b) => a.id.localeCompare(b.id))[0]
    for (const e of machines) if (e !== keep) ops.push({ type: 'deleteEntity', payload: { entityId: e.id } })
    for (const e of entities) {
        if (e.type !== 'spotLight') continue
        const light = e.components?.light || {}
        const beam = e.components?.beam
        const was = Number(light.distance) || 0
        if (was > 0) ops.push({ type: 'updateComponent', payload: { entityId: e.id, component: 'light', patch: { distance: 0 } } })
        if (!beam) continue
        const patch = {}
        if (!(Number(beam.length) > 0) && was > 0) patch.length = was
        if (typeOf(e) === LASER_TYPE) Object.assign(patch, { laser, only: true })
        if (Object.keys(patch).length) ops.push({ type: 'updateComponent', payload: { entityId: e.id, component: 'beam', patch } })
    }
    ops.push({ type: 'setRenderSettings', payload: { patch: { atmosphere } } })
    return { ops, kept: keep?.id || null, deleted: machines.filter((e) => e !== keep).map((e) => e.id) }
}

/** The kit's atmosphere and laser descriptor, from its rig file. */
export const kitFromRig = () => {
    const read = (f) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, f), 'utf8'))
    const rig = read(KIT_RIG)
    const hall = read(rig.hall)
    const manifest = read('scripts/place/fixtures/fixtures.json')
    const geometry = Object.fromEntries(Object.keys(manifest.kinds).map((k) => [k, readGeometry(k)]))
    const built = buildRig(rig, hall, { geometry, manifest })
    const laser = built.entities.find((e) => e.components?.beam?.laser)?.components.beam.laser
    if (!laser) throw new Error(`${KIT_RIG}: no laser line in the built rig`)
    return { atmosphere: atmosphereOfRig(rig.atmosphere), laser }
}

const LOCAL = /^(localhost|127\.0\.0\.1)$/

const main = async () => {
    const args = parseArgs()
    const api = String(args.api || die('needs --api <…/serverXR>')).replace(/\/+$/, '')
    if (!LOCAL.test(new URL(api).hostname)) die(`refusing ${new URL(api).hostname}: scratch stacks only`)
    const project = String(args.project || die('needs --project'))
    const client = makeClient(api, readToken(args['token-file'] ? String(args['token-file']) : null))
    const got = await client.get(`/api/projects/${project}/document`)
    if (!got.ok) die(`reading ${project}: ${got.status}`)
    const { ops, kept, deleted } = kitOps(got.body.document, kitFromRig())
    say(`${project}: ${ops.length} ops — keeps ${kept}, deletes ${deleted.length} machines (${deleted.join(', ')})`)
    if (args['dry-run']) return
    const stamp = `kit-from-full-${Date.now()}`
    const out = await client.post(`/api/projects/${project}/ops`, { baseVersion: got.body.version, ops: ops.map((op, i) => ({ ...op, opId: `${stamp}-${i}`, clientId: 'kit-from-full' })) })
    if (!out.ok) die(`writing: ${out.status} ${out.text.slice(0, 300)}`)
    say(`written: version ${out.body.newVersion}`)
}

if (isMainModule(import.meta.url)) main().catch((e) => die(String(e?.stack || e)))
