#!/usr/bin/env node
// The walk's pose sidecar → the reconstruction. See poses-lib.mjs for the method and its sources.
//
//   node scripts/place/poses.mjs --sidecar walk.poses.json --colmap <dir>
//        writes <dir>/cameras.txt, images.txt, points3D.txt (COLMAP known-pose input)
//   node scripts/place/poses.mjs --sidecar walk.poses.json --inject <cameraInit.sfm> --out <posed.sfm>
//        locks the walk's poses into Meshroom's SfMData (for computeStructureFromKnownPoses)
//   node scripts/place/poses.mjs --sidecar walk.poses.json --recon <cameras.sfm | images.txt> --scale-out <scale.json>
//        the walk's metres → the reconstruction's scale; pass to fit.mjs / place.mjs as --scale-from <scale.json>

import fs from 'node:fs'
import path from 'node:path'
import { parseArgs, say, die, writeJson } from './common.mjs'
import { injectPosesIntoSfm, posedScaleFromSidecar, readColmapCentres, readSfmCentres, sidecarToColmap } from './poses-lib.mjs'

const args = parseArgs()
if (!args.sidecar) die('--sidecar <walk.poses.json> is needed')
const sidecar = JSON.parse(fs.readFileSync(String(args.sidecar), 'utf8'))
if (sidecar.kind !== 'di.scan.poses') die(`${args.sidecar} is not a pose sidecar (kind ${sidecar.kind})`)
say(`walk ${sidecar.walk || '?'} · ${sidecar.frames.length} frames · camera ${sidecar.cameraImage?.width}×${sidecar.cameraImage?.height} · scale ${sidecar.scale?.source}`)

if (args.colmap) {
    const dir = path.resolve(String(args.colmap))
    fs.mkdirSync(dir, { recursive: true })
    const model = sidecarToColmap(sidecar)
    fs.writeFileSync(path.join(dir, 'cameras.txt'), model.camerasTxt)
    fs.writeFileSync(path.join(dir, 'images.txt'), model.imagesTxt)
    fs.writeFileSync(path.join(dir, 'points3D.txt'), model.points3DTxt)
    say(`COLMAP known-pose model → ${dir}`)
}

if (args.inject) {
    if (!args.out) die('--inject needs --out <posed.sfm>')
    const sfm = JSON.parse(fs.readFileSync(String(args.inject), 'utf8'))
    const { sfm: posed, matched, views } = injectPosesIntoSfm(sfm, sidecar)
    writeJson(String(args.out), posed)
    say(`${matched} of ${views} views posed and locked → ${args.out}`)
    if (!matched) die('no view matched a frame by file name')
}

if (args.recon) {
    const file = String(args.recon)
    const text = fs.readFileSync(file, 'utf8')
    const centres = file.endsWith('.txt') ? readColmapCentres(text) : readSfmCentres(JSON.parse(text))
    const record = posedScaleFromSidecar(sidecar, centres)
    if (!record) die(`fewer than 3 frames of the walk are in ${file} — no scale`)
    say(`scale ${record.scale.toFixed(4)} m per model unit from ${record.cameras} cameras · pairwise median ${record.median?.toFixed(4)} · spread ${(100 * (record.spread || 0)).toFixed(1)} %`)
    if (args['scale-out']) writeJson(String(args['scale-out']), record)
}
