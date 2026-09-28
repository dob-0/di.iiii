#!/usr/bin/env node
/**
 * rig.mjs — hang a proposed lighting rig in a hall on di.iiii.
 *
 * Reads a rig file (scripts/place/rigs/*.json: fixture classes, groups, where
 * each group hangs and what it is aimed at, the real-light budget) and the
 * hall.json that hall.py wrote, works out every lamp (rig-lib.mjs), and writes
 * them into the hall's project as ops — the same op log every editing surface
 * replays, so what this writes is what the Studio shows and what can be
 * re-aimed there by hand.
 *
 * Re-runnable: every entity it makes has an id starting `rig-`, and each run
 * first deletes the `rig-` entities already there. Nothing else in the project
 * is touched, except the night (ambient, fog, background) and the shadow
 * switch, which a rig needs.
 *
 * Usage:
 *   node scripts/place/rig.mjs --rig scripts/place/rigs/moxir-2026-10-17.json \
 *       --hall <work>/hall.json --project moxir-hall [options]
 *
 *   --api <base>          di.iiii API (default https://local.thedi.studio/serverXR)
 *   --real budget|all|none  which lamps are real lights (default: the rig's budget)
 *   --shadows on|off      override the rig's shadow switch
 *   --beams auto|entities|baked  how the beam-only lamps are written (default auto:
 *                         entities where the server keeps beam.only, else baked
 *                         into one mesh — see beams-glb.mjs)
 *   --look <name>         a named look from the rig file's `looks` (default: its defaultLook);
 *                         `--look list` prints them and sends nothing
 *   --fixtures <dir>      the built fixture models (default scripts/place/fixtures/glb)
 *   --remove              only take the rig down (delete every rig- entity)
 *   --out <file>          also write the entities and the summary to a file
 *   --bodies-out <file>   also write the posed fixture bodies GLB to a file
 *   --dry-run             print the summary, send nothing
 *   --token-file <path>   where the API token is (see api.mjs)
 */
import fs from 'node:fs'
import path from 'node:path'

import { parseArgs, say, warn, die, readJson, writeJson } from './common.mjs'
import { DEFAULT_API, makeClient, readToken } from './api.mjs'
import { RIG_PREFIX, SHADOW_SAFE_REAL_LIGHTS, buildRig, nightOps } from './rig-lib.mjs'
import { beamsGlb } from './beams-glb.mjs'
import { FIXTURE_DIR, fixturesGlb, readGeometry } from './fixtures-glb.mjs'

const args = parseArgs()

const must = (result, what) => {
    if (!result.ok) die(`${what} failed — HTTP ${result.status}`, result.text.slice(0, 300))
    return result.body
}

const send = async (client, project, ops, what) => {
    const current = must(await client.get(`/api/projects/${project}/document`), 'reading the hall')
    return must(await client.post(`/api/projects/${project}/ops`, {
        baseVersion: Number(current.version) || 0,
        ops
    }), what)
}

/**
 * Does this server keep `beam.only`? Written on a probe lamp, read back, and
 * the probe deleted again. A server built before 2026-09-27 normalises the
 * field away, and a rig written there as entities would be ALL real lights.
 */
const serverKeepsBeamOnly = async (client, project) => {
    const id = `${RIG_PREFIX}probe-beam-only`
    await send(client, project, [{
        type: 'createEntity',
        payload: { entity: { id, type: 'spotLight', name: 'probe', components: { light: { intensity: 0 }, beam: { visible: true, haze: 0, only: true }, animation: { mode: 'static' } } } }
    }], 'probing the server')
    const doc = must(await client.get(`/api/projects/${project}/document`), 'reading the probe back')
    const kept = (doc.document?.entities || []).some((entity) => entity.id === id && entity.components?.beam?.only === true)
    await send(client, project, [{ type: 'deleteEntity', payload: { entityId: id } }], 'removing the probe')
    return kept
}

const uploadGlb = async (client, project, bytes, name) => {
    const form = new FormData()
    form.append('asset', new Blob([bytes], { type: 'model/gltf-binary' }), name)
    const asset = must(await client.post(`/api/projects/${project}/assets`, form), `uploading ${name}`).asset
    return {
        id: asset.id, name: asset.name || name, mimeType: asset.mimeType || 'model/gltf-binary',
        size: asset.size || bytes.length, url: asset.url, source: 'server', createdAt: Date.now()
    }
}

