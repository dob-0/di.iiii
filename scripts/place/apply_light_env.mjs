#!/usr/bin/env node
/**
 * apply_light_env.mjs — carry a light environment (the air, the exposure, the bloom, the floor's surface, the fog) from
 * one project, or from a settings file, into another project. Dry run unless --apply. Generic: no production name.
 * (2026-10-15, the light-environment audit: agent-reports-2026-10-15/moxir-50/light-env-report.md.)
 *
 *   node scripts/place/apply_light_env.mjs --api http://127.0.0.1:4337/serverXR --project moxir-v2-11 \
 *       --from-project moxir-v2-9                          # or: --settings light-env.json
 *       [--from-api https://dev.diiii.xyz/serverXR]        # read the source from another server (read-only)
 *       [--fields atmosphere,exposure,bloom,surfaces,fog]  # groups (default: all five)
 *       [--token-file <file>] [--apply]
 *   node scripts/place/apply_light_env.mjs --api … --project … --undo ~/.di/light-env-undo/<project>-<time>.json --apply
 *
 * WHAT IS CARRIED — the document keys the renderer reads for the light environment (found in the code, 2026-10-15):
 *   atmosphere  renderSettings.atmosphere {scattering, anisotropy, haze{…}}  RenderSettingsEffect → atmosphereStore,
 *               hazeField.js hazeSettingsOf (haze.model 'nf-ff' / calibrate false = the physics' own number, not scattering)
 *   exposure    renderSettings.toneMapping, toneMappingExposure, exposure{auto}
 *   bloom       renderSettings.bloom
 *   surfaces    renderSettings.surfaces (the floor's albedo, roughness, reflection)
 *   fog         worldState.fog {near, far, color, enabled}
 * NEVER carried: lamps (light.intensity/angle, beam.length, beam.haze). A beam's length belongs to ITS scene's surfaces and
 * is recomputed there (owner's physics rule 2026-10-13: a stored number that fits another state is a bug) — after an
 * --apply that changes the air, run scripts/place/physics_check.py on the target.
 *
 * --settings file shape: { "renderSettings": { "atmosphere": {…}, "toneMappingExposure": 3.5, … }, "worldState": { "fog": {…} } }
 * Each subtree is carried as leaves; a leaf the target has and the source lacks is set to null (so a stale haze.model or
 * calibrate does not survive). Writes go through the ops route at the version just read (apply-picture.mjs post rule), the
 * previous values are saved first for --undo, the document is read back and compared.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { makeClient, readToken } from './api.mjs'
import { changesFor, forwardOps, undoOps, tableOf } from '../rigbuild/apply-picture.mjs'
import { isMainModule } from '../lib/isMainModule.mjs'

import { GROUPS, getPath, leavesOf, wantedFrom } from '../../src/shared/lightEnv.js'
export { GROUPS, leavesOf, wantedFrom }
export const UNDO_DIR = path.join(os.homedir(), '.di', 'light-env-undo')
const CLIENT_ID = 'apply-light-env'

const arg = (name, fallback = null) => {
    const i = process.argv.indexOf(`--${name}`)
    return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback
}

const main = async () => {
    const api = String(arg('api', '')).replace(/\/+$/, '')
    const project = arg('project')
    const APPLY = process.argv.includes('--apply')
    if (!api || !project) throw new Error('usage: --api <serverXR> --project <id> (--from-project <id> | --settings <file> | --undo <file>) [--apply]')
    const client = makeClient(api, readToken(arg('token-file')))
    const got = await client.get(`/api/projects/${project}/document`)
    if (!got.ok) throw new Error(`reading ${project}: ${got.status}`)
    const target = got.body?.document || {}
    const version = Number(got.body?.version) || 0

    let changes
    if (arg('undo')) {
        const saved = JSON.parse(fs.readFileSync(arg('undo'), 'utf8'))
        changes = saved.changes.map((c) => ({ ...c, before: getPath(target, c.path), after: c.before }))
    } else {
        let source
        let from
        if (arg('settings')) {
            source = JSON.parse(fs.readFileSync(arg('settings'), 'utf8'))
            from = `settings ${arg('settings')}`
        } else if (arg('from-project')) {
            const fromApi = String(arg('from-api', api)).replace(/\/+$/, '')
            const src = await makeClient(fromApi, fromApi === api ? readToken(arg('token-file')) : null).get(`/api/projects/${arg('from-project')}/document`)
            if (!src.ok) throw new Error(`reading ${arg('from-project')} at ${fromApi}: ${src.status}`)
            source = src.body?.document || {}
            from = `${fromApi} ${arg('from-project')}`
        } else throw new Error('say where the light comes from: --from-project <id> or --settings <file>')
        const groups = arg('fields') ? String(arg('fields')).split(',') : Object.keys(GROUPS)
        const bad = groups.filter((g) => !GROUPS[g])
        if (bad.length) throw new Error(`unknown group(s) ${bad.join(', ')}; groups: ${Object.keys(GROUPS).join(', ')}`)
        const { wanted, missing } = wantedFrom(source, target, groups)
        changes = changesFor(target, wanted)
        console.log(`from ${from} → ${api} ${project} (version ${version})${missing.length ? `; the source holds no ${missing.join(', ')} (left as it is)` : ''}`)
    }
    if (!changes.length) { console.log('nothing to change: the target already holds this light environment'); return }
    for (const line of tableOf(project, changes).slice(0, 60)) console.log(line)
    if (changes.length > 60) console.log(`  … ${changes.length - 60} more`)
    const ops = forwardOps(changes, target)
    if (!APPLY) { console.log(`DRY RUN: ${changes.length} leaves, ${ops.length} op(s). Nothing written; add --apply to write.`); return }

    fs.mkdirSync(UNDO_DIR, { recursive: true })
    const undoFile = path.join(UNDO_DIR, `${project}-${Date.now()}.json`)
    fs.writeFileSync(undoFile, JSON.stringify({ api, project, version, changes, undoOps: undoOps(changes, target) }, null, 1))
    const stamp = Date.now()
    const out = await client.post(`/api/projects/${project}/ops`, { baseVersion: version, ops: ops.map((op, i) => ({ ...op, opId: `${CLIENT_ID}-${stamp}-${i}`, clientId: CLIENT_ID })) })
    if (out.status === 409) throw new Error(`${project} moved while writing (409): nothing written; run again`)
    if (!out.ok) throw new Error(`${project}: ops ${out.status} ${String(out.text || '').slice(0, 300)}: nothing written`)
    const back = await client.get(`/api/projects/${project}/document`)
    const wrong = changes.filter((c) => JSON.stringify(getPath(back.body?.document, c.path) ?? null) !== JSON.stringify(c.after ?? null))
    if (wrong.length) throw new Error(`${project}: written, but ${wrong.length} leaves read back different (first: ${wrong[0].path.join('.')}); undo: --undo ${undoFile}`)
    console.log(`written and read back: ${changes.length} leaves. Undo: --undo ${undoFile} --apply. Next: scripts/place/physics_check.py on ${project}.`)
}

if (isMainModule(import.meta.url)) main().catch((e) => { console.error(e.message || e); process.exit(1) })
