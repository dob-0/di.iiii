#!/usr/bin/env node
/**
 * stage-join.mjs: bring a built stage (lamps, solids, the show's looks and cues) INTO another project that already holds
 * the pictures (a VJ deck and its output surface), so one project is the deck, the lights, the stage and the output.
 *
 *   node scripts/rigbuild/stage-join.mjs --from-api <api> --from-project <id> --api <api> --project <id>
 *        [--token-file <env>] [--wall platina-screen] [--surface <id>] [--backup-dir <dir>] [--apply]
 *   node scripts/rigbuild/stage-join.mjs --api <api> --project <id> --undo <manifest.json> --apply
 *
 * ADDS only: every source entity the target does not have (the still `<wall>-picture` is left out: the joined wall is live),
 * every source cue the target does not have, and ONE plane `<wall>-live` 5 mm in front of the wall box showing the target's own
 * output surface (the first `network` surface, or --surface), so the wall and the output are the same picture.
 * Never touched: the target's nodes, edges, surfaces, mapping loop/epoch, render settings, existing entities and cues.
 * Without --apply it only says what it would do. With --apply it first saves the target document and a manifest of what it
 * adds into --backup-dir; `--undo <manifest>` deletes exactly those entities and cues again.
 */
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs, die, say } from '../place/common.mjs'
import { makeClient, readToken } from '../place/api.mjs'
import { isMainModule } from '../lib/isMainModule.mjs'

const GAP = 0.005
const r = (v) => Math.round(v * 1000) / 1000

/** The live wall: a plane (drawn flat by PlaneObject, 2 x 2) stood upright on the audience face of the wall box. Pure. */
export const wallPlane = ({ box, surfaceId }) => {
    const t = box.components.transform
    const [w, h, d] = t.scale
    return {
        id: `${box.id}-live`, type: 'plane', name: `${box.id}: the output picture, live`, parentId: null,
        components: {
            transform: { position: [t.position[0], r(t.position[1] + h / 2), r(t.position[2] + d / 2 + GAP)], rotation: [1.570796, 0, 0], scale: [r(w / 2), 1, r(h / 2)] },
            appearance: { color: '#000000', opacity: 1 }, primitive: { width: 2, depth: 2 }, surface: { surfaceId },
            animation: { mode: 'static', speed: 1, amplitude: 1 }
        }
    }
}

/** What the join adds. Pure: two documents in, a plan out. */
export const planJoin = ({ source, target, wall = 'platina-screen', surface = '' }) => {
    const have = new Set((target.entities || []).map((e) => e.id))
    const entities = (source.entities || []).filter((e) => !have.has(e.id) && e.id !== `${wall}-picture`)
    const haveCue = new Set((target.mappingState?.cues || []).map((c) => c.id))
    const cues = (source.mappingState?.cues || []).filter((c) => c.id && !haveCue.has(c.id))
    const surfaces = target.mappingState?.surfaces || []
    const out = surface ? surfaces.find((s) => s.id === surface) : surfaces.find((s) => s.source?.kind === 'network')
    const box = [...(target.entities || []), ...entities].find((e) => e.id === wall)
    const plane = out && box && !have.has(`${wall}-live`) ? wallPlane({ box, surfaceId: out.id }) : null
    return { entities: plane ? [...entities, plane] : entities, cues, surfaceId: out?.id || '', plane: Boolean(plane), why: !out ? 'the target has no network surface' : !box ? `no wall box ${wall}` : '' }
}

// The room's look travels with the stage (owner N3875: the joined room was white and grey): exposure, haze, room light and
// the saved views. Only keys that differ; `before` holds the target's own values for the undo (null = the key was absent).
const LOOK_KEYS = { setRenderSettings: ['renderSettings', ['toneMappingExposure', 'exposure', 'atmosphere']], setWorldState: ['worldState', ['ambientLight', 'directionalLight']], setPresentationState: ['presentationState', ['viewPresets']] }
export const lookSettings = ({ source, target }) => {
    const ops = [], before = []
    for (const [type, [part, keys]] of Object.entries(LOOK_KEYS)) {
        const patch = {}, back = {}
        for (const k of keys) {
            const a = source?.[part]?.[k], b = target?.[part]?.[k]
            if (a === undefined || JSON.stringify(a) === JSON.stringify(b)) continue
            patch[k] = a
            back[k] = b === undefined ? null : b
        }
        if (Object.keys(patch).length) { ops.push({ type, payload: { patch } }); before.push({ type, payload: { patch: back } }) }
    }
    return { ops, before }
}

