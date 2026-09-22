#!/usr/bin/env node
/**
 * crush.mjs — step 3 of the place pipeline.
 *
 * A reconstruction is not a model. Meshroom hands back millions of triangles
 * and enormous textures; a phone on a theatre's wifi wants a few hundred
 * thousand and a couple of WebP images. Golden rule: never ship a raw scan
 * mesh (docs/ai/golden_rules.md).
 *
 * OBJ (via Blender) → GLB → welded, simplified to a triangle budget, textures
 * to WebP at a size ceiling → one GLB, with a before-and-after picture beside
 * it so a person can see what the crushing cost.
 *
 * Usage:
 *   node scripts/place/crush.mjs --work <folder> [options]
 *   node scripts/place/crush.mjs --in <mesh.obj|mesh.glb> --out <place.glb>
 *
 *   --work <dir>        the pipeline's working folder (reads <work>/mesh/)
 *   --in <file>         a mesh to crush instead of the one in <work>
 *   --out <file>        where the crushed GLB goes (default <work>/place.glb)
 *   --triangles <n>     triangle budget (default 300000)
 *   --texture <px>      texture size ceiling (default 2048)
 *   --no-preview        skip the before/after pictures
 */
import fs from 'node:fs'
import path from 'node:path'

import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, weld, simplify, textureCompress, prune, meshopt } from '@gltf-transform/functions'
import { MeshoptSimplifier, MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer'
import sharp from 'sharp'

import { PLACE_DIR, parseArgs, num, say, warn, die, ensureDir, fmtBytes, readJson, writeJson, run } from './common.mjs'

const args = parseArgs()

export const DEFAULT_TRIANGLE_BUDGET = 300_000
export const DEFAULT_TEXTURE_SIZE = 2048

// The encoder has to be handed to the IO as well as to the transform: the
// EXT_meshopt_compression extension does its packing at WRITE time, and
// without this registration the write dies on an undefined encoder.
const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder })

export const countMesh = (document) => {
    let triangles = 0
    let vertices = 0
    for (const mesh of document.getRoot().listMeshes()) {
        for (const primitive of mesh.listPrimitives()) {
            const indices = primitive.getIndices()
            const position = primitive.getAttribute('POSITION')
            vertices += position ? position.getCount() : 0
            const count = indices ? indices.getCount() : (position ? position.getCount() : 0)
            triangles += Math.floor(count / 3)
        }
    }
    const textures = document.getRoot().listTextures().map((texture) => {
        const size = texture.getSize()
        return {
            name: texture.getName() || 'texture',
            mimeType: texture.getMimeType(),
            width: size ? size[0] : 0,
            height: size ? size[1] : 0,
            bytes: texture.getImage()?.byteLength || 0
        }
    })
    return { triangles, vertices, textures }
}

// Blender is the only thing here that reads an OBJ with its materials and
// texture paths intact.
const toGlb = (source, target) => {
    say(`  reading ${path.basename(source)} through Blender …`)
    run('blender', ['-b', '-P', path.join(PLACE_DIR, 'obj-to-glb.py'), '--', source, target], { stdio: 'pipe' })
    if (!fs.existsSync(target)) die(`Blender did not produce ${target}.`)
    return target
}

export const resolveInput = (work, explicit) => {
    if (explicit) return path.resolve(explicit)
    const record = readJson(path.join(work, 'reconstruct.json'))
    if (record?.mesh && fs.existsSync(record.mesh)) return record.mesh
    const meshDir = path.join(work, 'mesh')
    if (!fs.existsSync(meshDir)) return null
    const candidates = fs.readdirSync(meshDir)
        .filter((name) => /\.(obj|glb|gltf|ply)$/i.test(name))
        .sort()
    return candidates.length ? path.join(meshDir, candidates[0]) : null
}

