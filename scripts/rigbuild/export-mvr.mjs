#!/usr/bin/env node
/**
 * export-mvr.mjs — a room's rig as an MVR file, and each fixture type as a GDTF file.
 * docs/architecture/RIG_BUILD.md §6.
 *
 *   node scripts/rigbuild/export-mvr.mjs --document <doc.json> --out <file.mvr> [--gdtf-dir <dir>] [--title <t>]
 *   node scripts/rigbuild/export-mvr.mjs --project <id> [--api <base>] --out <file.mvr>
 *
 * The archive holds GeneralSceneDescription.xml (MVR 1.6), one .gdtf per type used
 * (GDTF 1.2, authored by src/rigbuild/gdtf.js with our own body model), the pieces'
 * GLBs and a unit cube for boxes. Files are dated 2026-09-28 00:00 UTC so the same rig
 * gives the same bytes. `--gdtf-dir` also writes each .gdtf on its own.
 * Validate with scripts/rigbuild/validate-mvr.mjs.
 */
import fs from 'node:fs'
import path from 'node:path'
import JSZip from 'jszip'

import { DEFAULT_API, makeClient, readToken } from '../place/api.mjs'
import { parseArgs, die, say, warn, REPO_ROOT } from '../place/common.mjs'
import { gdtfArchive, gdtfFileName } from '../../src/rigbuild/gdtf.js'
import { mvrScene } from '../../src/rigbuild/mvr.js'
import { PIECES_GLB_DIR, cubeGlb } from './pieces-glb.mjs'
import { loadLibrary } from './library.mjs'
import { isMainModule } from '../lib/isMainModule.mjs'

const DATE = new Date(Date.UTC(2026, 8, 28))

export const buildMvr = async ({ entities, library, title = 'rig' }) => {
    const scene = mvrScene({ entities, library, meta: { title } })
    const zip = new JSZip()
    zip.file('GeneralSceneDescription.xml', scene.xml, { date: DATE })
    const gdtfFiles = {}
    for (const type of scene.gdtf) {
        const glbPath = type.model3d?.glb ? path.join(REPO_ROOT, type.model3d.glb) : null
        const glb = glbPath && fs.existsSync(glbPath) ? fs.readFileSync(glbPath) : null
        const bytes = await gdtfArchive(JSZip, type, glb, { date: DATE })
        gdtfFiles[gdtfFileName(type)] = bytes
        zip.file(gdtfFileName(type), bytes, { date: DATE, binary: true })
    }
    for (const kind of scene.pieces) {
        zip.file(`${kind}.glb`, fs.readFileSync(path.join(REPO_ROOT, PIECES_GLB_DIR, `${kind}.glb`)), { date: DATE, binary: true })
    }
    if (scene.cube) zip.file('cube.glb', await cubeGlb(), { date: DATE, binary: true })
    const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
    return { bytes, scene, gdtfFiles }
}

const main = async () => {
    const args = parseArgs()
    const out = args.out ? path.resolve(String(args.out)) : die('export-mvr.mjs needs --out <file.mvr>.')
    let entities
    let title = args.title ? String(args.title) : null
    if (args.document) {
        const doc = JSON.parse(fs.readFileSync(path.resolve(String(args.document)), 'utf8'))
        entities = doc.entities || doc.document?.entities || []
        title = title || doc.projectMeta?.title || doc.document?.projectMeta?.title || 'rig'
    } else if (args.project) {
        const api = String(args.api || DEFAULT_API).replace(/\/$/, '')
        const read = await makeClient(api, readToken(args['token-file'] ? String(args['token-file']) : null)).get(`/api/projects/${args.project}/document`)
        if (!read.ok) die(`reading ${args.project} failed — HTTP ${read.status}`)
        entities = read.body.document?.entities || []
        title = title || read.body.document?.projectMeta?.title || String(args.project)
    } else {
        die('export-mvr.mjs needs --document <doc.json> or --project <id>.')
    }
    const { bytes, scene, gdtfFiles } = await buildMvr({ entities, library: loadLibrary(), title })
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.writeFileSync(out, bytes)
    if (args['gdtf-dir']) {
        const dir = path.resolve(String(args['gdtf-dir']))
        fs.mkdirSync(dir, { recursive: true })
        for (const [name, b] of Object.entries(gdtfFiles)) fs.writeFileSync(path.join(dir, name), b)
    }
    say(`${out}: ${scene.fixtures} fixtures, ${scene.gdtf.length} GDTF types, ${scene.pieces.length} piece kinds${scene.cube ? ', boxes' : ''} — ${bytes.length} bytes`)
    for (const why of scene.skipped) warn(`  skipped ${why}`)
}

if (isMainModule(import.meta.url)) {
    main().catch((error) => die(error.stack || error.message))
}
