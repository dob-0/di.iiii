/**
 * fixtures-glb.mjs — every fixture body of a rig as ONE instanced GLB.
 *
 * The models (fixtures/glb/<kind>.glb, built by fixtures/build_fixtures.py)
 * are separate nodes — Base, Yoke, Head, Lens — so a head can be posed. A rig
 * hangs ~100 of them. Written as 100 model entities, that is 100 file loads
 * and ~400 draw calls; written here, every part of every kind becomes ONE
 * node carrying EXT_mesh_gpu_instancing (Khronos, ratified; three.js's
 * GLTFLoader turns it into an InstancedMesh), with one transform per fixture:
 * the whole rig's steel is (kinds x parts x materials) draw calls, ~40, no
 * matter how many heads hang.
 *
 * Each part's transform is the one fixture-lib.mjs worked out for the lamp's
 * pan and tilt, so the head in the picture is turned exactly where its beam
 * goes. The lens faces are unlit (KHR_materials_unlit) and tinted per lamp
 * through the instance colour (`_COLOR_0`), so a lamp's lens glows in its
 * own colour.
 *
 * The price, named: the bodies are baked at rig.mjs time. Re-aiming a spot
 * light by hand in the Studio moves its beam, not its head — re-run rig.mjs
 * (or a `--look`) to move both. A per-entity fixture component that follows
 * the inspector's pan/tilt is the real fix and is OWED (docs/ai/sessions/
 * feat-moxir-hall.md).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { Document, NodeIO } from '@gltf-transform/core'
import { EXTMeshGPUInstancing, KHRMaterialsUnlit, ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { copyToDocument, dedup } from '@gltf-transform/functions'

import { toTRS } from './fixture-lib.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
export const FIXTURE_DIR = path.join(here, 'fixtures')

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
export const hexToLinear = (hex) => {
    const n = parseInt(String(hex || '#ffffff').replace('#', '').padEnd(6, 'f').slice(0, 6), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => srgbToLinear(v / 255))
}

/** The built model's sidecar (pivots, parts, size) for a kind. */
export const readGeometry = (kind, dir = path.join(FIXTURE_DIR, 'glb')) => {
    const file = path.join(dir, `${kind}.json`)
    if (!fs.existsSync(file)) throw new Error(`No built model for "${kind}" (${file}) — run fixtures/build_fixtures.py in Blender.`)
    return JSON.parse(fs.readFileSync(file, 'utf8'))
}

/**
 * @param {{ kind: string, parts: Record<string, import('three').Matrix4>, colour?: string }[]} fixtures
 * @param {{ dir?: string }} [options]
 * @returns {Promise<Uint8Array>} the GLB
 */
export const fixturesGlb = async (fixtures, { dir = path.join(FIXTURE_DIR, 'glb') } = {}) => {
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
    const doc = new Document()
    const buffer = doc.createBuffer()
    const scene = doc.createScene('rig-fixtures')
    const instancing = doc.createExtension(EXTMeshGPUInstancing).setRequired(true)
    const unlit = doc.createExtension(KHRMaterialsUnlit)

    const byKind = new Map()
    for (const f of fixtures) {
        if (!byKind.has(f.kind)) byKind.set(f.kind, [])
        byKind.get(f.kind).push(f)
    }
    for (const [kind, list] of byKind) {
        const source = await io.read(path.join(dir, `${kind}.glb`))
        for (const node of source.getRoot().listNodes()) {
            const mesh = node.getMesh()
            if (!mesh) continue
            const part = node.getName()
            const [copied] = copyToDocument(doc, source, [mesh]).values()
            for (const prim of copied.listPrimitives()) {
                for (const attr of prim.listAttributes()) attr.setBuffer(buffer)
                prim.getIndices()?.setBuffer(buffer)
                const mat = prim.getMaterial()
                if (mat && mat.getName() === 'Lens') {
                    mat.setBaseColorFactor([1, 1, 1, 1]).setEmissiveFactor([0, 0, 0]).setExtension('KHR_materials_unlit', unlit.createUnlit())
                }
            }
            const posed = list.filter((f) => f.parts[part])
            if (!posed.length) continue
            const t = new Float32Array(posed.length * 3)
            const r = new Float32Array(posed.length * 4)
            const s = new Float32Array(posed.length * 3)
            const c = new Float32Array(posed.length * 3)
            posed.forEach((f, i) => {
                const trs = toTRS(f.parts[part])
                t.set(trs.t, i * 3)
                r.set(trs.r, i * 4)
                s.set(trs.s, i * 3)
                // Only the lens is tinted; the body keeps its own colour (x white).
                c.set(part === 'Lens' ? hexToLinear(f.colour) : [1, 1, 1], i * 3)
            })
            const accessor = (array, type) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer)
            const batch = instancing.createInstancedMesh()
                .setAttribute('TRANSLATION', accessor(t, 'VEC3'))
                .setAttribute('ROTATION', accessor(r, 'VEC4'))
                .setAttribute('SCALE', accessor(s, 'VEC3'))
            if (part === 'Lens') batch.setAttribute('_COLOR_0', accessor(c, 'VEC3'))
            const inst = doc.createNode(`${kind}.${part}`).setMesh(copied).setExtension('EXT_mesh_gpu_instancing', batch)
            scene.addChild(inst)
        }
    }
    // Every kind brings its own copy of "Body", "Metal", ...: one of each is enough.
    await doc.transform(dedup())
    for (const b of doc.getRoot().listBuffers()) if (b !== buffer) b.dispose()
    return io.writeBinary(doc)
}
