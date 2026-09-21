#!/usr/bin/env node
/**
 * fit.mjs — step 4 of the place pipeline: standing the room up.
 *
 * A reconstruction has no idea which way is up, how big it is, or where its
 * middle is. This finds the floor, turns it flat, puts a metre on it, and
 * writes the answer to place.json beside the GLB. It changes no geometry —
 * the numbers are what the importer applies.
 *
 * SIZE IS NOT FREE. A reconstruction from photographs has no scale in it; a
 * hall and a doll's house of a hall are the same pile of numbers. Either
 * somebody measures something:
 *
 *     --scale-edge 12.4            the room's longest wall is 12.4 m
 *     --scale-edge 6.0 --edge depth   … or its depth, or width, or height
 *
 * or we read the tallest doorway off the mesh and call it 2.1 m:
 *
 *     --door-guess
 *
 * The first is MEASURED and place.json says so. The second is a GUESS and
 * place.json says that too, loudly, because a guessed room is the wrong size
 * and everything put in it later will be the wrong size with it.
 *
 * Usage:
 *   node scripts/place/fit.mjs --work <folder> [--scale-edge N [--edge width|depth|height] | --door-guess]
 *
 *   --glb <file>        the mesh to fit (default <work>/place.glb)
 *   --forward <deg>     which way the visitor faces on arrival
 *   --flip              the largest flat surface was the CEILING, not the floor
 *   --inset <m>         how far off the walls the walkable floor stops (0.6)
 */
import fs from 'node:fs'
import path from 'node:path'

import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dequantize } from '@gltf-transform/functions'
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer'

import { PLACE_DIR, parseArgs, num, say, warn, die, writeJson, findPython, runPythonJson } from './common.mjs'
import { fitTransform, walkableFromBounds, spawnFrom, buildPlaceRecord } from './fit-lib.mjs'

const args = parseArgs()

export const DOOR_HEIGHT_METRES = 2.1

export const chooseScale = ({ bounds, door, scaleEdge, edge, doorGuess }) => {
    const size = [
        bounds.max[0] - bounds.min[0],
        bounds.max[1] - bounds.min[1],
        bounds.max[2] - bounds.min[2]
    ]
    if (Number.isFinite(scaleEdge) && scaleEdge > 0) {
        const pick = {
            width: size[0],
            height: size[1],
            depth: size[2],
            longest: Math.max(size[0], size[2])
        }[edge || 'longest']
        if (!pick || pick <= 0) return { scale: 1, source: 'none', note: 'the room has no size along that edge' }
        return {
            scale: scaleEdge / pick,
            source: 'measured',
            note: `${scaleEdge} m across the room's ${edge || 'longest side'}, measured`
        }
    }
    if (doorGuess) {
        if (!door) {
            return {
                scale: 1,
                source: 'none',
                note: 'no doorway found in the mesh — nothing to guess from'
            }
        }
        return {
            scale: DOOR_HEIGHT_METRES / door.height,
            source: 'guess',
            note: `the tallest doorway-shaped opening was called ${DOOR_HEIGHT_METRES} m — A GUESS, not a measurement`
        }
    }
    return { scale: 1, source: 'none', note: 'nobody said how big the room is, so it is in its own units' }
}

// trimesh cannot read EXT_meshopt_compression, and crush.mjs writes it. So a
// plain copy is made for the measuring — same vertices, no extension — and
// thrown away after. The shipped GLB is never touched.
const plainCopyFor = async (glb, outDir) => {
    const io = new NodeIO()
        .registerExtensions(ALL_EXTENSIONS)
        .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder })
    const document = await io.read(glb)
    const compression = document.getRoot().listExtensionsUsed()
        .find((extension) => extension.extensionName === 'EXT_meshopt_compression')
    if (!compression) return { file: glb, temporary: false }
    compression.dispose()
    // Meshopt packs positions as integers and puts the real size on the node
    // as a scale. Undo that too: measuring a room whose vertices run 0..65535
    // gives a doorway 65 thousand units tall (it did, 2026-09-21).
    await document.transform(dequantize())
    const copy = path.join(outDir, 'fit-input.glb')
    await io.write(copy, document)
    return { file: copy, temporary: true }
}