const main = async () => {
    const work = args.work ? path.resolve(String(args.work)) : null
    const input = resolveInput(work, args.in ? String(args.in) : null)
    if (!input) {
        die('crush.mjs needs --work <folder with a mesh> or --in <mesh file>.')
    }
    if (!fs.existsSync(input)) die(`No mesh at ${input}`)
    const outDir = work || path.dirname(input)
    const out = path.resolve(String(args.out || path.join(outDir, 'place.glb')))
    const budget = num(args.triangles, DEFAULT_TRIANGLE_BUDGET)
    const textureCeiling = num(args.texture, DEFAULT_TEXTURE_SIZE)

    ensureDir(path.dirname(out))
    const rawGlb = /\.(glb|gltf)$/i.test(input)
        ? input
        : toGlb(input, path.join(outDir, 'raw.glb'))

    const document = await io.read(rawGlb)
    const before = countMesh(document)
    const beforeBytes = fs.statSync(rawGlb).size
    say('')
    say('Before')
    say(`  ${before.triangles.toLocaleString()} triangles · ${fmtBytes(beforeBytes)}`)
    before.textures.forEach((texture) => say(`  texture ${texture.width}x${texture.height} ${texture.mimeType} ${fmtBytes(texture.bytes)}`))

    // Weld first or simplify has nothing to collapse: a reconstruction's
    // vertices are all split, so every triangle is an island and the
    // simplifier can only delete, not merge.
    await document.transform(
        dedup(),
        weld()
    )

    const ratio = before.triangles > budget ? budget / before.triangles : 1
    if (ratio < 1) {
        await MeshoptSimplifier.ready
        // The error cap can stop the simplifier short of the ratio. Rather
        // than accept a mesh over budget, allow it more error and try again —
        // a scan of a hall has no precious silhouette to protect.
        for (const error of [0.005, 0.02, 0.08, 0.25]) {
            await document.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error }))
            if (countMesh(document).triangles <= budget) break
        }
    }

    await document.transform(
        textureCompress({
            encoder: sharp,
            targetFormat: 'webp',
            resize: [textureCeiling, textureCeiling],
            quality: 85
        }),
        prune()
    )

    // Meshopt, not Draco: di.iiii's model loader hands the GLTFLoader a
    // meshopt decoder that three ships inside the bundle
    // (src/objectComponents/ModelObject.jsx), while Draco needs the decoder
    // files under /draco/ to be fetched separately. Same order of saving,
    // one less thing that can 404 on a theatre's wifi.
    await MeshoptEncoder.ready
    await document.transform(meshopt({ encoder: MeshoptEncoder, level: 'high' }))

    await io.write(out, document)
    const after = countMesh(document)
    const afterBytes = fs.statSync(out).size
    say('')
    say('After')
    say(`  ${after.triangles.toLocaleString()} triangles · ${fmtBytes(afterBytes)}`)
    after.textures.forEach((texture) => say(`  texture ${texture.width}x${texture.height} ${texture.mimeType} ${fmtBytes(texture.bytes)}`))
    const factor = afterBytes ? (beforeBytes / afterBytes) : 0
    say('')
    say(`${factor.toFixed(1)}x smaller · ${(100 - (after.triangles / before.triangles) * 100).toFixed(1)}% of the triangles gone`)
    if (after.triangles > budget) {
        warn(`STILL OVER BUDGET: ${after.triangles} triangles against a budget of ${budget}.`)
    }

    const report = {
        tool: 'scripts/place/crush.mjs',
        createdAt: new Date().toISOString(),
        input,
        output: out,
        budget,
        textureCeiling,
        before: { ...before, bytes: beforeBytes },
        after: { ...after, bytes: afterBytes }
    }

    if (!args['no-preview']) {
        say('')
        say('Taking a picture of each, so the crushing can be looked at …')
        try {
            const { renderPreviews } = await import('./preview.mjs')
            const shots = await renderPreviews([
                { glb: rawGlb, out: path.join(outDir, 'crush-before.png'), label: 'before' },
                { glb: out, out: path.join(outDir, 'crush-after.png'), label: 'after' }
            ])
            shots.forEach((shot) => say(`  ${shot.label}: ${shot.out}${shot.ok ? '' : `  (the viewer said: ${JSON.stringify(shot.detail)})`}`))
            report.previews = shots.map((shot) => ({ label: shot.label, file: shot.out, ok: shot.ok }))
        } catch (error) {
            warn(`  no pictures this time: ${error.message}`)
        }
    }

    writeJson(path.join(outDir, 'crush.json'), report)
    say('')
    say(`Crushed: ${out}`)
    say('Open crush-before.png and crush-after.png side by side before you trust this.')
}

if (process.argv[1] && process.argv[1].endsWith('crush.mjs')) await main()