const main = async () => {
    const project = args.project ? String(args.project) : null
    if (!project) die('rig.mjs needs --project <hall project id> (e.g. moxir-hall).')
    const api = String(args.api || DEFAULT_API).replace(/\/$/, '')
    const token = readToken(args['token-file'] ? String(args['token-file']) : null)
    const beamsWanted = String(args.beams || 'auto')
    if (!['auto', 'entities', 'baked'].includes(beamsWanted)) die('--beams is auto, entities or baked.')

    let built = null
    let rig = null
    if (!args.remove) {
        if (!args.rig || !args.hall) die('rig.mjs needs --rig <rig.json> and --hall <hall.json>.')
        rig = readJson(path.resolve(String(args.rig)))
        const hall = readJson(path.resolve(String(args.hall)))
        if (!rig) die(`Could not read the rig file ${args.rig}.`)
        if (!hall?.geometry) die(`${args.hall} is not a hall.json from hall.py (no geometry).`)
        const mode = String(args.real || 'budget')
        if (!['budget', 'all', 'none'].includes(mode)) die('--real is budget, all or none.')
        if (args.look === 'list') {
            for (const [id, look] of Object.entries(rig.looks || {})) say(`${id === rig.defaultLook ? '*' : ' '} ${id.padEnd(16)} ${look.title} — ${look.intent}`)
            return
        }
        const fixtureDir = path.resolve(String(args.fixtures || path.join(FIXTURE_DIR, 'glb')))
        const manifest = readJson(path.join(FIXTURE_DIR, 'fixtures.json'))
        const kinds = new Set([...Object.values(rig.classes).map((c) => c.fixture), ...(rig.effects || []).map((f) => f.fixture)])
        const geometry = Object.fromEntries([...kinds].map((k) => [k, readGeometry(k, fixtureDir)]))
        built = buildRig(rig, hall, { mode, look: args.look ? String(args.look) : undefined, geometry, manifest })
        built.fixtureDir = fixtureDir
        const s = built.summary
        say(`${rig.rig}`)
        say(`  look: ${s.look || '(none — each group\'s own aim)'}${s.look ? ` — ${rig.looks[s.look].title}` : ''}`)
        say(`  ${s.fixtures} lamps: ${s.real} real lights, ${s.beamOnly} beam only · mode ${mode}`)
        for (const [id, g] of Object.entries(s.byGroup)) say(`    ${id.padEnd(16)} ${g.code.padEnd(10)} ${String(g.placed).padStart(3)} placed, ${g.real} real`)
        say(`  effects (machines, not simulated): ${Object.entries(s.effects).map(([k, v]) => `${k} ${v}`).join(', ')}`)
        say(`  stage: ${rig.stage.end} end, front edge at z ${built.stage.front.toFixed(1)} m (ASSUMED position)`)
        if (hall.warning) warn(`  the hall: ${hall.warning}`)
        for (const why of s.refused) warn(`  REFUSED ${why}`)
        for (const why of s.clashes) warn(`  clash: ${why}`)
        for (const why of s.unreachable) warn(`  out of travel: ${why}`)
        if (args.out) {
            writeJson(path.resolve(String(args.out)), {
                tool: 'scripts/place/rig.mjs', createdAt: new Date().toISOString(), rig: args.rig, hall: args.hall,
                mode, look: s.look, summary: s, entities: built.entities,
                fixtures: built.fixtures.map(({ kind, id, pan, tilt, colour }) => ({ id, kind, pan, tilt, colour }))
            })
        }
        if (args['bodies-out']) {
            const file = path.resolve(String(args['bodies-out']))
            fs.writeFileSync(file, await fixturesGlb(built.fixtures, { dir: built.fixtureDir }))
            say(`  fixture bodies written to ${file}`)
        }
    }
    if (args['dry-run']) {
        say(`[dry run] would replace the ${RIG_PREFIX}* entities in ${project} on ${api}${built ? ` with ${built.entities.length}` : ''}.`)
        return
    }
    if (!token) die('No API token found, so nothing was sent.', 'Set DI_API_TOKEN or pass --token-file.')
    const client = makeClient(api, token)

    let entities = []
    let ops = []
    if (built) {
        const s = built.summary
        let beams = beamsWanted
        if (beams === 'auto') {
            beams = (await serverKeepsBeamOnly(client, project)) ? 'entities' : 'baked'
            if (beams === 'baked') {
                warn('  this server predates beam.only: the beam-only lamps are BAKED into one mesh (a workaround —')
                warn('  they cannot be re-aimed in the Studio; update the install and re-run for editable lamps)')
            }
        }
        entities = built.entities
        if (beams === 'baked') {
            const onlyLamps = entities.filter((entity) => entity.type === 'spotLight' && entity.components.beam?.only)
            entities = entities.filter((entity) => !onlyLamps.includes(entity))
            const bytes = await beamsGlb(onlyLamps)
            const asset = await uploadGlb(client, project, bytes, 'rig-beams.glb')
            ops.push({ type: 'upsertAsset', payload: { asset } })
            entities = [...entities, {
                id: `${RIG_PREFIX}beams`,
                type: 'model',
                name: `${onlyLamps.length} beams, baked (no light) — re-run rig.mjs to change`,
                components: {
                    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
                    media: { assetId: asset.id, playAnimations: false },
                    animation: { mode: 'static', speed: 1, amplitude: 1 }
                }
            }]
            say(`  baked ${onlyLamps.length} beams into one mesh (${(bytes.length / 1024).toFixed(0)} KB)`)
        }
        const shadows = args.shadows === undefined ? undefined : String(args.shadows) !== 'off'
        if (s.real > SHADOW_SAFE_REAL_LIGHTS && (shadows ?? rig.budget?.shadowCasting)) {
            warn(`  ${s.real} real lamps is more than ${SHADOW_SAFE_REAL_LIGHTS}: shadows stay OFF (texture-unit ceiling)`)
        }
        // The fixture bodies: every part of every kind one instanced node, in
        // one GLB (fixtures-glb.mjs), posed to this look's aims.
        const bodies = await fixturesGlb(built.fixtures, { dir: built.fixtureDir })
        const bodiesAsset = await uploadGlb(client, project, bodies, 'rig-fixtures.glb')
        ops.push({ type: 'upsertAsset', payload: { asset: bodiesAsset } })
        entities = [...entities, {
            id: `${RIG_PREFIX}fixtures`,
            type: 'model',
            name: `${built.fixtures.length} fixtures (${s.look || 'no look'}) — posed by rig.mjs; re-run it to re-aim`,
            components: {
                transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
                media: { assetId: bodiesAsset.id, playAnimations: false },
                animation: { mode: 'static', speed: 1, amplitude: 1 }
            }
        }]
        say(`  fixture bodies: ${built.fixtures.length} in one instanced GLB (${(bodies.length / 1024).toFixed(0)} KB)`)
        ops = [...ops, ...entities.map((entity) => ({ type: 'createEntity', payload: { entity } })), ...nightOps(rig, { shadows, realLights: s.real })]
        say(`  real lights in the room: ${s.real} · beams: ${beams}`)
    }

    const current = must(await client.get(`/api/projects/${project}/document`), 'reading the hall')
    const old = (current.document?.entities || []).filter((entity) => entity.id.startsWith(RIG_PREFIX))
    // The old baked beams' file goes out of the document with its entity.
    const oldAssets = old.map((entity) => entity.components?.media?.assetId).filter(Boolean)
    const all = [
        ...old.map((entity) => ({ type: 'deleteEntity', payload: { entityId: entity.id } })),
        ...oldAssets.map((assetId) => ({ type: 'deleteAsset', payload: { assetId } })),
        ...ops
    ]
    if (!all.length) {
        say('Nothing to do.')
        return
    }
    const result = must(await client.post(`/api/projects/${project}/ops`, {
        baseVersion: Number(current.version) || 0,
        ops: all
    }), `writing ${all.length} changes to ${project}`)
    say(`  took down ${old.length}, hung ${entities.length} (document version ${result.version ?? '?'})`)

    // Belt and braces: whatever was chosen, count the real lights the server
    // will actually render, and refuse to leave shadows on past the ceiling —
    // 90 shadow-casting lamps need 90 shadow samplers, WebGL gives 16-32, and
    // every lit material then fails to compile: the ROOM goes black (seen
    // 2026-09-27 on the installed 0.4.16).
    const after = must(await client.get(`/api/projects/${project}/document`), 'reading the rig back')
    const real = (after.document?.entities || []).filter((entity) => entity.type === 'spotLight' && !(entity.components?.beam?.visible && entity.components?.beam?.only)).length
    say(`  the server renders ${real} real spot lights`)
    if (real > SHADOW_SAFE_REAL_LIGHTS && after.document?.renderSettings?.shadowCasting?.enabled) {
        await send(client, project, [{ type: 'setRenderSettings', payload: { patch: { shadowCasting: { enabled: false } } } }], 'switching shadows off')
        warn(`  ${real} real lights: shadows switched OFF, or every lit surface fails to compile.`)
    }
}

if (process.argv[1] && process.argv[1].endsWith('rig.mjs')) await main()