const main = async () => {
    const work = args.work ? path.resolve(String(args.work)) : null
    const glb = path.resolve(String(args.glb || (work ? path.join(work, 'place.glb') : '')))
    if (!glb || !fs.existsSync(glb)) {
        die('fit.mjs needs --work <folder with place.glb> or --glb <file>.')
    }
    const outDir = work || path.dirname(glb)

    const python = findPython(['numpy', 'trimesh'])
    say(`Looking for the floor in ${path.basename(glb)} …`)
    const readable = await plainCopyFor(glb, outDir)
    const found = runPythonJson(python, path.join(PLACE_DIR, 'fit_plane.py'), {
        glb: readable.file,
        samples: num(args.samples, 200000),
        iterations: num(args.iterations, 400),
        flip: Boolean(args.flip)
    })
    if (readable.temporary) fs.rmSync(readable.file, { force: true })

    const percent = (found.floor.inlierFraction * 100).toFixed(1)
    say(`  the largest flat surface holds ${percent}% of the mesh`)
    say(`  ${found.confidence.note}`)
    if (found.door) {
        say(`  a doorway-shaped opening, ${found.door.height.toFixed(3)} in model units`)
    } else {
        say('  no doorway found')
    }

    const { scale, source, note } = chooseScale({
        bounds: found.bounds,
        door: found.door,
        scaleEdge: args['scale-edge'] === undefined ? null : num(args['scale-edge'], null),
        edge: args.edge ? String(args.edge) : null,
        doorGuess: Boolean(args['door-guess'])
    })

    const fit = fitTransform({
        quaternion: found.quaternion,
        floorNormal: found.floor.normal,
        bounds: found.bounds,
        floorY: found.floor.y,
        scale
    })
    const walkable = walkableFromBounds(fit.placedBounds, num(args.inset, 0.6))
    const placedDoor = found.door
        ? (() => {
            const [x, , z] = fit.place([found.door.x, found.floor.y, found.door.z])
            return { x: Math.round(x * 1000) / 1000, z: Math.round(z * 1000) / 1000, height: found.door.height * scale }
        })()
        : null
    const spawn = spawnFrom({
        placedBounds: fit.placedBounds,
        door: placedDoor,
        forwardDegrees: args.forward === undefined ? null : num(args.forward, null)
    })

    const record = buildPlaceRecord({
        glb,
        fit,
        door: placedDoor,
        scaleSource: source,
        scaleNote: note,
        floor: {
            normal: found.floor.normal,
            inlierFraction: found.floor.inlierFraction,
            samples: found.sampled
        },
        spawn,
        walkable,
        confidence: found.confidence
    })
    const out = path.join(outDir, 'place.json')
    writeJson(out, record)

    const [width, height, depth] = record.size
    say('')
    say(`The room, stood up: ${width.toFixed(2)} m across · ${depth.toFixed(2)} m deep · ${height.toFixed(2)} m to the ceiling`)
    say(`Size comes from: ${source.toUpperCase()} — ${note}`)
    if (source === 'guess') {
        warn('')
        warn('That size is a GUESS. Measure one wall and run this again with --scale-edge <metres>')
        warn('before anything is built to fit this room.')
    }
    if (source === 'none') {
        warn('')
        warn('Nothing set the size, so the room is in the reconstruction\'s own units and will')
        warn('be the wrong size to walk. Use --scale-edge <metres> or --door-guess.')
    }
    if (found.confidence.verdict !== 'likely') {
        warn('')
        warn('Which way is up is NOT certain here. Walk it, and if the room hangs above you,')
        warn('run this again with --flip.')
    }
    say('')
    say(`Written: ${out}`)
}

if (process.argv[1] && process.argv[1].endsWith('fit.mjs')) await main()
