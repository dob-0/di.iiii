#!/usr/bin/env node
/**
 * moxir.mjs — the MOXIR rig as the real test of the rig-build base, offline.
 * docs/architecture/RIG_BUILD.md §8.
 *
 *   node scripts/rigbuild/moxir.mjs --hall <hall.json> --out <dir> [--rig <rig.json>]
 *
 * 1. hangs the proposed rig in the hall exactly as scripts/place/rig.mjs does
 *    (rig-lib.mjs buildRig — no network), and adds the effects (CO2, spark, smoke) as
 *    entities of their own, at the mounts the same rig puts their bodies;
 * 2. makes every lamp a lamp ON THE RIG: its fixture type from the rig class's crew
 *    code, its position (the group's mount, in words), its unit number along it, hung
 *    or standing — the fields a view would write;
 * 3. patches it on a THROWAWAY desk (this repository's own desk, in-process, on a temp
 *    dir — never the owner's) group by group, "patch this group" style, and writes the
 *    desk's answer back into the document through the real schema;
 * 4. proposes circuits (sheet.js assignCircuits) and writes the patch sheet (HTML),
 *    patch.csv and power.csv, and the document itself, into --out.
 *
 * Nothing is sent to any di.iiii. The rig and hall files are read, never written.
 */
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { Matrix4, Vector3 } from 'three'

import { parseArgs, die, say, warn, readJson, REPO_ROOT } from '../place/common.mjs'
import { buildRig } from '../place/rig-lib.mjs'
import { FIXTURE_DIR, readGeometry } from '../place/fixtures-glb.mjs'
import { applyProjectOps, normalizeProjectDocument } from '../../src/shared/projectSchema.js'
import { autoPatch } from '../../src/rigbuild/autoPatch.js'
import { typeById, typeIdOf } from '../../src/rigbuild/fixtureTypes.js'
import { lensFromMount } from '../../src/rigbuild/lampGeometry.js'
import { assignCircuits, patchCsv, powerCsv, renderSheetHtml, sheetModel } from '../../src/rigbuild/sheet.js'
import { loadLibrary } from './library.mjs'

const require = createRequire(import.meta.url)
const args = parseArgs()

export const PROJECT_ID = 'moxir-hall'

const words = (mount) => String(mount).replace(/-/g, ' ')

/** The MOXIR document with every lamp and effect typed, positioned and numbered. */
export const moxirDocument = ({ rig, hall, library }) => {
    const manifest = readJson(path.join(FIXTURE_DIR, 'fixtures.json'))
    const kinds = new Set([...Object.values(rig.classes).map((c) => c.fixture), ...(rig.effects || []).map((f) => f.fixture)])
    const geometry = Object.fromEntries([...kinds].map((k) => [k, readGeometry(k, path.join(FIXTURE_DIR, 'glb'))]))
    const built = buildRig(rig, hall, { geometry, manifest })
    const codeOfKind = Object.fromEntries(Object.entries(manifest.kinds).map(([k, v]) => [k, v.code]))
    const entities = []
    for (const entity of built.entities) {
        const m = /^rig-(.+)-(\d+)$/.exec(entity.id)
        const group = m && rig.groups.find((g) => g.id === m[1])
        if (!group || entity.type !== 'spotLight') { entities.push(entity); continue }
        const cls = rig.classes[group.class]
        const type = typeById(library, typeIdOf(cls.code))
        if (!type) throw new Error(`group ${group.id}: no type for ${cls.code}`)
        entities.push({
            ...entity,
            components: {
                ...entity.components,
                // the halo names its own position per group (src/rigbuild/looks.js namedPositionKey)
                fixture: { type: type.id, position: group.mount === 'halo' ? words(`halo-${group.id}`) : words(group.mount), unit: Number(m[2]), ...(group.orient === 'hung' ? { hung: true } : {}) }
            }
        })
    }
    // The effects: the rig hangs their bodies (built.fixtures) but makes no entity for
    // them; they are DMX devices all the same, so they get one each, at their mount.
    for (const fx of rig.effects || []) {
        const type = typeById(library, typeIdOf(codeOfKind[fx.fixture]))
        const bodies = built.fixtures.filter((f) => f.kind === fx.fixture && f.id.startsWith(`${fx.id}-`))
        bodies.forEach((body, i) => {
            const base = body.parts.Base || Object.values(body.parts)[0]
            const mount = new Vector3().setFromMatrixPosition(base).toArray()
            const up = new Vector3(0, 1, 0).transformDirection(new Matrix4().extractRotation(base))
            const hung = up.y < 0
            const lens = lensFromMount({ mount, hung, beam: up.toArray(), type })
            entities.push({
                id: `rig-${fx.id}-${String(i + 1).padStart(2, '0')}`,
                type: 'group',
                name: `${type.code} ${fx.label} ${i + 1}`,
                components: {
                    transform: { position: lens.map((v) => Math.round(v * 1000) / 1000), rotation: [0, 0, 0], scale: [1, 1, 1] },
                    fixture: { type: type.id, position: words(fx.mount), unit: i + 1, ...(hung ? { hung: true } : {}) }
                }
            })
        })
    }
    return { document: normalizeProjectDocument({ projectMeta: { title: rig.rig }, entities }), built }
}

