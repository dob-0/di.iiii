#!/usr/bin/env node
/**
 * looks.mjs — the rig file's designed looks, as view C's `components.rigLooks`.
 * docs/architecture/RIG_BUILD.md §11.4.
 *
 *   node scripts/rigbuild/looks.mjs --rig <rigs/moxir-2026-10-17.json> \
 *     [--api http://localhost:4383/serverXR --project moxir-hall --token-file serverXR/.env.local]
 *
 * A rig file's look names a rule per GROUP (rig.groups: a fixture class on a mount).
 * The cards know lamps by POSITION and TYPE, so each group is renamed to the position
 * its mount rule becomes (src/rigbuild/positions.js) and its class's rental code:
 * "beam380-columns" (class beam380, mount column-bases) → "column-bases/up-b380f".
 * A mount with no position, or two groups landing on one key, is refused, never guessed.
 */
import fs from 'node:fs'
import path from 'node:path'

import { parseArgs, die, say, readJson } from '../place/common.mjs'
import { makeClient } from '../place/api.mjs'
import { normalizeRigLooks } from '../../src/shared/projectSchema.js'
import { RIG_SHOW_ID } from '../../src/rigbuild/rental.js'

// The rig script's mount rules (scripts/place/rig-lib.mjs `place`) → view C's positions.
export const MOUNT_POSITION = {
    'truss-header': () => 'truss',
    'tower-ladder': () => 'tower-ladders',
    'truss-towers': () => 'tower-tops',
    'booth-back': (g) => (g.dx_m ? 'stage-flanks' : 'stage-back'),
    'booth-pit': () => 'pit',
    'column-bases': () => 'column-bases',
    'column-uplight': (g) => (g.columns?.rows === 'next' ? 'outer-columns' : 'column-faces'),
    'backdrop-floor': () => 'backdrop',
    'nave-columns': () => 'dance-columns'
}

const typeIdOf = (code) => String(code || '').trim().toLowerCase().replace(/\s+/g, '-')

/** The group → `${position}/${type}` table for a rig file. Pure. */
export const groupKeys = (rig) => {
    const keys = new Map()
    const seen = new Map()
    for (const g of rig.groups || []) {
        const where = MOUNT_POSITION[g.mount]
        if (!where) throw new Error(`group ${g.id}: mount "${g.mount}" has no position in view C (MOUNT_POSITION)`)
        const code = rig.classes?.[g.class]?.code
        if (!code) throw new Error(`group ${g.id}: class "${g.class}" has no rental code`)
        const key = `${where(g)}/${typeIdOf(code)}`
        if (seen.has(key)) throw new Error(`groups ${seen.get(key)} and ${g.id} both land on ${key} — the look could not tell them apart`)
        seen.set(key, g.id)
        keys.set(g.id, key)
    }
    return keys
}

/** The rig file's looks as `components.rigLooks`. Pure. */
export const rigLooksFrom = (rig, file) => {
    const keys = groupKeys(rig)
    const rename = (byGroup) => Object.fromEntries(Object.entries(byGroup || {}).filter(([g]) => keys.has(g)).map(([g, v]) => [keys.get(g), v]))
    const value = {
        source: `${path.basename(file)} (${rig.rig || 'rig'}, ${rig.writtenAt || 'undated'}) · groups renamed to position/type by scripts/rigbuild/looks.mjs`,
        writtenAt: rig.writtenAt || '',
        defaultLook: rig.defaultLook || '',
        looks: Object.entries(rig.looks || {}).map(([id, l]) => ({ id, title: l.title, intent: l.intent, aims: rename(l.aims), colours: rename(l.colours) }))
    }
    const out = normalizeRigLooks(value)
    if (!out || out.looks.length !== Object.keys(rig.looks || {}).length) throw new Error('the looks did not survive the schema — see normalizeRigLooks')
    return out
}

const readTokenFile = (file) => {
    const line = fs.readFileSync(file, 'utf8').split('\n').find((l) => l.startsWith('ADMIN_API_TOKEN='))
    return line ? line.slice('ADMIN_API_TOKEN='.length).trim() : null
}

const main = async () => {
    const file = path.resolve(String(args.rig || die('needs --rig <rig file>')))
    const looks = rigLooksFrom(readJson(file), file)
    for (const l of looks.looks) say(`  ${l.id.padEnd(16)} ${Object.keys(l.aims).length} groups aimed · ${l.title}`)
    if (!args.api) return
    const api = String(args.api).replace(/\/+$/, '')
    const projectId = String(args.project || die('needs --project <id> with --api'))
    const token = readTokenFile(path.resolve(String(args['token-file'] || die('needs --token-file'))))
    if (!token) die('no ADMIN_API_TOKEN in the token file')
    const client = makeClient(api, token)
    const got = await client.get(`/api/projects/${projectId}/document`)
    if (!got.ok) die(`reading ${projectId}: ${got.status}`)
    const hasShow = (got.body.document?.entities || []).some((e) => e.id === RIG_SHOW_ID)
    const op = hasShow
        ? { type: 'updateComponent', payload: { entityId: RIG_SHOW_ID, component: 'rigLooks', patch: looks } }
        : { type: 'createEntity', payload: { entity: { id: RIG_SHOW_ID, type: 'group', name: 'the show — rental list, looks', components: { transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }, rigLooks: looks } } } }
    const out = await client.post(`/api/projects/${projectId}/ops`, { baseVersion: got.body.version, ops: [{ ...op, opId: `looks-${Date.now()}`, clientId: 'looks' }] })
    if (!out.ok) die(`ops: ${out.status} ${out.text.slice(0, 300)}`)
    say(`${projectId}: ${looks.looks.length} looks written; the project is at version ${out.body.newVersion}`)
}

const args = parseArgs()
if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
    main().catch((error) => die(error.stack || error.message))
}
