#!/usr/bin/env node
/**
 * realism.mjs — the MOXIR room as a camera would see the night (docs/architecture/RIG_BUILD.md §20):
 * the haze the beams are drawn in, the camera's exposure and tone mapping, a black hall whose only
 * light is what the rig returns off it, lens-wide beams, and the skylights dark at night.
 * DATA, written as ops (the op log is what viewers replay), never a bare document write.
 *
 *   node scripts/rigbuild/realism.mjs --api https://local.thedi.studio/serverXR --project moxir-hall-minimal \
 *       --token-file ~/.di/di.env --out <backup dir> [--scattering 0.05] [--anisotropy 0.7] \
 *       [--tone ACESFilmic|AgX] [--exposure 3.5] [--dry-run]
 *   node scripts/rigbuild/realism.mjs --api … --project … --token-file … --undo <backup dir>/realism-undo-<project>.json
 *
 * What it writes (and saves the previous value of, first, to realism-undo-<project>.json in --out):
 *   renderSettings.atmosphere      { scattering σs 1/m, anisotropy g }      (beamAir.js)
 *   renderSettings.toneMapping / toneMappingExposure
 *   worldState.ambientLight        black, 0 — the rig's own return replaces it (rigBounce.js)
 *   worldState.directionalLight    0 — there is no moon inside a factory at night
 *   worldState.backgroundColor     #000000
 *   worldState.fog                 linear, 0 … 1.6/σ — the haze's Beer–Lambert extinction on
 *                                  surfaces, as the renderer's linear fog can hold it (matches
 *                                  exp(−σd) at d = 1/σ; within ±0.16 out to 1.5/σ)
 *   rig-show components.rigBounce  { area_m2, reflectance } measured from the hall's own model
 *   every lamp's beam.aperture     its lens's radius, from the fixture manifest (lens_mm, window_mm)
 *   place-hall's model             a NIGHT copy: the skylights' daylight emission off
 *
 * Refuses any host but a local install (local.thedi.studio, localhost, 127.0.0.1) unless
 * --allow-remote: the dev and prod tiers get this data by tier-sync, after the code that reads it.
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { NodeIO } from '@gltf-transform/core'
import { KHRMaterialsUnlit, KHRMaterialsEmissiveStrength } from '@gltf-transform/extensions'
import { mat4, vec3 } from 'gl-matrix'

import { parseArgs, die, say } from '../place/common.mjs'
import { makeClient, readToken } from '../place/api.mjs'
import { fileURLToPath } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const FIXTURES = path.join(REPO, 'scripts/place/fixtures/fixtures.json')
const TYPES = path.join(REPO, 'src/rigbuild/types/moxir.json')

/** A lamp type's lens radius in metres, from the fixture manifest; null when it has none. */
export const apertureByType = (types, fixtures) => {
    const out = {}
    for (const t of types.types || []) {
        const kind = fixtures.kinds?.[t.manifest?.kind]
        const p = kind?.model?.params || {}
        const lens = Number(p.head?.lens_mm) || Number(p.window_mm) || null
        if (lens > 0) out[t.id] = Math.round((lens / 2000) * 1000) / 1000
    }
    return out
}

/** The linear-light luminance of a glTF base colour (BT.709 weights; glTF factors are linear). */
const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b

/**
 * The enclosure a hall's model makes, for the bounce (rigBounce.js: E = Φρ / (A(1−ρ))):
 *   area_m2      the ENVELOPE the model spans — floor, roof and four walls of its world
 *                bounding box, 2(LW + LH + WH). The inter-reflection is between the
 *                enclosure's faces; the steel inside it (columns, trusses, the roof frame)
 *                is lattice the light passes through. (Render audit E, 2026-10-01: summing
 *                every triangle counted both faces of every bar — 82,640 m² for a ~27,000 m²
 *                hall — and the return came out ~3× too dark.)
 *   surface_m2   every triangle, both faces of everything: kept for the record
 *   reflectance  the area-weighted mean luminance of the base colours (linear, BT.709)
 * Every mesh in world space.
 */