// A throwaway desk, reached over HTTP like the Studio reaches the real one.
const throwawayDesk = async () => {
    const { createDesk } = require('../../serverXR/src/lighting/desk.js')
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moxir-desk-'))
    const desk = createDesk({ dataDir: dir, offline: true, outputEnabledDefault: false, log: () => {} })
    const server = http.createServer((q, r) => desk.handle(q, r))
    await new Promise((r) => server.listen(0, '127.0.0.1', r))
    const base = `http://127.0.0.1:${server.address().port}/`
    return {
        desk,
        post: (route, body) => fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
        close: () => { desk.close(); server.close(); fs.rmSync(dir, { recursive: true, force: true }) }
    }
}

/** Patch the document group by group, in the rig file's order; circuits after. */
export const patchMoxir = async ({ document, rig, library }) => {
    const desk = await throwawayDesk()
    let doc = document
    const flags = []
    try {
        const order = [...rig.groups.map((g) => g.id), ...(rig.effects || []).map((f) => f.id)]
        for (const id of order) {
            const members = doc.entities.filter((e) => e.id.startsWith(`rig-${id}-`) && e.components.fixture?.type)
            const out = await autoPatch({
                projectId: PROJECT_ID, entities: doc.entities, library, post: desk.post,
                applyOps: (ops) => { doc = applyProjectOps(doc, ops) },
                group: true, prune: false, only: new Set(members.map((e) => e.id))
            })
            if (!out.ok) throw new Error(`patching ${id}: ${out.message}`)
            flags.push(...(out.result?.flags || []))
        }
        doc = applyProjectOps(doc, assignCircuits({ entities: doc.entities, library }))
        return { document: doc, flags, deskFixtures: desk.desk.state.fixtures.length }
    } finally {
        desk.close()
    }
}

const main = async () => {
    const rigFile = path.resolve(String(args.rig || path.join(REPO_ROOT, 'scripts/place/rigs/moxir-2026-10-17.json')))
    const hallFile = args.hall ? path.resolve(String(args.hall)) : die('moxir.mjs needs --hall <hall.json> (written by scripts/place/hall.py).')
    const out = args.out ? path.resolve(String(args.out)) : die('moxir.mjs needs --out <dir>.')
    const rig = readJson(rigFile)
    const hall = readJson(hallFile)
    if (!rig || !hall?.geometry) die('could not read the rig or the hall.')
    const library = loadLibrary()
    const { document, built } = moxirDocument({ rig, hall, library })
    for (const why of built.summary.refused) warn(`  not hung (refused by the rig's own rules): ${why}`)
    const patched = await patchMoxir({ document, rig, library })
    const model = sheetModel({ entities: patched.document.entities, library })
    fs.mkdirSync(out, { recursive: true })
    const meta = {
        title: 'MOXIR 17.10 — patch sheet (PROPOSAL)',
        space: 'moxir', project: PROJECT_ID,
        generatedAt: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
        source: `Rig ${path.relative(REPO_ROOT, rigFile)}; hall ${hallFile}; patched on a throwaway desk by scripts/rigbuild/moxir.mjs.`
    }
    fs.writeFileSync(path.join(out, 'moxir-rig.document.json'), JSON.stringify(patched.document, null, 2))
    fs.writeFileSync(path.join(out, 'patch-sheet.html'), renderSheetHtml(model, meta))
    fs.writeFileSync(path.join(out, 'patch.csv'), patchCsv(model))
    fs.writeFileSync(path.join(out, 'power.csv'), powerCsv(model))
    say(`${rig.rig}: ${model.totals.lamps} fixtures, ${model.totals.patched} patched, ${model.totals.channels} channels`)
    for (const u of model.universes) say(`  U${u.universe}: ${u.ranges.map(([a, b]) => `${a}-${b}`).join(', ')}  (${u.lamps} fixtures, ${u.channels} ch, ${u.free} free)`)
    say(`  power ${(model.power.totalW / 1000).toFixed(1)} kW on ${model.power.circuits.length} circuits (load alone needs >= ${model.power.minCircuitsByLoad} at ${model.power.circuit.limitW} W)`)
    for (const [code, n] of Object.entries(model.flagCounts)) warn(`  flag ${code}: ${n}`)
    say(`  written to ${out}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
    main().catch((error) => die(error.stack || error.message))
}
