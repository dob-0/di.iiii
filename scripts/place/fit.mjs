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
import { dequantize, meshopt } from '@gltf-transform/functions'
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

// One document, measured and then bent.
//
// It has to be ONE. The mesh is read for measuring as a plain, dequantized
// copy — trimesh cannot read EXT_meshopt_compression, and meshopt stores
// positions as integers with the room's real size hidden on a node. Undoing
// that CHANGES the node transforms. Fitting against the plain copy's world
// and then baking the answer into the compressed file's different node tree
// put the room fourteen metres under the floor, at an angle (2026-09-21).
//
// So: dequantize once, measure that, bend that, write that.
const openForFitting = async (glb, outDir) => {
    const io = new NodeIO()
        .registerExtensions(ALL_EXTENSIONS)
        .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder })
    const document = await io.read(glb)
    const compression = document.getRoot().listExtensionsUsed()
        .find((extension) => extension.extensionName === 'EXT_meshopt_compression')
    if (compression) compression.dispose()
    await document.transform(dequantize())
    const measurable = path.join(outDir, 'fit-input.glb')
    await io.write(measurable, document)
    return { io, document, measurable }
}

// Bake the fit INTO the model, so the room's own file already stands upright,
// metric and centred on its floor.
//
// The alternative — leaving the numbers on the entity — looked equivalent and
// was not: di.iiii frames a room's arrival from where its entities ARE, and a
// model entity carrying a position of (-6.3, -9.8, -2.7) to cancel out the
// reconstruction's offset aims the opening shot at empty space. A visitor got
// a black screen with a room somewhere behind them (seen, 2026-09-21). It also
// means anyone opening this room in Studio sees a model at the origin with
// scale 1, which is what they would expect.
const bakeFit = async ({ io, document }, out, fit) => {
    const root = document.getRoot()
    const scene = root.getDefaultScene() || root.listScenes()[0]
    if (!scene) return null
    const holder = document.createNode('place-fit')
        .setTranslation(fit.position)
        .setRotation(fit.quaternion)
        .setScale([fit.scale, fit.scale, fit.scale])
    // listChildren() hands back a live view, so take a copy before moving any.
    for (const child of [...scene.listChildren()]) {
        scene.removeChild(child)
        holder.addChild(child)
    }
    scene.addChild(holder)
    // Pack it again on the way out: the room ships compressed, exactly as
    // crush.mjs left it, with the fit now part of the file.
    await MeshoptEncoder.ready
    await document.transform(meshopt({ encoder: MeshoptEncoder, level: 'high' }))
    await io.write(out, document)
    return out
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
    const opened = await openForFitting(glb, outDir)
    const found = runPythonJson(python, path.join(PLACE_DIR, 'fit_plane.py'), {
        glb: opened.measurable,
        samples: num(args.samples, 200000),
        iterations: num(args.iterations, 400),
        flip: Boolean(args.flip)
    })

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
    const fitted = await bakeFit(opened, path.join(outDir, 'place-fitted.glb'), fit)
    fs.rmSync(opened.measurable, { force: true })
    record.fittedGlb = fitted
    record.bakedIn = Boolean(fitted)
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