export const joinOps = (plan) => [
    ...plan.entities.map((entity) => ({ type: 'createEntity', payload: { entity } })),
    ...plan.cues.map((cue) => ({ type: 'createMappingCue', payload: { cue } })),
    ...(plan.settings || [])
]
export const undoOps = (manifest) => [
    ...(manifest.entityIds || []).map((entityId) => ({ type: 'deleteEntity', payload: { entityId } })),
    ...(manifest.cueIds || []).map((cueId) => ({ type: 'deleteMappingCue', payload: { cueId } })),
    ...(manifest.settingsBefore || [])
]

const main = async () => {
    const args = parseArgs()
    const api = String(args.api || die('needs --api')).replace(/\/+$/, '')
    const project = String(args.project || die('needs --project'))
    const client = makeClient(api, readToken(args['token-file'] ? String(args['token-file']) : null))
    const read = async (c, p) => { const g = await c.get(`/api/projects/${p}/document`); if (!g.ok) die(`${p}: ${g.status}`); return g.body }
    const post = async (ops, tag) => {
        for (let i = 0; i < ops.length; i += 40) {
            const base = (await read(client, project)).version
            const out = await client.post(`/api/projects/${project}/ops`, { baseVersion: base, ops: ops.slice(i, i + 40).map((op, j) => ({ ...op, opId: `stage-join-${tag}-${Date.now()}-${i + j}`, clientId: 'stage-join' })) })
            if (!out.ok) die(`${project}: ops ${i}..: ${out.status} ${String(out.text || '').slice(0, 200)}`)
        }
    }
    const before = await read(client, project)
    const count = (d) => ({ entities: d.entities.length, cues: d.mappingState.cues.length, nodes: d.nodes.length, surfaces: d.mappingState.surfaces.length })
    if (args.undo) {
        const manifest = JSON.parse(fs.readFileSync(String(args.undo), 'utf8'))
        const ops = undoOps(manifest)
        if (!args.apply) return say(`${project}: would delete ${manifest.entityIds.length} entities and ${manifest.cueIds.length} cues (dry run)`)
        await post(ops, 'undo')
        return say(`${project}: undone, now ${JSON.stringify(count((await read(client, project)).document))}`)
    }
    const fromApi = String(args['from-api'] || die('needs --from-api')).replace(/\/+$/, '')
    const source = (await read(makeClient(fromApi, ''), String(args['from-project'] || die('needs --from-project')))).document
    const plan = planJoin({ source, target: before.document, wall: String(args.wall || 'platina-screen'), surface: String(args.surface || '') })
    const look = lookSettings({ source, target: before.document })
    plan.settings = look.ops
    say(`look settings to carry: ${look.ops.map((o) => `${o.type}(${Object.keys(o.payload.patch).join(',')})`).join(' ') || 'none'}`)
    say(`${project} version ${before.version}: now ${JSON.stringify(count(before.document))}; would add ${plan.entities.length} entities (live wall plane: ${plan.plane}${plan.why ? ', ' + plan.why : ''}, surface ${plan.surfaceId || 'none'}) and ${plan.cues.length} cues`)
    if (!args.apply) return say('dry run: nothing written (--apply writes)')
    const dir = path.resolve(String(args['backup-dir'] || die('--apply needs --backup-dir')))
    fs.mkdirSync(dir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backup = path.join(dir, `${project}-before-stage-join-${stamp}.json`)
    const manifestFile = path.join(dir, `${project}-stage-join-${stamp}.manifest.json`)
    fs.writeFileSync(backup, JSON.stringify(before))
    fs.writeFileSync(manifestFile, JSON.stringify({ project, api, baseVersion: before.version, entityIds: plan.entities.map((e) => e.id), cueIds: plan.cues.map((c) => c.id), settingsBefore: look.before }, null, 1))
    await post(joinOps(plan), 'join')
    const after = await read(client, project)
    const a = count(after.document), b = count(before.document)
    const ok = a.entities === b.entities + plan.entities.length && a.cues === b.cues + plan.cues.length && a.nodes === b.nodes && a.surfaces === b.surfaces
    say(`${project} version ${after.version}: now ${JSON.stringify(a)}; ${ok ? 'JOIN OK' : 'JOIN MISMATCH'}; backup ${backup}; undo: --undo ${manifestFile} --apply`)
    if (!ok) process.exit(1)
}

if (isMainModule(import.meta.url)) {
    main().catch((e) => die(e.message))
}