export const enclosureOf = (doc) => {
    let area = 0
    let weighted = 0
    const lo = [Infinity, Infinity, Infinity]
    const hi = [-Infinity, -Infinity, -Infinity]
    const grow = (v) => { for (let k = 0; k < 3; k += 1) { if (v[k] < lo[k]) lo[k] = v[k]; if (v[k] > hi[k]) hi[k] = v[k] } }
    const byMaterial = {}
    const a = vec3.create()
    const b = vec3.create()
    const c = vec3.create()
    const ab = vec3.create()
    const ac = vec3.create()
    const cross = vec3.create()
    for (const node of doc.getRoot().listNodes()) {
        const mesh = node.getMesh()
        if (!mesh) continue
        const world = mat4.clone(node.getWorldMatrix())
        for (const prim of mesh.listPrimitives()) {
            const pos = prim.getAttribute('POSITION')
            if (!pos) continue
            const idx = prim.getIndices()
            const count = idx ? idx.getCount() : pos.getCount()
            const at = (i) => (idx ? idx.getScalar(i) : i)
            let primArea = 0
            const p = [0, 0, 0]
            for (let i = 0; i + 2 < count; i += 3) {
                vec3.transformMat4(a, pos.getElement(at(i), p), world)
                vec3.transformMat4(b, pos.getElement(at(i + 1), p), world)
                vec3.transformMat4(c, pos.getElement(at(i + 2), p), world)
                grow(a); grow(b); grow(c)
                vec3.sub(ab, b, a)
                vec3.sub(ac, c, a)
                vec3.cross(cross, ab, ac)
                primArea += vec3.length(cross) / 2
            }
            const material = prim.getMaterial()
            const name = material?.getName() || '(none)'
            const rho = material ? luminance(material.getBaseColorFactor()) : 0.5
            area += primArea
            weighted += primArea * rho
            byMaterial[name] = byMaterial[name] || { area_m2: 0, reflectance: Math.round(rho * 1000) / 1000 }
            byMaterial[name].area_m2 += primArea
        }
    }
    for (const m of Object.values(byMaterial)) m.area_m2 = Math.round(m.area_m2)
    const [L, H, W] = [0, 1, 2].map((k) => (hi[k] > lo[k] ? hi[k] - lo[k] : 0))
    const envelope = 2 * (L * W + L * H + W * H)
    return { area_m2: Math.round(envelope), surface_m2: Math.round(area), reflectance: Math.round((weighted / Math.max(area, 1e-9)) * 1000) / 1000, byMaterial }
}

/** Switch off every emissive material (daylight through the skylights); returns their names. */
export const nightOf = (doc) => {
    const off = []
    for (const m of doc.getRoot().listMaterials()) {
        const e = m.getEmissiveFactor()
        if (e.some((v) => v > 0)) {
            m.setEmissiveFactor([0, 0, 0])
            off.push(m.getName())
        }
    }
    return off
}

/** The fog that stands for the haze's extinction on surfaces (see the header). */
export const hazeFog = (scattering) => ({ enabled: true, near: 0, far: Math.round(1.6 / scattering) })

const LOCAL = /^(local\.thedi\.studio|localhost|127\.0\.0\.1)$/

