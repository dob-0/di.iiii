/**
 * versions-report.mjs — each rig version hung, typed, patched on a throwaway desk and
 * costed, offline. Called by `versions.mjs --report <dir>`. docs/architecture/RIG_BUILD.md §15.
 *
 * Per version, into <dir>/<id>/: report.json (fixtures, cost by the day rule with the
 * packages compared, power, universes, other-supplier lines, safety summary per look),
 * the patch sheet (HTML), patch.csv, power.csv and the typed document. The same functions
 * moxir.mjs runs for the base rig; nothing is sent to any di.iiii.
 */
import fs from 'node:fs'
import path from 'node:path'

import { readJson, say, REPO_ROOT } from '../place/common.mjs'
import { buildRig } from '../place/rig-lib.mjs'
import { FIXTURE_DIR, readGeometry } from '../place/fixtures-glb.mjs'
import { moxirDocument, patchMoxir } from './moxir.mjs'
import { loadLibrary } from './library.mjs'
import { patchCsv, powerCsv, renderSheetHtml, sheetModel } from '../../src/rigbuild/sheet.js'
import { libraryWithShow, RIG_SHOW_ID } from '../../src/rigbuild/rental.js'
import { allVersions, costing, powerOfList, rentalFileOf, rigFileOf, VERSIONS_FILE } from './versions.mjs'

export const DEFAULT_HALL = 'scripts/place/rigs/moxir-hall-2026-09-28.hall.json'

export const report = async ({ out, hallFile = null, only = null }) => {
    const spec = readJson(path.join(REPO_ROOT, VERSIONS_FILE))
    const hall = readJson(hallFile || path.join(REPO_ROOT, spec.hall || DEFAULT_HALL))
    const manifest = readJson(path.join(FIXTURE_DIR, 'fixtures.json'))
    const geometry = Object.fromEntries(Object.keys(manifest.kinds).map((k) => [k, readGeometry(k)]))
    const baseLibrary = loadLibrary()
    const all = []
    // `only`: the version ids to report (a comparison variant alone, say); default every version,
    // variant and candidate (the halo's report used --only; the X's report took them all)
    for (const v of allVersions(spec).filter((x) => (only ? only.includes(x.id) : true))) {
        const rig = readJson(path.join(REPO_ROOT, rigFileOf(spec.set, v.id)))
        const { rentalList: list } = readJson(path.join(REPO_ROOT, rentalFileOf(spec.set, v.id)))
        const library = libraryWithShow(baseLibrary, list)
        const { document, built } = moxirDocument({ rig, hall, library })
        const patched = await patchMoxir({ document, rig, library })
        const entities = [...patched.document.entities, { id: RIG_SHOW_ID, type: 'group', components: { rentalList: list } }]
        const sheet = sheetModel({ entities, library })
        const looks = Object.keys(rig.looks).map((look) => {
            const s = buildRig(rig, hall, { geometry, manifest, look }).summary
            return { id: look, title: rig.looks[look].title, intent: rig.looks[look].intent, refused: s.refused, clashes: s.clashes, unreachable: s.unreachable, real: s.real }
        })
        const lasers = patched.document.entities.filter((e) => e.components?.fixture?.type === 'up-la40wf')
        const r = {
            id: v.id, title: v.title, summary: v.summary, set: spec.set,
            rigFile: rigFileOf(spec.set, v.id), rentalFile: rentalFileOf(spec.set, v.id),
            fixtures: built.summary.fixtures, effects: built.summary.effects, real: built.summary.real,
            lines: list.items.map((i) => ({ code: i.code, label: i.label, ordered: i.ordered, rate: i.rate ?? null, from: i.from || 'rental', note: i.note || '' })),
            cost: costing({ spec, list }),
            power: { ...powerOfList(list, library), placedW: sheet.power.totalW, circuits: sheet.power.circuits.length, minCircuitsByLoad: sheet.power.minCircuitsByLoad, circuitLimitW: sheet.power.circuit.limitW },
            universes: sheet.universes.map((u) => ({ universe: u.universe, lamps: u.lamps, channels: u.channels, free: u.free })),
            patch: { lamps: sheet.totals.lamps, patched: sheet.totals.patched, channels: sheet.totals.channels, deskFixtures: patched.deskFixtures, flags: sheet.flagCounts, modeOwed: sheet.rows.filter((row) => (row.flags || []).includes('mode-unknown')).map((row) => row.code).reduce((m, c) => ({ ...m, [c]: (m[c] || 0) + 1 }), {}) },
            lasers: lasers.map((e) => ({ id: e.id, y: e.components.transform.position[1] })),
            looks,
            other: spec.otherSuppliers
        }
        const dir = path.join(out, v.id)
        fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(path.join(dir, 'report.json'), `${JSON.stringify(r, null, 2)}\n`)
        fs.writeFileSync(path.join(dir, `${v.id}.document.json`), JSON.stringify(patched.document, null, 2))
        fs.writeFileSync(path.join(dir, 'patch-sheet.html'), renderSheetHtml(sheet, { title: `${rig.rig} — patch sheet (PROPOSAL)`, space: 'moxir', project: `moxir-hall-${v.id}`, generatedAt: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC', source: `${r.rigFile}; patched on a throwaway desk by scripts/rigbuild/versions-report.mjs.` }))
        fs.writeFileSync(path.join(dir, 'patch.csv'), patchCsv(sheet))
        fs.writeFileSync(path.join(dir, 'power.csv'), powerCsv(sheet))
        const best = r.cost.options.find((o) => o.id === r.cost.best)
        say(`${v.id.padEnd(8)} ${r.fixtures} lamps · à la carte ${r.cost.options[0].perDay.toLocaleString('en')} AMD/day · best ${best.label}: ${best.perDay.toLocaleString('en')} · ${(r.power.watts / 1000).toFixed(1)} kW · U ${r.universes.map((u) => `${u.universe}:${u.channels}ch`).join(' ')} · patched ${r.patch.patched}/${r.patch.lamps}`)
        all.push(r)
    }
    fs.writeFileSync(path.join(out, 'versions.json'), `${JSON.stringify(all, null, 2)}\n`)
    return all
}