const main = async () => {
    const args = parseArgs()
    const api = String(args.api || die('needs --api <…/serverXR>')).replace(/\/+$/, '')
    const host = new URL(api).hostname
    if (!LOCAL.test(host) && !args['allow-remote']) die(`refusing ${host}: this writes a local install only (--allow-remote to override, never for production).`)
    const project = String(args.project || die('needs --project'))
    const token = readToken(args['token-file'] ? String(args['token-file']).replace(/^~/, os.homedir()) : null)
    const client = makeClient(api, token)
    const got = await client.get(`/api/projects/${project}/document`)
    if (!got.ok) die(`reading ${project}: ${got.status} ${got.text.slice(0, 200)}`)
    const doc = got.body.document
    const stamp = () => `realism-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const send = async (ops, what) => {
        if (args['dry-run']) {
            say(`[dry run] ${what}: ${ops.length} ops`)
            for (const op of ops.slice(0, 6)) say('   ', JSON.stringify(op).slice(0, 220))
            return null
        }
        const fresh = await client.get(`/api/projects/${project}/document`)
        const out = await client.post(`/api/projects/${project}/ops`, { baseVersion: fresh.body.version, ops: ops.map((op, i) => ({ ...op, opId: `${stamp()}-${i}`, clientId: 'realism' })) })
        if (!out.ok) die(`${what}: ${out.status} ${out.text.slice(0, 300)}`)
        say(`${what}: ${ops.length} ops → version ${out.body.newVersion}`)
        return out.body
    }

    if (args.undo) {
        const undo = JSON.parse(fs.readFileSync(path.resolve(String(args.undo)), 'utf8'))
        if (undo.project !== project) die(`that undo file is for ${undo.project}, not ${project}`)
        await send(undo.ops, 'undo')
        say('undone. (The night copy of the hall stays uploaded as an asset; place-hall draws the old one again.)')
        return
    }

    const out = path.resolve(String(args.out || die('needs --out <backup dir> (the undo file goes there)')).replace(/^~/, os.homedir()))
    fs.mkdirSync(out, { recursive: true })
    const scattering = Number(args.scattering ?? 0.05)
    const anisotropy = Number(args.anisotropy ?? 0.7)
    const tone = String(args.tone || 'ACESFilmic')
    const exposure = Number(args.exposure ?? 3.5)
    if (!(scattering > 0 && scattering <= 1)) die('--scattering is σs in 1/m, 0 < σ ≤ 1')

    // 1. The hall: its enclosure, and a night copy.
    const hall = doc.entities.find((e) => e.id === 'place-hall') || die(`${project} has no place-hall`)
    const hallAsset = hall.components?.media?.assetId
    const bytes = await client.bytes(`/api/projects/${project}/assets/${hallAsset}`)
    if (!bytes.ok) die(`downloading the hall (${hallAsset}): ${bytes.status}`)
    const io = new NodeIO().registerExtensions([KHRMaterialsUnlit, KHRMaterialsEmissiveStrength])
    const glb = await io.readBinary(new Uint8Array(bytes.buffer))
    const enclosure = enclosureOf(glb)
    const off = nightOf(glb)
    say(`hall ${hallAsset.slice(0, 12)}…: ${enclosure.area_m2} m² of envelope (${enclosure.surface_m2} m² of triangles), mean reflectance ${enclosure.reflectance}; emissive switched off: ${off.join(', ') || 'none'}`)

    // 2. The undo, before anything is written.
    const types = JSON.parse(fs.readFileSync(TYPES, 'utf8'))
    const fixtures = JSON.parse(fs.readFileSync(FIXTURES, 'utf8'))
    const apertures = apertureByType(types, fixtures)
    const lamps = doc.entities.filter((e) => e.type === 'spotLight' && e.components?.beam && apertures[e.components?.fixture?.type])
    const show = doc.entities.find((e) => e.id === 'rig-show') || die(`${project} has no rig-show entity`)
    const was = { renderSettings: doc.renderSettings, worldState: doc.worldState }
    const undo = {
        project,
        at: new Date().toISOString(),
        note: 'written by scripts/rigbuild/realism.mjs before it wrote anything; replay with --undo',
        ops: [
            { type: 'setRenderSettings', payload: { patch: { atmosphere: null, toneMapping: was.renderSettings?.toneMapping ?? 'ACESFilmic', toneMappingExposure: was.renderSettings?.toneMappingExposure ?? 1 } } },
            { type: 'setWorldState', payload: { patch: { ambientLight: was.worldState?.ambientLight, directionalLight: was.worldState?.directionalLight, backgroundColor: was.worldState?.backgroundColor, fog: was.worldState?.fog } } },
            { type: 'updateComponent', payload: { entityId: 'rig-show', component: 'rigBounce', patch: { area_m2: null, reflectance: null, method: null, source: null } } },
            ...lamps.map((e) => ({ type: 'updateComponent', payload: { entityId: e.id, component: 'beam', patch: { aperture: e.components.beam.aperture ?? null } } })),
            { type: 'updateComponent', payload: { entityId: 'place-hall', component: 'media', patch: { assetId: hallAsset } } }
        ]
    }
    const undoFile = path.join(out, `realism-undo-${project}.json`)
    if (!args['dry-run']) {
        if (fs.existsSync(undoFile)) die(`${undoFile} exists — an earlier run's undo; move it before writing again (or --undo it).`)
        fs.writeFileSync(undoFile, JSON.stringify(undo, null, 2))
        say(`undo saved: ${undoFile}`)
    }

    // 3. The night hall, uploaded and drawn.
    const nightFile = path.join(out, `hall-night-${project}.glb`)
    fs.writeFileSync(nightFile, await io.writeBinary(glb))
    let hallOps = []
    if (!args['dry-run']) {
        const form = new FormData()
        form.append('asset', new Blob([fs.readFileSync(nightFile)], { type: 'model/gltf-binary' }), 'hall-night.glb')
        const up = await client.post(`/api/projects/${project}/assets`, form)
        if (!up.ok) die(`upload: ${up.status} ${up.text.slice(0, 200)}`)
        const a = up.body.asset
        const asset = { id: a.id, name: a.name || 'hall-night.glb', mimeType: a.mimeType || 'model/gltf-binary', size: a.size || fs.statSync(nightFile).size, url: a.url, source: 'server', createdAt: Date.now() }
        hallOps = [
            { type: 'upsertAsset', payload: { asset } },
            { type: 'updateComponent', payload: { entityId: 'place-hall', component: 'media', patch: { assetId: a.id } } }
        ]
    }

    // 4. The look values.
    const ops = [
        { type: 'setRenderSettings', payload: { patch: { atmosphere: { scattering, anisotropy }, toneMapping: tone, toneMappingExposure: exposure } } },
        {
            type: 'setWorldState',
            payload: {
                patch: {
                    ambientLight: { color: '#000000', intensity: 0 },
                    directionalLight: { ...(doc.worldState?.directionalLight || {}), intensity: 0 },
                    backgroundColor: '#000000',
                    fog: { ...hazeFog(scattering), color: null }
                }
            }
        },
        {
            type: 'updateComponent',
            payload: {
                entityId: show.id,
                component: 'rigBounce',
                patch: {
                    area_m2: enclosure.area_m2,
                    reflectance: enclosure.reflectance,
                    surface_m2: enclosure.surface_m2,
                    method: 'scripts/rigbuild/realism.mjs enclosureOf: area = the envelope of the hall model’s world bounding box, 2(LW + LH + WH); reflectance = area-weighted luminance of the base colours over every triangle (linear, BT.709)',
                    source: `hall asset ${hallAsset}`
                }
            }
        },
        ...lamps.map((e) => ({ type: 'updateComponent', payload: { entityId: e.id, component: 'beam', patch: { aperture: apertures[e.components.fixture.type] } } })),
        ...hallOps
    ]
    await send(ops, `${project}: haze σ ${scattering}/m g ${anisotropy}, ${tone} × ${exposure}, black hall + rig return, ${lamps.length} lens apertures, night hall`)
    fs.writeFileSync(path.join(out, `realism-applied-${project}.json`), JSON.stringify({ project, at: new Date().toISOString(), scattering, anisotropy, tone, exposure, enclosure, emissiveOff: off, apertures, ops: ops.length }, null, 2))
}

if (process.argv[1] && process.argv[1].endsWith('realism.mjs')) main().catch((error) => die(error.stack || error.message))
